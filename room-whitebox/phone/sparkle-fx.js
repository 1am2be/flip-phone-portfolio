/* Y2K 紫粉细闪：点击处爆开一簇细十字星 + 小亮点，鼠标移动留极轻的微光尾迹。
   全屏 canvas、pointer-events:none，粒子最大扩散约 46px、0.7s 内消失，不遮挡内容。 */
(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dialog = document.querySelector("#contentDialog");
  const COLORS = ["#f348aa", "#ff8ed3", "#b56cff", "#ffb3e0", "#e8339c", "#d98cff"];
  /* 状态机翻盖完成后仍保留 is-opening，必须再判断 is-open，否则会永久禁用细闪 */
  const isFlipAnimating = () => {
    const c = document.body.classList;
    return c.contains("is-closing") || (c.contains("is-opening") && !c.contains("is-open"));
  };

  const canvas = document.createElement("canvas");
  canvas.className = "sparkle-fx";
  Object.assign(canvas.style, {
    position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh",
    display: "block", pointerEvents: "none", zIndex: "2147483647"
  });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let dpr = 1;
  let particles = [];
  let raf = 0;
  let lastTrail = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  /* <dialog>.showModal() 会进入 top layer，普通层的 canvas 会被盖住；
     弹窗打开时把画布挂进 dialog，关闭后再放回 body。 */
  function ensureHost() {
    const host = dialog && dialog.open ? dialog : document.body;
    if (canvas.parentNode !== host) host.appendChild(canvas);
  }
  if (dialog) dialog.addEventListener("close", () => {
    if (canvas.parentNode !== document.body) document.body.appendChild(canvas);
  });

  function start() {
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  function push(p, now) {
    p.born = now + (p.delay || 0);
    particles.push(p);
  }

  function burst(x, y) {
    ensureHost();
    const now = performance.now();
    push({ type: "star", x, y, angle: 0, reach: 0, size: reducedMotion ? 5 : 10, life: reducedMotion ? 240 : 600, color: "#f348aa" }, now);
    const count = reducedMotion ? 2 : 14;
    for (let i = 0; i < count; i++) {
      push({
        type: Math.random() < 0.5 ? "dot" : "star",
        x, y,
        angle: Math.random() * Math.PI * 2,
        reach: 12 + Math.random() * 26,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 24,
        life: 420 + Math.random() * 260,
        color: COLORS[(Math.random() * COLORS.length) | 0]
      }, now);
    }
    if (!reducedMotion) push({ type: "halo", x, y, angle: 0, reach: 0, size: 15, life: 400, color: "#ff8ed3" }, now);
    start();
  }

  function trail(x, y) {
    ensureHost();
    const now = performance.now();
    push({
      type: Math.random() < 0.18 ? "star" : "dot",
      x, y,
      angle: Math.random() * Math.PI * 2,
      reach: 1 + Math.random() * 3,
      size: Math.random() < 0.18 ? 2.5 : 1.6,
      life: 220 + Math.random() * 140,
      color: COLORS[(Math.random() * COLORS.length) | 0]
    }, now);
    start();
  }

  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    raf = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    particles = particles.filter(p => now - p.born < p.life);

    for (const p of particles) {
      const age = now - p.born;
      if (age < 0) continue;
      const t = age / p.life;
      const fadeIn = t < 0.12 ? t / 0.12 : 1;
      const alpha = Math.max(0, (1 - t) * fadeIn);
      const dist = p.reach * easeOut(t);
      const px = p.x + Math.cos(p.angle) * dist;
      const py = p.y + Math.sin(p.angle) * dist - dist * 0.12;
      ctx.globalAlpha = alpha;

      if (p.type === "halo") {
        const r = p.size * (0.5 + t * 1.3);
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, "rgba(255,142,211,0.34)");
        g.addColorStop(1, "rgba(255,142,211,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "dot") {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(px, py, p.size * 0.34 * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
      } else {
        const s = p.size * (0.45 + Math.sin(Math.PI * t) * 0.85);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
        ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath(); ctx.arc(px, py, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (particles.length) raf = window.requestAnimationFrame(tick);
  }

  /* capture 阶段监听，弹窗 / 封面 / 按键点击都能触发 */
  window.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    /* 翻盖 / 合盖动画自带星芒且正处于 3D 重绘高峰，不再叠加全屏粒子 */
    const target = event.target;
    if (target && target.closest && target.closest("#openTab,#closePhone")) return;
    if (isFlipAnimating()) return;
    burst(event.clientX, event.clientY);
  }, { capture: true, passive: true });

  /* 桌面鼠标移动：极稀疏的 1~2px 微光点，移动端触摸不启用，避免滑动时刷屏 */
  if (!reducedMotion) {
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      if (isFlipAnimating()) return;
      const now = performance.now();
      if (now - lastTrail < 85) return;
      lastTrail = now;
      trail(event.clientX, event.clientY);
    }, { capture: true, passive: true });
  }
})();
