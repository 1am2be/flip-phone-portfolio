export function mountPhone() {
  const dialog = document.querySelector("#phonePanel");
  const error = document.querySelector("#phoneError");
  const closeButton = document.querySelector("#phoneErrorClose");
  let opener = null;
  let frame = null;
  let ready = false;
  let loadingTimeout = 0;

  function send(action) {
    frame?.contentWindow?.postMessage(
      { channel: "00s-room-phone", action },
      location.origin,
    );
  }

  function resetFrame() {
    clearTimeout(loadingTimeout);
    frame?.remove();
    frame = null;
    ready = false;
  }

  function show(trigger) {
    if (dialog.open) return;
    resetFrame();
    opener = trigger;
    error.hidden = true;
    dialog.showModal();
    frame = document.createElement("iframe");
    frame.title = "翻盖手机和作品目录";
    frame.src = "./phone/index.html?room=1";
    frame.style.visibility = "hidden";
    dialog.append(frame);
    loadingTimeout = window.setTimeout(() => {
      error.hidden = false;
      closeButton.focus();
    }, 10000);
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (!dialog.open || event.data?.channel !== "00s-room-phone") return;
    if (event.data.action === "ready") {
      clearTimeout(loadingTimeout);
      if (ready) return;
      ready = true;
      frame.style.visibility = "";
      error.hidden = true;
      send("open");
    } else if (event.data.action === "closed") {
      dialog.close();
    }
  });

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    resetFrame();
    opener?.focus({ preventScroll: true });
    opener = null;
  });

  return {
    show,
    get open() { return dialog.open; },
  };
}
