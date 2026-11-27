import { mountPixelMe } from "./pixel-me.js";

const photoLabels = [
  "镜中人物与复古陈设",
  "灯光下的复古梳妆台",
  "店内陈列的刺绣服装",
  "旧式木柜与桌上的茶具",
  "绿水上行驶的乌篷船",
  "从树下仰望绿色树冠",
  "从高处俯拍的城市小巷",
];

export function mountDeskPanels() {
  const pixelMe = mountPixelMe();
  const notebook = document.querySelector("#resumePanel");
  const book = notebook.querySelector(".resume-scroll");
  const resumeImage = notebook.querySelector(".resume-page");
  const zoomOut = notebook.querySelector('[data-zoom="out"]');
  const zoomIn = notebook.querySelector('[data-zoom="in"]');
  const camera = document.querySelector("#cameraPanel");
  const screen = camera.querySelector(".camera-screen");
  const photo = camera.querySelector(".camera-photo");
  const count = camera.querySelector(".camera-count");
  const thumbs = camera.querySelector(".camera-thumbs");
  const cameraClose = camera.querySelector("[data-close]");
  let selectedPhoto = 0;
  let zoom = 1;
  let startTouch = null;
  let swiped = false;
  let opener = null;

  const photos = photoLabels.map((label, index) => ({
    label,
    src: new URL(`./assets/photography/${String(index + 1).padStart(2, "0")}.jpg`, import.meta.url).href,
  }));

  function zoomResume(next) {
    const readingX = (book.scrollLeft + book.clientWidth / 2) / Math.max(1, book.scrollWidth);
    const readingY = book.scrollTop / Math.max(1, book.scrollHeight);
    zoom = Math.max(1, Math.min(2.5, next));
    book.style.setProperty("--resume-zoom", zoom);
    book.scrollLeft = zoom === 1 ? 0 : readingX * book.scrollWidth - book.clientWidth / 2;
    book.scrollTop = readingY * book.scrollHeight;
    zoomOut.disabled = zoom <= 1;
    zoomIn.disabled = zoom >= 2.5;
  }

  notebook.querySelector("[data-close]").addEventListener("click", () => notebook.close());
  zoomOut.addEventListener("click", () => zoomResume(zoom / 1.25));
  zoomIn.addEventListener("click", () => zoomResume(zoom * 1.25));
  notebook.querySelector('[data-zoom="reset"]').addEventListener("click", () => zoomResume(1));
  resumeImage.addEventListener("error", () => {
    resumeImage.alt = "简历预览加载失败，请使用下方按钮下载 PDF";
  });

  function showPhoto(index) {
    selectedPhoto = (index + photos.length) % photos.length;
    const item = photos[selectedPhoto];
    photo.alt = item.label;
    photo.src = item.src;
    count.value = `${selectedPhoto + 1} / ${photos.length}`;
    for (const [i, thumb] of [...thumbs.children].entries()) {
      if (i === selectedPhoto) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    }
    const active = thumbs.children[selectedPhoto];
    if (active && !camera.classList.contains("is-enlarged")) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function createThumbnails() {
    photos.forEach((item, index) => {
      const thumbnail = document.createElement("button");
      thumbnail.type = "button";
      thumbnail.setAttribute("aria-label", `第 ${index + 1} 张，${item.label}`);
      const image = document.createElement("img");
      image.alt = "";
      image.src = item.src;
      image.loading = "lazy";
      thumbnail.append(image);
      thumbnail.addEventListener("click", () => showPhoto(index));
      thumbs.append(thumbnail);
    });
  }

  function setEnlarged(enlarged) {
    camera.classList.toggle("is-enlarged", enlarged);
    screen.setAttribute("aria-pressed", String(enlarged));
    screen.setAttribute("aria-label", enlarged ? "退出放大" : "放大照片");
    cameraClose.textContent = enlarged ? "返回相册" : "关闭";
  }

  function closeCamera() {
    if (camera.classList.contains("is-enlarged")) setEnlarged(false);
    else camera.close();
  }

  screen.addEventListener("click", (event) => {
    if (swiped && event.detail !== 0) {
      swiped = false;
      return;
    }
    setEnlarged(!camera.classList.contains("is-enlarged"));
  });
  screen.addEventListener("pointerdown", (event) => {
    swiped = false;
    if (event.pointerType === "touch") startTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  screen.addEventListener("pointerup", (event) => {
    if (startTouch?.id !== event.pointerId) return;
    const dx = event.clientX - startTouch.x;
    const dy = event.clientY - startTouch.y;
    startTouch = null;
    if (Math.abs(dx) < 32 || Math.abs(dx) <= Math.abs(dy)) return;
    swiped = true;
    showPhoto(selectedPhoto + (dx < 0 ? 1 : -1));
  });
  screen.addEventListener("pointercancel", () => { startTouch = null; });
  for (const step of camera.querySelectorAll("[data-photo-step]")) {
    step.addEventListener("click", () => showPhoto(selectedPhoto + Number(step.dataset.photoStep)));
  }
  camera.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    showPhoto(selectedPhoto + (event.key === "ArrowRight" ? 1 : -1));
  });
  cameraClose.addEventListener("click", closeCamera);
  camera.addEventListener("cancel", (event) => {
    if (!camera.classList.contains("is-enlarged")) return;
    event.preventDefault();
    setEnlarged(false);
  });

  for (const panel of [notebook, camera]) {
    panel.addEventListener("close", () => {
      opener?.focus({ preventScroll: true });
      opener = null;
    });
  }

  function show(device, trigger) {
    if (device === "computer") {
      pixelMe.show(trigger);
      return true;
    }
    if (device === "notebook") {
      opener = trigger;
      notebook.showModal();
      if (!resumeImage.hasAttribute("src")) resumeImage.src = "./assets/resume.png";
      zoomResume(1);
      book.scrollTop = 0;
      return true;
    }
    if (device === "camera") {
      opener = trigger;
      setEnlarged(false);
      camera.showModal();
      if (!thumbs.children.length) createThumbnails();
      showPhoto(0);
      return true;
    }
    return false;
  }

  return { show, get open() { return notebook.open || camera.open || pixelMe.open; } };
}

