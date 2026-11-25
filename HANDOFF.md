# 翻盖手机作品集 · 交接说明

这是一个「翻盖手机」主题的互动作品集网站：合盖封面 → 点击翻开 → 3D 铰链翻盖动画 → 主界面按数字键 1–6 查看六个板块。

线上地址：https://tianxin-flip-portfolio.app.workbuddy.host/?sharecode=KLBBAWDNGZ

---

## 1. 文件结构

仓库根目录即为站点根目录，可直接作为静态站点部署：

```
index.html          页面结构、六板块全部文案与配图引用、封面/弹窗/按键 DOM
styles-v2.css       全部视觉：2.5D、翻盖动画、移动端修复、响应式
script.js           状态机：beginFlip / closePhone / showSection / 键盘 1-6
sparkle-fx.js       点击细闪 canvas 特效
assets/             49 个文件（手机底图、目录气泡、六板块配图）
dist/               发布快照：与上面 4 个文件 + assets 完全一致，部署的就是这个目录
.openai/hosting.json 指定 static.directory = dist
HANDOFF.md          本文件
```

**`dist/` 与源码是同一份内容的两个副本。** 改完源码后必须同步到 `dist/` 再部署：

```bash
cp index.html styles-v2.css script.js sparkle-fx.js dist/
cp -r assets/. dist/assets/
```

---

## 2. 本地预览

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory dist
# 打开 http://127.0.0.1:8765/
```

部署目录：`dist`。覆盖发布时链接保持不变。

---

## 3. 改动的硬约定（务必遵守）

1. **缓存破坏**：改了 CSS / JS / 图片内容，必须抬 `index.html` 里的 `?v=` 版本号，否则老访客命中旧缓存。当前值：
   - `styles-v2.css?v=7`
   - `script.js?v=4`
   - `sparkle-fx.js?v=1`
   - `assets/phone-open.png?v=3`

2. **移动端修复集中在 `@media (max-width:700px)`**：
   - `.flip-depth` 不做 transform（iOS 嵌套 3D 上下文会导致上盖与下机身分离）
   - 手机收进视口（`right:3%; height:80%`）
   - 禁用 `.phone-depth::before` / `::after`（mask + mix-blend-mode 在 iOS 上造成右侧花屏）
   - 机身改为单层柔和阴影（`drop-shadow(0 14px 16px ...)`）
   - **不要把桌面 2.5D 的倾斜和反光套回移动端**

3. **动画层禁止高开销属性**：`.flip-base` / `.lid-inner` / `.lid-outer` / `.flip-hinge` / `.screen-glow` / `.flip-sparkles span` 上不要再加 `filter`、`mix-blend-mode`、`text-shadow`。之前加过，导致移动端翻盖动画明显卡顿。悬浮投影由 `.flip-stage::after` 的静态渐变承担。

4. **状态机陷阱**：`finishFlip()` 只 add `is-open`、**不移除** `is-opening`。所以判断「动画正在进行中」必须写 `is-opening && !is-open`，否则细闪与 `will-change` 会被永久误判关闭。

5. **截图验证的坑**：用无头浏览器截图时，先等大背景图（尤其 `phone-closed.png`）decode 完成再拍，否则会误判「合盖手机被水平裁掉一半」。

---

## 4. 已修复过的问题（别重蹈覆辙）

| 现象 | 根因 | 修法 |
|---|---|---|
| 翻盖动画中出现水平横杠 | 半张手机图裁切边上的零模糊硬 `drop-shadow` | 三层阴影改为纯模糊投影 |
| 移动端右侧花屏 | 手机超出视口 + 硬阴影被裁 + `mask`/`screen` 合成 | 收进视口、禁用伪元素、单层柔和阴影 |
| 移动端上盖与下机身分离 | `.flip-depth` 的 transform + will-change 包住内部 `perspective`/`preserve-3d` | 移动端去掉外层倾斜 |
| 移动端翻盖卡顿 | 3D 动画层上挂 `filter` / `mix-blend-mode` / `text-shadow` | 全部移除，只保留静态投影层 |
| 移动端弹窗白色焦点框 | `<dialog>.showModal()` 自动聚焦 + `:focus-visible` 白描边 | 移除白 outline 改粉色 box-shadow，打开后 `blur()` |
| 按键在倾斜后点不准 | 透视变换后热区偏移 | 热区与图片放在同一变换容器内，`elementFromPoint` 验证命中 |

---

## 5. 交互入口

- 封面按钮 / Enter / Space → `beginFlip()`
- 「↩ 盖上手机」→ `closePhone()`
- 数字键 1–6 或点击手机按键 → `showSection(index)`
- 弹窗内左右方向键 → `renderSection(currentSection ± 1)`
- `prefers-reduced-motion` 下缩短动画，且完全关闭指针视差
