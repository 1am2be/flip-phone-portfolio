import * as THREE from "./vendor/three.module.js";

const deskTop = 1.16;
const toRadians = THREE.MathUtils.degToRad;

const clay = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });
const white = clay(0xedeae6);
const light = clay(0xdad8d4);
const warm = clay(0xcac6c0);
const mid = clay(0xb9b6b3);
const dark = clay(0x929195);
const inset = clay(0x777a82);
const screen = clay(0xa3a7ab, 0.53);

function place(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, size, at, material) {
  return place(parent, new THREE.BoxGeometry(...size), material, ...at);
}

function roundedGeometry(width, height, depth, radius) {
  const bevel = Math.min(0.025, depth / 4, radius / 3);
  const x = width / 2 - bevel;
  const y = height / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  return geometry;
}

function rounded(parent, size, at, radius, material, horizontal = false) {
  const mesh = place(parent, roundedGeometry(...size, radius), material, ...at);
  if (horizontal) mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function cylinder(parent, radii, height, at, material, axis = "y") {
  const mesh = place(parent, new THREE.CylinderGeometry(...radii, height, 28), material, ...at);
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function groupAt(parent, name, x, y, z, yaw = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  group.rotation.y = toRadians(yaw);
  parent.add(group);
  return group;
}

function tube(parent, path, radius, material) {
  const curve = new THREE.CatmullRomCurve3(path.map((point) => new THREE.Vector3(...point)));
  return place(parent, new THREE.TubeGeometry(curve, Math.max(20, path.length * 4), radius, 6, false), material, 0, 0, 0);
}

function buildShell(room, portrait) {
  const shell = groupAt(room, "墙与书桌", 0, 0, 0);
  const wallWidth = portrait ? 7.36 : 7.45;
  const wallHeight = portrait ? 8.51 : 5.55;
  const deskWidth = portrait ? 7.42 : 7.18;
  const deskFront = portrait ? 4.82 : 2.61;
  const deskDepth = deskFront + 2.17;
  const deskCenter = (deskFront - 2.17) / 2;

  box(shell, [wallWidth, wallHeight, 0.17], [0, wallHeight / 2, -2.28], light).name = "后墙";
  box(shell, [0.17, wallHeight, 1.08], [0.085 - wallWidth / 2, wallHeight / 2, -1.66], warm).name = "左侧短墙";
  box(shell, [wallWidth + 0.01, 0.12, deskDepth + 0.30], [0, 0.06, deskCenter - 0.03], warm).name = "剖切底板";

  rounded(shell, [deskWidth, deskDepth, 0.23], [0, deskTop - 0.115, deskCenter], 0.10, white, true).name = "桌板";
  box(shell, [deskWidth - 0.28, 0.45, 0.16], [0, 0.71, deskFront - 0.34], warm).name = "桌沿下横档";
  const legX = deskWidth / 2 - 0.29;
  for (const x of [-legX, legX]) {
    box(shell, [0.30, 0.94, deskDepth - 0.35], [x, 0.59, deskCenter - 0.08], mid);
  }
  for (const x of [-2.09, 1.26]) {
    rounded(shell, [x < 0 ? 2.06 : 3.36, 0.35, 0.11], [x, 0.72, deskFront - 0.27], 0.055, light);
    rounded(shell, [0.37, 0.045, 0.07], [x, 0.80, deskFront - 0.18], 0.014, dark);
  }
  return shell;
}

function buildWallProps(room) {
  const wall = groupAt(room, "海报与星灯的位置", 0, 0, -2.18);
  const paperLayout = [
    [-2.95, 4.94, 0.73, 0.74, -7], [-2.05, 5.02, 0.67, 0.48, 3],
    [-2.03, 4.17, 1.30, 1.12, 5], [-3.02, 3.61, 0.65, 0.85, -6],
    [-1.05, 4.80, 0.61, 0.83, -5], [-1.07, 3.60, 0.71, 0.90, 7],
    [-0.19, 4.15, 1.12, 1.41, -4], [0.67, 4.75, 0.71, 0.80, 7],
    [0.83, 3.53, 0.65, 0.79, -6], [1.57, 4.44, 0.91, 1.21, 4],
    [2.60, 4.83, 0.87, 0.85, -6], [2.85, 3.77, 0.68, 0.92, 3],
    [2.00, 3.25, 0.84, 0.92, -4], [2.86, 2.81, 0.68, 0.80, 6],
    [1.12, 2.80, 0.62, 0.70, 4], [2.59, 2.05, 0.54, 0.74, -6],
  ];
  paperLayout.forEach(([x, y, w, h, rotation], index) => {
    const paper = groupAt(wall, "墙面纸片", x, y, 0.04 + (index % 3) * 0.018);
    paper.rotation.z = toRadians(rotation);
    box(paper, [w, h, 0.026], [0, 0, 0], index % 3 === 0 ? light : white);
    box(paper, [w - 0.135, h - 0.18, 0.016], [0, 0.035, 0.016], index % 4 === 0 ? mid : warm);
  });
  cylinder(wall, [0.35, 0.35], 0.042, [1.57, 4.48, 0.13], light, "z");
  cylinder(wall, [0.07, 0.07], 0.048, [1.57, 4.48, 0.15], mid, "z");
  const cord = [
    [-3.50, 4.72, 0.16], [-2.94, 4.98, 0.16], [-2.32, 5.24, 0.16],
    [-1.62, 5.08, 0.16], [-0.92, 4.88, 0.16], [-0.16, 5.12, 0.16],
    [0.53, 4.91, 0.16], [1.31, 5.18, 0.16], [2.06, 5.29, 0.16],
    [2.70, 5.04, 0.16], [3.50, 5.38, 0.16],
  ];
  tube(wall, cord, 0.014, mid);

  const star = new THREE.Shape();
  for (let tip = 0; tip < 10; tip += 1) {
    const polar = Math.PI / 2 + tip * Math.PI / 5;
    const radius = tip % 2 === 0 ? 0.115 : 0.049;
    const x = Math.cos(polar) * radius;
    const y = Math.sin(polar) * radius;
    if (tip === 0) star.moveTo(x, y);
    else star.lineTo(x, y);
  }
  star.closePath();
  const bulb = new THREE.ExtrudeGeometry(star, { depth: 0.035, bevelEnabled: false });
  for (const [x, y, z] of cord.slice(1, -1)) {
    place(wall, bulb, white, x, y - 0.097, z);
  }
}

function buildComputer(room, portrait) {
  const crt = groupAt(room, "CRT 显示器", portrait ? -0.99 : -1.56, deskTop, portrait ? -0.88 : -0.97, -4);
  crt.scale.set(portrait ? 1.20 : 1.12, portrait ? 1.34 : 1.11, 1);
  rounded(crt, [1.62, 1.25, 0.14], [0, 0.07, -0.17], 0.17, warm, true);
  cylinder(crt, [0.38, 0.52], 0.26, [0, 0.23, -0.12], mid);
  rounded(crt, [2.45, 2.01, 1.15], [0, 1.33, -0.24], 0.19, light);
  rounded(crt, [2.74, 2.14, 0.52], [0, 1.35, 0.34], 0.17, white);
  rounded(crt, [2.27, 1.69, 0.10], [0, 1.42, 0.585], 0.125, dark);
  rounded(crt, [2.08, 1.50, 0.075], [0, 1.42, 0.635], 0.12, screen).name = "CRT 屏幕面";

  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row += 1) {
      box(crt, [0.032, 0.029, 0.57], [side * 1.20, 1.16 + row * 0.11, -0.36], dark);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    rounded(crt, [0.105, 0.04, 0.033], [0.39 + i * 0.14, 0.425, 0.609], 0.014, i === 4 ? dark : warm);
  }

  const keyboard = groupAt(room, "键盘", portrait ? -1.10 : -1.48, deskTop, portrait ? 0.67 : 0.25, -5);
  if (portrait) keyboard.scale.x = 1.03;
  rounded(keyboard, [2.88, 0.15, 0.83], [0, 0.075, 0], 0.062, light);
  const regularKey = new THREE.BoxGeometry(0.127, 0.057, 0.091);
  const keys = new THREE.InstancedMesh(regularKey, white, 65);
  keys.castShadow = true;
  keys.receiveShadow = true;
  const transform = new THREE.Matrix4();
  let keyIndex = 0;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      if (row === 4 && col >= 2 && col <= 8) continue;
      const numberPadGap = col >= 10 ? 0.14 : 0;
      const x = -1.23 + 0.177 * col + numberPadGap;
      transform.makeTranslation(x, 0.176, -0.31 + row * 0.148);
      keys.setMatrixAt(keyIndex, transform);
      keyIndex += 1;
    }
  }
  keys.count = keyIndex;
  keyboard.add(keys);
  box(keyboard, [1.23, 0.057, 0.091], [-0.35, 0.176, 0.282], white);

  const mouse = groupAt(room, "鼠标与鼠标垫", 0.70, deskTop, portrait ? 1.05 : 0.20, -12);
  rounded(mouse, [0.88, 1.02, 0.035], [0, 0.0175, 0], 0.07, mid, true);
  rounded(mouse, [0.46, 0.73, 0.22], [0, 0.145, 0], 0.17, white, true);
  box(mouse, [0.022, 0.018, 0.22], [0, 0.26, -0.16], dark);

  const speaker = groupAt(room, "桌面音箱", portrait ? 0.95 : 0.48, deskTop, portrait ? -0.83 : -1.27, -2);
  rounded(speaker, [0.53, 1.18, 0.52], [0, 0.59, 0], 0.07, mid);
  cylinder(speaker, [0.182, 0.182], 0.051, [0, 0.45, 0.27], dark, "z");
  cylinder(speaker, [0.119, 0.119], 0.069, [0, 0.45, 0.291], inset, "z");
  cylinder(speaker, [0.113, 0.113], 0.058, [0, 0.88, 0.27], dark, "z");
}

