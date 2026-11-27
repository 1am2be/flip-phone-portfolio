import * as THREE from "./vendor/three.module.js";
import { buildRoom } from "./model.js";
import { dressRoom } from "./room-materials.js";
import { frameRoom } from "./camera-fit.js";
import { mountPhone } from "./phone-panel.js";
import { mountDeskPanels } from "./desk-panels.js";
import { createRoomOutline } from "./room-outline.js";

const stage = document.querySelector("#stage");
const canvas = document.querySelector("#room");
const notice = document.querySelector("#notice");
const buttons = new Map([...stage.querySelectorAll("[data-device]")].map((button) => [button.dataset.device, button]));
const phonePanel = mountPhone();
const deskPanels = mountDeskPanels();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const names = {
  phone: "翻盖手机",
  computer: "CRT 显示器",
  notebook: "Resume 线圈本",
  camera: "银色 CCD 相机",
};
const initialElevation = 12;
const defaultDistance = 10.93;

function boxCorners(object) {
  const corners = [];
  object.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          corners.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
        }
      }
    }
  });
  return corners;
}

async function startRoom() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  buildRoom(scene, { portrait: true });
  const room = scene.getObjectByName("00s Room");
  const bubble = await dressRoom(scene, room, renderer);
  room.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(47, 9 / 16, 0.12, 100);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const occluders = [];
  const ownership = new Map([[bubble, "phone"]]);
  room.traverseVisible((object) => {
    if (object.isMesh || object.isSprite) occluders.push(object);
  });
  const targetBounds = Object.entries(names).map(([device, name]) => {
    const object = room.getObjectByName(name);
    object.traverseVisible((child) => {
      if (child.isMesh) ownership.set(child, device);
    });
    return [device, boxCorners(object)];
  });
  const framingPoints = targetBounds.flatMap(([, corners]) => corners);
  const outline = createRoomOutline(renderer, scene, occluders.filter((object) => object.isMesh), ownership, bubble);

  const contacts = new Map();
  const pose = { azimuth: -2.5, elevation: initialElevation, zoom: 1 };
  const goal = { ...pose };
  let width = 0;
  let height = 0;
  let dirty = true;
  let moved = false;
  let pendingActivation = null;
  let pinchDistance = 0;
  let selectedTimeout = 0;
  let hovered = null;
  let focused = null;
  let selected = null;
  let renderedHighlight = null;
  let lastPointer = null;
  let lastDraw = 0;
  let lastFrame = performance.now();

  function resize() {
    ({ width, height } = stage.getBoundingClientRect());
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    dirty = true;
  }

  const project = new THREE.Vector3();
  function positionButtons() {
    for (const [device, corners] of targetBounds) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const corner of corners) {
        project.copy(corner).project(camera);
        const x = (project.x + 1) * width / 2;
        const y = (1 - project.y) * height / 2;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const button = buttons.get(device);
      button.hidden = maxX < 0 || maxY < 0 || minX > width || minY > height;
      button.style.transform = `translate(${minX}px, ${minY}px)`;
      button.style.width = `${maxX - minX}px`;
      button.style.height = `${maxY - minY}px`;
    }
  }

  function frame(time) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.05, (time - lastFrame) / 1000);
    lastFrame = time;
    if (!width || !height || ((phonePanel.open || deskPanels.open) && !dirty)) return;

    for (const key of ["azimuth", "elevation", "zoom"]) {
      if (goal[key] === pose[key]) continue;
      const difference = Math.abs(goal[key] - pose[key]);
      pose[key] = difference < 0.001 || reducedMotion.matches
        ? goal[key]
        : THREE.MathUtils.damp(pose[key], goal[key], 17, elapsed);
      dirty = true;
    }

    if (dirty) {
      frameRoom(camera, framingPoints, {
        ...pose,
        targetY: THREE.MathUtils.mapLinear(pose.elevation, initialElevation, 62, 3.12, 2.20),
        targetZ: 0.45,
        minDistance: defaultDistance,
        marginX: 0.985,
        marginY: 0.98,
      });
      positionButtons();
      if (!contacts.size && lastPointer) updateHover(lastPointer);
    }

    const highlight = contacts.size && moved ? null : hovered ?? focused ?? selected;
    if (dirty || highlight !== renderedHighlight || (!reducedMotion.matches && time - lastDraw >= 32)) {
      bubble.material.opacity = reducedMotion.matches ? 0.94 : 0.25 + 0.75 * (1 + Math.cos(time / 490)) / 2;
      renderer.render(scene, camera);
      outline.draw(highlight, camera, dirty || renderedHighlight !== highlight);
      renderedHighlight = highlight;
      lastDraw = time;
      dirty = false;
    }
  }

  function hitAt(x, y, rect) {
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    const firstHit = raycaster.intersectObjects(occluders, false)[0];
    return firstHit ? ownership.get(firstHit.object) ?? null : null;
  }

  function hitDevice(event, reach = 0) {
    const rect = canvas.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    const hit = hitAt(x, y, rect);
    if (hit || reach === 0) return hit;
    for (const [dx, dy] of [[0, -reach], [reach, 0], [0, reach], [-reach, 0]]) {
      const neighbor = hitAt(x + dx, y + dy, rect);
      if (neighbor) return neighbor;
    }
    return null;
  }

  function activate(device) {
    const button = buttons.get(device);
    stage.dispatchEvent(new CustomEvent("room:activate", { bubbles: true, detail: { device } }));
    clearTimeout(selectedTimeout);
    selected = null;
    if (device === "phone") {
      Object.assign(goal, pose);
      lastPointer = null;
      setHover(null);
      focused = null;
      dirty = true;
      phonePanel.show(button);
    } else if (deskPanels.show(device, button)) {
      Object.assign(goal, pose);
    } else {
      selected = device;
      selectedTimeout = window.setTimeout(() => { selected = null; }, 440);
    }
  }

  function setHover(device) {
    hovered = device;
    if (hovered) stage.dataset.hover = hovered;
    else delete stage.dataset.hover;
  }

  function updateHover(event) {
    if (event.pointerType === "touch" || phonePanel.open || deskPanels.open) return;
    lastPointer = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
    setHover(hitDevice(lastPointer));
  }

  function setZoom(value) {
    goal.zoom = THREE.MathUtils.clamp(value, 0.86, 1.42);
  }

  function distanceBetweenContacts() {
    const [a, b] = contacts.values();
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || phonePanel.open || deskPanels.open) return;
    pendingActivation = null;
    if (event.pointerType === "touch") {
      lastPointer = null;
      setHover(null);
    }
    stage.setPointerCapture(event.pointerId);
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (contacts.size === 1) {
      moved = false;
    } else if (contacts.size === 2) {
      pinchDistance = distanceBetweenContacts();
      moved = true;
      stage.dataset.dragging = "";
    }
  });

  stage.addEventListener("pointermove", (event) => {
    const last = contacts.get(event.pointerId);
    if (!last) {
      if (!contacts.size) updateHover(event);
      return;
    }
    if (contacts.size >= 2) {
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const distance = distanceBetweenContacts();
      if (pinchDistance >= 8 && distance >= 8) setZoom(goal.zoom * distance / pinchDistance);
      pinchDistance = distance;
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    const threshold = event.pointerType === "touch" ? 8 : 5;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    stage.dataset.dragging = "";
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    goal.azimuth = THREE.MathUtils.clamp(goal.azimuth - dx * 0.16, -31, 27);
    goal.elevation = THREE.MathUtils.clamp(goal.elevation - dy * 0.16, 3, 62);
  });

  function endContact(event, allowClick) {
    if (!contacts.has(event.pointerId)) return;
    const wasSingle = contacts.size === 1;
    contacts.delete(event.pointerId);
    if (contacts.size === 0) {
      delete stage.dataset.dragging;
      if (allowClick && wasSingle && !moved) {
        pendingActivation = hitDevice(event, event.pointerType === "touch" ? 14 : 0);
      }
      updateHover(event);
    } else {
      pinchDistance = contacts.size >= 2 ? distanceBetweenContacts() : 0;
    }
  }

  stage.addEventListener("pointerup", (event) => endContact(event, true));
  stage.addEventListener("pointercancel", (event) => endContact(event, false));
  stage.addEventListener("lostpointercapture", (event) => endContact(event, false));
  stage.addEventListener("click", (event) => {
    if (event.detail === 0 || event.target.closest("[data-device]")) return;
    const device = pendingActivation;
    pendingActivation = null;
    if (device) activate(device);
  });
  stage.addEventListener("pointerleave", () => {
    lastPointer = null;
    setHover(null);
  });
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? height : 1;
    setZoom(goal.zoom * Math.exp(-event.deltaY * scale * 0.0012));
  }, { passive: false });

  for (const [device, button] of buttons) {
    button.disabled = false;
    button.addEventListener("click", () => activate(device));
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible")) focused = device;
    });
    button.addEventListener("blur", () => {
      if (focused === device) focused = null;
    });
  }
  reducedMotion.addEventListener("change", () => { dirty = true; });
  new ResizeObserver(resize).observe(stage);
  resize();
  frame(performance.now());
  stage.dataset.ready = "";
  notice.hidden = true;
}

startRoom().catch((error) => {
  console.error(error);
  notice.textContent = "房间加载失败。请用已启用 WebGL 的浏览器重新打开。";
});
