const sections = [
  "联系我",
  "工作经历",
  "内容营销作品",
  "AI 应用案例",
  "品牌传播策划案提案",
  "视觉设计作品"
];

const body = document.body;
const coverScreen = document.querySelector("#coverScreen");
const openTab = document.querySelector("#openTab");
const closePhoneButton = document.querySelector("#closePhone");
const dialog = document.querySelector("#contentDialog");
const dialogClose = document.querySelector("#dialogClose");
const sectionTitle = document.querySelector("#sectionTitle");
const dialStatus = document.querySelector("#dialStatus");
const sectionCount = document.querySelector("#sectionCount");
const dialogScroll = document.querySelector("#dialogScroll");
const genericContent = document.querySelector("#genericContent");
const contactContent = document.querySelector("#contactContent");
const experienceContent = document.querySelector("#experienceContent");
const marketingContent = document.querySelector("#marketingContent");
const aiContent = document.querySelector("#aiContent");
const brandContent = document.querySelector("#brandContent");
const visualContent = document.querySelector("#visualContent");
const scrollHint = document.querySelector("#scrollHint");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FLIP_DURATION = 1820;
const CLOSE_DURATION = 1000;
let currentSection = 0;
let finishTimer = null;
let closeTimer = null;

const richSections = {
  0: { label: "联系我", element: contactContent },
  1: { label: "工作经历", element: experienceContent },
  2: { label: "内容营销与运营作品案例", element: marketingContent },
  3: { label: "AI应用案例", element: aiContent },
  4: { label: "品牌传播策划案提案", element: brandContent },
  5: { label: "视觉设计作品", element: visualContent }
};

/* 开场：停留在合盖封面，由访客点击按钮或按 Enter / 空格触发翻盖动画 */
function finishFlip() {
  body.classList.add("is-open");
}

function beginFlip() {
  if (body.classList.contains("is-opening") || body.classList.contains("is-open") || body.classList.contains("is-closing")) return;
  body.classList.add("is-opening");
  window.clearTimeout(finishTimer);
  finishTimer = window.setTimeout(finishFlip, reducedMotion ? 80 : FLIP_DURATION);
}

/* 盖上手机：反向收拢翻盖，回到静止封面等待访客再次翻开 */
function closePhone() {
  if (body.classList.contains("is-closing") || !body.classList.contains("is-open")) return;
  window.clearTimeout(finishTimer);
  if (dialog.open) dialog.close();
  body.classList.add("is-closing");
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    body.classList.remove("is-open", "is-opening", "is-closing");
    void coverScreen.offsetWidth;
  }, reducedMotion ? 60 : CLOSE_DURATION);
}

function renderSection(index) {
  currentSection = (index + sections.length) % sections.length;
  const number = String(currentSection + 1).padStart(2, "0");
  sectionTitle.textContent = sections[currentSection];
  dialStatus.textContent = `CONNECTED · KEY ${number}`;
  const richSection = richSections[currentSection];
  sectionCount.textContent = richSection
    ? richSection.label
    : `${number} / ${String(sections.length).padStart(2, "0")}`;
  dialog.classList.toggle("is-rich-section", Boolean(richSection));
  genericContent.hidden = Boolean(richSection);
  Object.values(richSections).forEach(({ element }) => {
    element.hidden = element !== richSection?.element;
  });
  scrollHint.hidden = !richSection;
  dialogScroll.scrollTop = 0;
}

function showSection(index) {
  renderSection(index);
  if (!dialog.open) {
    dialog.showModal();
    /* showModal 会自动聚焦关闭按钮，移动端会闪出焦点框；打开后不保留该焦点 */
    if (document.activeElement === dialogClose) dialogClose.blur();
  }
}

openTab.addEventListener("click", beginFlip);
closePhoneButton.addEventListener("click", closePhone);

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => showSection(Number(button.dataset.section)));
});

document.querySelector("#prevSection").addEventListener("click", () => renderSection(currentSection - 1));
document.querySelector("#nextSection").addEventListener("click", () => renderSection(currentSection + 1));
dialogClose.addEventListener("click", () => dialog.close());

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

document.addEventListener("keydown", (event) => {
  if (body.classList.contains("is-closing")) return;
  if (!body.classList.contains("is-open")) {
    if (event.key === "Enter" || event.key === " ") beginFlip();
    return;
  }
  if (/^[1-6]$/.test(event.key)) showSection(Number(event.key) - 1);
  if (dialog.open && event.key === "ArrowLeft") renderSection(currentSection - 1);
  if (dialog.open && event.key === "ArrowRight") renderSection(currentSection + 1);
});

renderSection(0);

/* ===== 2.5D 视差 =====
   把指针 / 触摸位置映射成 -1 ~ 1 的 --mx / --my，
   由 CSS 统一驱动手机倾斜、轮廓反光与背景光斑，脚本不直接改 transform。 */
const rootEl = document.documentElement;
let parallaxX = 0;
let parallaxY = 0;
let parallaxFrame = 0;

function applyParallax() {
  parallaxFrame = 0;
  rootEl.style.setProperty("--mx", parallaxX.toFixed(3));
  rootEl.style.setProperty("--my", parallaxY.toFixed(3));
}

function updateParallax(x, y) {
  parallaxX = Math.max(-1, Math.min(1, x));
  parallaxY = Math.max(-1, Math.min(1, y));
  if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(applyParallax);
}

if (!reducedMotion) {
  /* 桌面：跟随鼠标 / 触控笔 */
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    updateParallax(
      (event.clientX / window.innerWidth - 0.5) * 2,
      (event.clientY / window.innerHeight - 0.5) * 2
    );
  }, { passive: true });
  document.addEventListener("mouseleave", () => updateParallax(0, 0));
  window.addEventListener("blur", () => updateParallax(0, 0));

  /* 移动端：手指相对按下点的位移；弹窗打开时不响应，避免干扰内容滚动 */
  let touchStart = null;
  window.addEventListener("touchstart", (event) => {
    if (dialog.open || event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (!touchStart || dialog.open || event.touches.length !== 1) return;
    updateParallax(
      (event.touches[0].clientX - touchStart.x) / (window.innerWidth * 0.35),
      (event.touches[0].clientY - touchStart.y) / (window.innerHeight * 0.35)
    );
  }, { passive: true });
  const resetTouch = () => { touchStart = null; updateParallax(0, 0); };
  window.addEventListener("touchend", resetTouch, { passive: true });
  window.addEventListener("touchcancel", resetTouch, { passive: true });
}
