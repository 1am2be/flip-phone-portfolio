const api = "./api/pixel-me";
const sample = "./assets/pixel-me-sample.png";
const sampleAlt = "长直发、斜刘海和玫粉上衣的像素小人样图";
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const photoHint = "JPG、PNG 或 WebP。请选择一张自己的照片。";

async function readApi(path, options) {
  const response = await fetch(api + path, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("暂时连接不上服务，请重试。");
  }
  if (!response.ok) throw new Error(payload.error || "服务暂时不可用，请重试。");
  return payload;
}

function postApi(path, body, signal) {
  return readApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function preparePhoto(photo) {
  const scale = Math.min(1, 1536 / Math.max(photo.naturalWidth, photo.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .91).split(",")[1];
}

export function mountPixelMe() {
  const panel = document.querySelector("#pixelMePanel");
  const find = (selector) => panel.querySelector(selector);
  const create = find("#pixelCreate");
  const wall = find("#pixelWall");
  const scroll = find(".pixel-me-scroll");
  const [createTab, wallTab] = panel.querySelectorAll("[data-pixel-view]");
  const fileInput = find("#pixelPhotoFile");
  const photo = find("[data-pixel-photo]");
  const photoPlaceholder = find("[data-photo-placeholder]");
  const photoStatus = find("[data-pixel-photo-status]");
  const description = find("#pixelDescription");
  const privacy = find("[data-pixel-privacy]");
  const dataPolicy = find("[data-pixel-data]");
  const generate = find("[data-pixel-generate]");
  const demo = find("[data-pixel-demo]");
  const avatarFrame = find(".pixel-me-frame--avatar");
  const avatar = find("[data-pixel-avatar]");
  const result = find("[data-pixel-result]");
  const resultStatus = find("[data-pixel-result-status]");
  const resultActions = find("[data-pixel-result-actions]");
  const download = find("[data-pixel-download]");
  const publish = find("[data-pixel-publish]");
  const confirmation = find("[data-pixel-confirm]");
  const nickname = find("#pixelNickname");
  const previewName = find("[data-pixel-post-name]");
  const postAvatar = find("[data-pixel-post-avatar]");
  const postNote = find("[data-pixel-post-note]");
  const postStatus = find("[data-pixel-post-status]");
  const cancelPublish = find("[data-pixel-cancel]");
  const confirmPublish = find("[data-pixel-confirm-add]");
  const group = find("[data-pixel-group]");
  const wallStatus = find("[data-pixel-wall-status]");
  const more = find("[data-pixel-wall-more]");
  const wallEntries = new Map();
  const ownIds = new Set();
  let generationEnabled = null;
  let opener = null;
  let photoUrl = null;
  let generation = null;
  let currentResult = null;
  let wallRequest = null;
  let nextPage = null;
  let wallRetry = false;
  let latestEntry = null;
  let demoEntry = null;
  let wallMessage = "";

  function updateGenerator() {
    generate.hidden = generationEnabled === false;
    generate.disabled = generationEnabled !== true || photo.hidden;
    demo.hidden = generationEnabled !== false;
    generate.setAttribute("aria-disabled", String(Boolean(generation)));
    avatarFrame.setAttribute("aria-busy", String(Boolean(generation)));
    privacy.textContent = generationEnabled === false
      ? "体验使用画风样图。照片和穿搭描述只留在当前页面。"
      : "生成时照片会发送给 OpenAI 处理，本站不存原照。你确认上墙后，小人和昵称才会公开。";
    dataPolicy.hidden = generationEnabled !== true;
  }

  function initialResultMessage() {
    return generationEnabled === false
      ? "可以先体验样图和昵称预览。"
      : "画风示例。选择照片可以生成你自己的小人。";
  }

  async function updateConfiguration() {
    try {
      const config = await readApi("/status");
      generationEnabled = config.generationEnabled === true;
    } catch {
      generationEnabled = false;
    }
    updateGenerator();
    if (!currentResult && !generation) resultStatus.textContent = initialResultMessage();
  }

  function resetResult() {
    generation?.abort();
    generation = null;
    currentResult = null;
    avatar.src = sample;
    avatar.alt = sampleAlt;
    resultStatus.textContent = initialResultMessage();
    resultActions.hidden = true;
    confirmation.hidden = true;
    postAvatar.removeAttribute("src");
    download.removeAttribute("href");
    generate.textContent = "生成小人";
    publish.disabled = false;
    publish.textContent = "加入合照";
    updateGenerator();
  }

  function releasePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    photo.removeAttribute("src");
    photo.hidden = true;
    photoPlaceholder.hidden = false;
    photoStatus.textContent = photoHint;
    updateGenerator();
  }

  async function previewPhoto(file) {
    releasePhoto();
    resetResult();
    if (!acceptedTypes.has(file.type) && (file.type || !/\.(jpe?g|png|webp)$/i.test(file.name))) {
      photoStatus.textContent = "请选择 JPG、PNG 或 WebP 照片。";
      return;
    }
    const url = URL.createObjectURL(file);
    photoUrl = url;
    photo.src = url;
    photoStatus.textContent = "正在读取照片…";
    try {
      await photo.decode();
    } catch {
      if (photoUrl === url) {
        releasePhoto();
        photoStatus.textContent = "这张照片无法读取，请重新选择。";
      }
      return;
    }
    if (photoUrl !== url) return;
    photo.hidden = false;
    photoPlaceholder.hidden = true;
    photoStatus.textContent = "照片已就绪。";
    updateGenerator();
  }

  function showResult(entry) {
    currentResult = entry;
    avatar.src = entry.src;
    avatar.alt = entry.receipt ? "根据你的照片生成的像素小人" : sampleAlt;
    download.href = entry.src;
    resultActions.hidden = false;
    resultStatus.textContent = entry.receipt
      ? "小人已生成，可以下载或加入合照。"
      : "这是画风样图，可以体验下载和填写昵称。";
    if (!create.hidden && [generate, demo].includes(document.activeElement)) {
      download.focus({ preventScroll: true });
      result.scrollIntoView({ block: "nearest" });
    }
  }

  async function generatePortrait() {
    if (generate.disabled || generation) return;
    resetResult();
    const request = new AbortController();
    generation = request;
    generate.textContent = "生成中…";
    resultStatus.textContent = "正在绘制你的小人，请稍等。";
    updateGenerator();
    try {
      const payload = await postApi("/generate", {
        photo: preparePhoto(photo),
        description: description.value.trim(),
      }, request.signal);
      if (generation !== request) return;
      showResult({ ...payload, src: "data:image/png;base64," + payload.image });
      generate.textContent = "重新生成";
    } catch (error) {
      if (generation !== request) return;
      resultStatus.textContent = error instanceof TypeError ? "暂时连接不上生成服务，请重试。" : error.message;
      generate.textContent = "重试";
    } finally {
      if (generation === request) {
        generation = null;
        updateGenerator();
      }
    }
  }

  function makeTile({ src, nickname: label, own, id, note }) {
    const tile = document.createElement("li");
    tile.classList.toggle("pixel-me-group-own", Boolean(own));
    if (id) tile.dataset.post = id;
    const image = document.createElement("img");
    image.width = 192;
    image.height = 240;
    image.loading = "lazy";
    image.src = src;
    image.alt = own ? "你加入的小人" : "合照中的像素小人";
    tile.append(image);
    if (label || note) {
      const caption = document.createElement("span");
      caption.className = "pixel-me-caption";
      caption.textContent = label || note;
      tile.append(caption);
    }
    return tile;
  }

  function renderWall() {
    const visible = [...wallEntries.values()];
    if (latestEntry && !wallEntries.has(latestEntry.id)) visible.push(latestEntry);
    visible.sort((first, second) => first.position - second.position);
    const tiles = visible.map((entry) => makeTile({
      ...entry,
      src: api + "/wall/" + entry.id,
      own: ownIds.has(entry.id),
    }));
    if (!visible.length && !demoEntry) tiles.push(makeTile({ src: sample, note: "画风样图" }));
    if (demoEntry) tiles.push(makeTile(demoEntry));
    group.replaceChildren(...tiles);
    wallStatus.textContent = wallMessage || (visible.length ? "" : "还没有访客加入公开合照。");
    wallStatus.hidden = !wallStatus.textContent;
  }

  async function loadWall(reset) {
    if (!reset && nextPage === null) return;
    wallRequest?.abort();
    const request = new AbortController();
    wallRequest = request;
    more.disabled = true;
    more.hidden = true;
    renderWall();
    try {
      const listing = await readApi("/wall?after=" + (reset ? 0 : nextPage), { signal: request.signal });
      if (wallRequest !== request) return;
      if (reset) wallEntries.clear();
      for (const entry of listing.entries) wallEntries.set(entry.id, entry);
      nextPage = listing.next;
      wallRetry = false;
      more.textContent = "查看更多";
      more.hidden = nextPage === null;
    } catch {
      if (wallRequest !== request) return;
      if (!wallMessage) wallMessage = "暂时读不到公开合照，请重试。";
      wallRetry = reset;
      more.textContent = "重试";
      more.hidden = false;
    } finally {
      if (wallRequest === request) {
        wallRequest = null;
        more.disabled = false;
        renderWall();
      }
    }
  }

  function setView(creating) {
    create.hidden = !creating;
    wall.hidden = creating;
    confirmation.hidden = true;
    createTab.setAttribute("aria-pressed", String(creating));
    wallTab.setAttribute("aria-pressed", String(!creating));
    scroll.scrollTop = 0;
    if (!creating) void loadWall(true);
  }

  function syncNickname() {
    previewName.textContent = nickname.value.trim();
    previewName.hidden = !previewName.textContent;
  }

  function setPosting(posting) {
    nickname.disabled = posting;
    cancelPublish.disabled = posting;
    confirmPublish.disabled = posting;
    confirmPublish.textContent = posting ? "正在加入…" : "确认加入";
  }

  async function postPortrait(event) {
    event.preventDefault();
    const entry = currentResult;
    if (!entry || entry.published || entry.posting || confirmation.hidden) return;
    entry.posting = true;
    setPosting(true);
    postStatus.hidden = true;
    const name = nickname.value.trim();
    try {
      if (entry.receipt) {
        latestEntry = await postApi("/wall", { receipt: entry.receipt, image: entry.image, nickname: name });
        ownIds.add(latestEntry.id);
        wallMessage = "你的小人已加入公开合照。";
      } else {
        demoEntry = { src: entry.src, nickname: name, note: "本页演示", own: true };
        wallMessage = "样图和昵称仅在当前页面预览。";
      }
      entry.published = true;
      if (currentResult !== entry) return;
      publish.disabled = true;
      publish.textContent = "已加入合照";
      setView(false);
      wallTab.focus({ preventScroll: true });
      group.querySelector(".pixel-me-group-own:last-child")?.scrollIntoView({ block: "nearest" });
    } catch (error) {
      if (currentResult !== entry) return;
      postStatus.textContent = error instanceof TypeError ? "暂时连接不上合照服务，请重试。" : error.message;
      postStatus.hidden = false;
    } finally {
      entry.posting = false;
      if (currentResult === entry) setPosting(false);
    }
  }

  for (const picker of panel.querySelectorAll("[data-pixel-pick]")) {
    picker.addEventListener("click", () => fileInput.click());
  }
  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (file) void previewPhoto(file);
  });
  generate.addEventListener("click", generatePortrait);
  demo.addEventListener("click", () => {
    resetResult();
    showResult({ src: sample });
  });
  publish.addEventListener("click", () => {
    if (!currentResult || currentResult.published) return;
    confirmation.hidden = false;
    postAvatar.src = currentResult.src;
    postNote.textContent = currentResult.receipt
      ? "确认后，任何访客都能看到这个小人和你填写的昵称。"
      : "这是昵称和上墙样式的预览。";
    postStatus.hidden = true;
    setPosting(Boolean(currentResult.posting));
    syncNickname();
    nickname.focus({ preventScroll: true });
    confirmation.scrollIntoView({ block: "nearest" });
  });
  nickname.addEventListener("input", syncNickname);
  confirmation.addEventListener("submit", postPortrait);
  cancelPublish.addEventListener("click", () => {
    confirmation.hidden = true;
    publish.focus();
  });
  createTab.addEventListener("click", () => setView(true));
  wallTab.addEventListener("click", () => {
    wallMessage = demoEntry ? "样图和昵称仅在当前页面预览。" : "";
    setView(false);
  });
  more.addEventListener("click", () => {
    wallMessage = "";
    void loadWall(wallRetry);
  });

  function close() {
    releasePhoto();
    resetResult();
    description.value = "";
    nickname.value = "";
    wallRequest?.abort();
    wallRequest = null;
    panel.close();
    opener?.focus({ preventScroll: true });
    opener = null;
  }
  find("[data-pixel-close]").addEventListener("click", close);
  panel.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  return {
    show(trigger) {
      if (panel.open) return;
      opener = trigger;
      panel.showModal();
      setView(true);
      createTab.focus({ preventScroll: true });
      void updateConfiguration();
    },
    get open() { return panel.open; },
  };
}
