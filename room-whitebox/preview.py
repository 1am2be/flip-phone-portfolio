from argparse import ArgumentParser
from ipaddress import ip_address
import os
from pathlib import Path
from socketserver import ThreadingMixIn
from threading import Thread
import webbrowser
from wsgiref.simple_server import WSGIServer, make_server

from pixel_server import MAX_REQUEST, ROOT, PixelApplication, PixelWall


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def create_app():
    database = Path(os.environ.get("PIXEL_ME_DB_PATH") or ROOT.parent / ".pixel-me-data" / "wall.sqlite3").resolve()
    if database.is_relative_to(ROOT):
        raise ValueError("PIXEL_ME_DB_PATH must be outside the website directory.")
    return PixelApplication(PixelWall(
        database,
        os.environ.get("OPENAI_API_KEY", "").strip(),
        os.environ.get("OPENAI_IMAGE_MODEL", "").strip() or "gpt-image-2.5-sunburst",
    ))


def main():
    parser = ArgumentParser(description="Serve 00s Room and the PIXEL ME API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--production", action="store_true", help="Serve with Waitress behind the host's HTTPS proxy.")
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost"} and not args.production:
        parser.error("Use --production when binding outside the loopback interface.")
    try:
        app = create_app()
    except ValueError as error:
        parser.error(str(error))
    print(f"PIXEL ME: {'OpenAI image generation enabled' if app.wall.api_key else 'sample preview; no OpenAI API key'}", flush=True)

    if args.production:
        from waitress import serve

        proxy = os.environ.get("PIXEL_ME_TRUSTED_PROXY", "").strip()
        options = {}
        if proxy:
            try:
                options = {"trusted_proxy": str(ip_address(proxy)), "trusted_proxy_headers": {"x-forwarded-for"}}
            except ValueError:
                parser.error("PIXEL_ME_TRUSTED_PROXY must be the IP of the HTTPS reverse proxy.")
        serve(
            app, host=args.host, port=args.port or 8080, threads=8,
            max_request_body_size=MAX_REQUEST, inbuf_overflow=MAX_REQUEST + 1,
            channel_timeout=210, **options,
        )
        return

    with make_server(args.host, args.port, app, server_class=LocalServer) as server:
        url = f"http://{args.host}:{server.server_port}/"
        print(f"00s Room preview: {url}", flush=True)
        print("Close this window to stop the preview.", flush=True)
        if not args.no_browser:
            Thread(target=webbrowser.open, args=(url,), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