function buildPhone(room, portrait) {
  const phone = groupAt(room, "翻盖手机", portrait ? -1.05 : -2.05, deskTop, portrait ? 3.19 : 1.63, 14);
  if (portrait) phone.scale.set(0.94, 1, 1.16);
  const handset = groupAt(phone, "翻盖手机机身", 0, 0, 0);
  const thickness = portrait ? 1.75 : 1;
  handset.scale.y = thickness;
  rounded(handset, [0.77, 1.20, 0.112], [0, 0.056, 0], 0.23, warm, true);
  rounded(handset, [0.74, 1.18, 0.095], [0, 0.151, 0], 0.225, white, true).name = "手机翻盖正面";
  rounded(handset, [0.39, 0.34, 0.025], [0, 0.205, 0.015], 0.10, mid, true).name = "手机外屏边框";
  rounded(handset, [0.29, 0.23, 0.016], [0, 0.22, 0.015], 0.065, screen, true).name = "手机外屏块";
  cylinder(handset, [0.067, 0.067], 0.031, [0.01, 0.206, -0.36], dark).name = "手机装饰块";
  cylinder(handset, [0.085, 0.085], 0.49, [0, 0.13, -0.515], light, "x");
  tube(phone, [[-0.38, 0.10 * thickness, 0.2], [-0.49, 0.032, 0.26], [-0.56, 0.03, 0.39], [-0.67, 0.032, 0.54]], 0.018, dark);
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.12);
  heart.bezierCurveTo(-0.35, 0.125, -0.13, 0.27, 0, 0.10);
  heart.bezierCurveTo(0.13, 0.27, 0.35, 0.125, 0, -0.12);
  const charm = place(phone, new THREE.ExtrudeGeometry(heart, { depth: 0.038, bevelEnabled: false }), light, -0.71, 0.017, 0.63);
  charm.rotation.x = -Math.PI / 2;
  charm.name = "吊坠";
}

