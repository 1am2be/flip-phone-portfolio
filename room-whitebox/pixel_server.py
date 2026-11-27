import base64
from collections import deque
from contextlib import closing
from hashlib import sha256
import hmac
from http import HTTPStatus
from io import BytesIO
import json
import mimetypes
from pathlib import Path
import re
import secrets
import sqlite3
from threading import BoundedSemaphore, Lock
import time
from unicodedata import category
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "assets" / "pixel-me-sample.png"
API_PATH = "/api/pixel-me"
AVATAR_SIZE = (192, 240)
MAX_REQUEST = 4 * 1024 * 1024
RECEIPT_TTL = 2 * 60 * 60
PAGE_SIZE = 36
ID_PATTERN = re.compile(r"[0-9a-f]{32}")
STATIC_TYPES = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".pdf"}

STYLE_PROMPT = """
Turn the single main person in image 1 (the visitor's photo) into a detailed
early-2000s dress-up pixel-art character for a flip-phone portrait.
Image 2 is a style example only. Match its stepped dark outline, large expressive
pixel eyes, carefully placed eye highlights, block-shaded hair, warm textile
detail, restrained shading and chibi proportions. Preserve the visitor's own
visible skin tone, hair, facial traits and clothing; use the visitor's requested
specific appearance or clothing changes only for those details. Do not transfer
the example character's identity, hair, accessories or clothing to the visitor.
Use a single upright, centered figure; include the head and hair with a small
clear margin. Frame to the waist by default. When the visitor specifies trousers,
jeans, a skirt or other lower garments, show down to upper thighs so the
waistband and garment silhouette are visible. Keep image 1's identifiable
details visible at icon size. Use crisp square pixel clusters, never a
generic low-detail sprite or a smooth vector illustration. Output a real
transparent background, only the person. No surrounding scene, props, text,
checkerboard, frame, ground shadow, or other figures.
""".strip()


class PixelError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def encoded(data):
    return base64.b64encode(data).decode("ascii")


def decode_field(data, message):
    try:
        return base64.b64decode(data, validate=True)
    except (TypeError, ValueError):
        raise PixelError(400, message) from None


def normalize_photo(raw):
    try:
        with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as image:
            if image.width * image.height > 16_000_000:
                raise ValueError("Oversize input")
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, "JPEG", quality=91)
            return output.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError):
        raise PixelError(400, "无法读取照片，请选择清晰的 JPG、PNG 或 WebP。") from None