function buildNotebook(room, portrait) {
  const book = groupAt(room, "Resume 线圈本", portrait ? 0.055 : -0.23, deskTop, portrait ? 3.24 : 1.59, 9);
  if (portrait) book.scale.x = 0.72;
  rounded(book, [1.54, 1.44, 0.036], [0, 0.018, 0], 0.055, warm, true);
  rounded(book, [1.48, 1.39, 0.092], [0, 0.073, 0], 0.05, white, true);
  rounded(book, [1.54, 1.44, 0.038], [0, 0.13, 0], 0.055, mid, true).name = "线圈本封面";
  box(book, [0.77, 0.015, 0.15], [0.08, 0.154, -0.31], light).name = "白模封面铭牌";
  const coil = new THREE.TorusGeometry(0.095, 0.015, 6, 18);
  for (let i = 0; i < 10; i += 1) {
    place(book, coil, dark, -0.70, 0.111, -0.61 + i * 0.134);
  }
}

function buildCamera(room, portrait) {
  const camera = groupAt(room, "银色 CCD 相机", portrait ? 1.35 : 1.85, deskTop, portrait ? 3.11 : 1.56, -13);
  if (portrait) camera.scale.set(0.80, 0.89, 0.83);
  else camera.scale.setScalar(0.92);
  rounded(camera, [1.46, 0.76, 0.40], [0, 0.38, 0], 0.112, white).name = "相机机身";
  rounded(camera, [0.13, 0.57, 0.08], [-0.63, 0.37, 0.165], 0.042, light);
  cylinder(camera, [0.289, 0.303], 0.12, [0.21, 0.322, 0.25], light, "z");
  cylinder(camera, [0.224, 0.224], 0.108, [0.21, 0.322, 0.322], mid, "z");
  cylinder(camera, [0.147, 0.147], 0.021, [0.21, 0.322, 0.38], inset, "z");
  rounded(camera, [0.25, 0.105, 0.025], [0.47, 0.625, 0.21], 0.025, mid).name = "相机闪光灯块";
  rounded(camera, [0.146, 0.105, 0.022], [0.15, 0.625, 0.21], 0.022, dark).name = "相机取景器块";
  cylinder(camera, [0.115, 0.115], 0.036, [0.42, 0.766, 0], mid);
  tube(camera, [
    [0.64, 0.12, -0.12], [0.78, 0.035, 0.00], [0.69, 0.026, 0.48],
    [0.57, 0.027, 0.80], [0.19, 0.026, 0.85], [0.08, 0.028, 0.71],
    [0.28, 0.026, 0.57], [0.55, 0.030, 0.42], [0.69, 0.041, -0.06],
  ], 0.018, dark);
}

function buildAccessories(room, portrait) {
  const stack = groupAt(room, "光盘盒", portrait ? 1.98 : 2.64, deskTop, portrait ? 0.52 : -0.43, -7);
  if (portrait) stack.scale.z = 0.96;
  for (let caseIndex = 0; caseIndex < 6; caseIndex += 1) {
    const discCase = groupAt(stack, "光盘盒", 0, 0.042 + caseIndex * 0.084, 0, (caseIndex % 3 - 1) * 3);
    box(discCase, [1.48, 0.081, 1.32], [0, 0, 0], caseIndex % 2 ? light : warm);
    box(discCase, [1.38, 0.029, 0.018], [0, 0, 0.666], light);
  }
  cylinder(stack, [0.47, 0.47], 0.018, [0, 0.514, 0], white);
  cylinder(stack, [0.061, 0.061], 0.026, [0, 0.525, 0], mid);

  const spindle = groupAt(room, "光盘筒", portrait ? 1.76 : 1.36, deskTop, portrait ? -1.08 : -1.28);
  cylinder(spindle, [0.48, 0.51], 0.48, [0, 0.24, 0], warm);
  cylinder(spindle, [0.46, 0.49], 0.07, [0, 0.49, 0], light);
  cylinder(spindle, [0.045, 0.045], 0.12, [0, 0.56, 0], dark);

  const cup = groupAt(room, "笔筒", portrait ? -2.39 : -3.22, deskTop, portrait ? 1.57 : 0.66);
  cylinder(cup, [0.245, 0.22], 0.46, [0, 0.23, 0], warm);
  cylinder(cup, [0.223, 0.223], 0.031, [0, 0.46, 0], dark);
  const pens = [[-0.11, -0.06, -0.17, -0.08], [0.075, -0.03, 0.14, 0.1], [0.024, 0.11, 0.13, -0.14], [-0.005, -0.14, -0.08, 0.09]];
  pens.forEach(([x, z, pitch, roll], i) => {
    const pen = cylinder(cup, [0.029, 0.031], 0.54 + i * 0.05, [x, 0.57 + i * 0.023, z], i % 2 ? white : mid);
    pen.rotation.set(pitch, 0, roll);
  });
}

export function buildRoom(scene, { portrait = false } = {}) {
  const room = new THREE.Group();
  room.name = "00s Room";
  buildShell(room, portrait);
  buildWallProps(room);
  buildComputer(room, portrait);
  buildPhone(room, portrait);
  buildNotebook(room, portrait);
  buildCamera(room, portrait);
  buildAccessories(room, portrait);
  scene.add(room);

  room.updateWorldMatrix(true, true);
  const corners = [];
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  room.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    box.copy(object.geometry.boundingBox);
    if (object.isInstancedMesh) {
      object.computeBoundingBox();
      box.copy(object.boundingBox);
    }
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corners.push(corner.set(x, y, z).clone().applyMatrix4(object.matrixWorld));
        }
      }
    }
  });
  return corners;
}