def normalize_avatar(raw):
    with Image.open(BytesIO(raw), formats=["PNG"]) as source:
        if source.width * source.height > 10_000_000:
            raise ValueError("Oversize avatar")
        image = source.convert("RGBA")
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value >= 32 else 0).getbbox()
    if bounds is None or alpha.getextrema()[0] == 255:
        raise ValueError("The avatar must have a transparent background")
    figure = image.crop(bounds)
    width, height = AVATAR_SIZE
    figure = ImageOps.contain(figure, (width - 16, height - 16), Image.Resampling.NEAREST)
    avatar = Image.new("RGBA", AVATAR_SIZE)
    avatar.paste(figure, ((width - figure.width) // 2, height - figure.height - 8))
    output = BytesIO()
    avatar.save(output, "PNG", optimize=True)
    return output.getvalue()


def request_avatar(api_key, model, photo, description):
    boundary = secrets.token_hex(24)
    prompt = STYLE_PROMPT + "\nVisitor appearance/clothing notes: " + json.dumps(description, ensure_ascii=False)
    fields = {
        "model": model,
        "prompt": prompt,
        "size": "1024x1536",
        "quality": "medium",
        "background": "transparent",
        "output_format": "png",
    }
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        for name, value in fields.items()
    ]
    for name, content_type, contents in [
        ("visitor.jpg", "image/jpeg", photo),
        ("style.png", "image/png", SAMPLE.read_bytes()),
    ]:
        parts.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="{name}"\r\n'
            f'Content-Type: {content_type}\r\n\r\n'.encode(),
            contents,
            b"\r\n",
        ])
    parts.append(f"--{boundary}--\r\n".encode())
    request = Request(
        "https://api.openai.com/v1/images/edits",
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urlopen(request, timeout=180) as response:
            payload = json.loads(response.read(16 * 1024 * 1024))
        return normalize_avatar(base64.b64decode(payload["data"][0]["b64_json"], validate=True))
    except HTTPError as error:
        with error:
            if error.code in (401, 403, 404):
                raise PixelError(503, "图像服务暂未就绪，请稍后再试。") from None
            if error.code == 429:
                raise PixelError(429, "图像服务正忙，请稍后再试。") from None
            if error.code == 400:
                raise PixelError(422, "这张照片或描述未能生成小人，请调整后重试。") from None
        raise PixelError(502, "图像服务暂时不可用，请重试。") from None
    except (URLError, TimeoutError):
        raise PixelError(502, "图像服务暂时不可用，请重试。") from None
    except (KeyError, IndexError, TypeError, ValueError, OSError, Image.DecompressionBombError):
        raise PixelError(502, "这次没有得到可用的透明小人，请重试。") from None


class PixelWall:
    def __init__(self, database, api_key, model):
        self.database = database
        self.api_key = api_key
        self.model = model
        self.workers = BoundedSemaphore(2)
        self.rate_lock = Lock()
        self.recent_requests = deque()
        database.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS entries (
                    position INTEGER PRIMARY KEY,
                    id TEXT NOT NULL UNIQUE,
                    nickname TEXT NOT NULL,
                    image BLOB NOT NULL
                );
            """)
            db.execute("INSERT OR IGNORE INTO settings VALUES ('signing_key', ?)", (secrets.token_bytes(32),))
            self.signing_key = db.execute("SELECT value FROM settings WHERE key = 'signing_key'").fetchone()[0]

    def connect(self):
        connection = sqlite3.connect(self.database, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def sign(self, image_id, expiry, image):
        digest = sha256(image).hexdigest()
        return hmac.new(self.signing_key, f"{image_id}.{expiry}.{digest}".encode(), sha256).hexdigest()

    def generate(self, data, visitor):
        if not self.api_key:
            raise PixelError(503, "真实生成暂未启用，可以先体验样图。")
        description = data.get("description", "")
        if not isinstance(description, str) or len(description) > 140:
            raise PixelError(400, "穿搭描述请控制在 140 字以内。")
        if any(category(char) == "Cs" for char in description):
            raise PixelError(400, "穿搭描述包含无法读取的字符。")
        photo = decode_field(data.get("photo"), "照片格式有误，请重新选择。")
        if not self.workers.acquire(blocking=False):
            raise PixelError(429, "有其他小人正在生成，请稍后再试。")
        try:
            photo = normalize_photo(photo)
            now = time.monotonic()
            with self.rate_lock:
                while self.recent_requests and now - self.recent_requests[0][0] >= 300:
                    self.recent_requests.popleft()
                if sum(address == visitor for _, address in self.recent_requests) >= 8:
                    raise PixelError(429, "短时间内生成次数较多，请稍后再试。")
                self.recent_requests.append((now, visitor))
            image = request_avatar(self.api_key, self.model, photo, description.strip())
        finally:
            self.workers.release()
        image_id = secrets.token_hex(16)
        expiry = int(time.time()) + RECEIPT_TTL
        receipt = f"{image_id}.{expiry}.{self.sign(image_id, expiry, image)}"
        return {"image": encoded(image), "receipt": receipt}

    def publish(self, data):
        nickname = data.get("nickname", "")
        if not isinstance(nickname, str) or len(nickname.strip()) > 20:
            raise PixelError(400, "昵称请控制在 20 字以内。")
        nickname = nickname.strip()
        if any(category(char) in ("Cc", "Cs") for char in nickname):
            raise PixelError(400, "昵称不能包含控制字符。")
        receipt = data.get("receipt")
        if not isinstance(receipt, str) or len(receipt) > 120:
            raise PixelError(400, "找不到这张小人的生成记录，请重新生成。")
        parts = receipt.split(".")
        if len(parts) != 3 or not ID_PATTERN.fullmatch(parts[0]) or not re.fullmatch(r"[0-9]{1,12}", parts[1]):
            raise PixelError(400, "找不到这张小人的生成记录，请重新生成。")
        image_id, expiry, signature = parts
        image = decode_field(data.get("image"), "小人图片有误，请重新生成。")
        if not re.fullmatch(r"[0-9a-f]{64}", signature) or not hmac.compare_digest(signature, self.sign(image_id, expiry, image)):
            raise PixelError(400, "找不到这张小人的生成记录，请重新生成。")
        with closing(self.connect()) as db, db:
            if int(expiry) < int(time.time()):
                entry = db.execute("SELECT position, id, nickname FROM entries WHERE id = ?", (image_id,)).fetchone()
                if entry is None:
                    raise PixelError(410, "这张小人的发布预览已过期，请重新生成。")
                return dict(entry)
            db.execute("INSERT OR IGNORE INTO entries (id, nickname, image) VALUES (?, ?, ?)", (image_id, nickname, image))
            entry = db.execute("SELECT position, id, nickname FROM entries WHERE id = ?", (image_id,)).fetchone()
            return dict(entry)

    def list_entries(self, after):
        with closing(self.connect()) as db:
            rows = db.execute(
                "SELECT position, id, nickname FROM entries WHERE position > ? ORDER BY position LIMIT ?",
                (after, PAGE_SIZE + 1),
            ).fetchall()
        return {
            "entries": [dict(row) for row in rows[:PAGE_SIZE]],
            "next": rows[PAGE_SIZE - 1]["position"] if len(rows) > PAGE_SIZE else None,
        }

    def image(self, image_id):
        with closing(self.connect()) as db:
            entry = db.execute("SELECT image FROM entries WHERE id = ?", (image_id,)).fetchone()
        return entry["image"] if entry else None


class PixelApplication:
    def __init__(self, wall):
        self.wall = wall

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "/")
        method = environ["REQUEST_METHOD"]
        etag = None
        try:
            if path.startswith(API_PATH + "/"):
                status, content_type, content, cache = self.api(path.removeprefix(API_PATH), method, environ)
            elif method in ("GET", "HEAD"):
                status, content_type, content, cache, etag = self.static(path, environ.get("HTTP_IF_NONE_MATCH"))
            else:
                raise PixelError(405, "该地址只支持读取。")
        except PixelError as error:
            status, content_type, content, cache = self.json(error.status, {"error": str(error)})
        except (OSError, sqlite3.Error):
            status, content_type, content, cache = self.json(503, {"error": "服务暂时不可用，请稍后再试。"})

        headers = [
            ("Cache-Control", cache),
            ("X-Content-Type-Options", "nosniff"),
        ]
        if status != 304:
            headers.extend([("Content-Type", content_type), ("Content-Length", str(len(content)))])
        if etag is not None:
            headers.append(("ETag", etag))
        start_response(f"{status} {HTTPStatus(status).phrase}", headers)
        return [] if method == "HEAD" or status == 304 else [content]

    @staticmethod
    def json(status, payload):
        return status, "application/json; charset=utf-8", json.dumps(payload, ensure_ascii=False).encode(), "no-store"

    @staticmethod
    def read_json(environ):
        if environ.get("CONTENT_TYPE", "").split(";", 1)[0].strip() != "application/json":
            raise PixelError(415, "请求格式有误。")
        try:
            length = int(environ.get("CONTENT_LENGTH") or "0")
        except ValueError:
            raise PixelError(400, "请求格式有误。") from None
        if not 0 < length <= MAX_REQUEST:
            raise PixelError(413, "图片较大，请改用较小的照片。")
        try:
            payload = json.loads(environ["wsgi.input"].read(length))
            if not isinstance(payload, dict):
                raise ValueError("Expected an object")
            return payload
        except (ValueError, TimeoutError, RecursionError):
            raise PixelError(400, "请求格式有误。") from None

    def api(self, path, method, environ):
        if method == "POST":
            if path == "/generate":
                return self.json(200, self.wall.generate(self.read_json(environ), environ.get("REMOTE_ADDR", "")))
            if path == "/wall":
                return self.json(200, self.wall.publish(self.read_json(environ)))
            raise PixelError(404, "找不到该操作。")
        if method not in ("GET", "HEAD"):
            raise PixelError(405, "该操作不支持此请求方式。")
        if path == "/status":
            return self.json(200, {"generationEnabled": bool(self.wall.api_key)})
        if path == "/wall":
            after = parse_qs(environ.get("QUERY_STRING", "")).get("after", ["0"])[0]
            if not re.fullmatch(r"[0-9]{1,18}", after):
                raise PixelError(400, "合照页码无效。")
            return self.json(200, self.wall.list_entries(int(after)))
        image_id = path.removeprefix("/wall/")
        if path.startswith("/wall/") and ID_PATTERN.fullmatch(image_id):
            image = self.wall.image(image_id)
            if image is not None:
                return 200, "image/png", image, "public, max-age=86400"
        raise PixelError(404, "找不到该内容。")

    @staticmethod
    def static_target(path):
        name = {"/": "index.html", "/phone/": "phone/index.html"}.get(path, path.lstrip("/"))
        if "\\" in name or any(part.startswith(".") for part in name.split("/")):
            raise PixelError(404, "找不到该文件。")
        target = (ROOT / name).resolve()
        if not target.is_relative_to(ROOT) or target.suffix.lower() not in STATIC_TYPES or not target.is_file():
            raise PixelError(404, "找不到该文件。")
        return target

    def static(self, path, if_none_match):
        target = self.static_target(path)
        stat = target.stat()
        etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
        if if_none_match == etag:
            return 304, "", b"", "no-cache", etag
        mime_type = "text/javascript" if target.suffix == ".js" else mimetypes.guess_type(target.name)[0]
        return 200, mime_type or "application/octet-stream", target.read_bytes(), "no-cache", etag
