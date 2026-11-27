import * as THREE from "./vendor/three.module.js";

const shades = {
  white: 0xedeae6, light: 0xdad8d4, warm: 0xcac6c0, mid: 0xb9b6b3,
  dark: 0x929195, inset: 0x777a82, screen: 0xa3a7ab,
};

function paint(room, name, palette, properties = {}) {
  const materials = new Map(Object.entries(palette).map(([shade, color]) => [
    shades[shade],
    new THREE.MeshStandardMaterial({ color, roughness: 0.68, ...properties }),
  ]));
  room.getObjectByName(name).traverse((object) => {
    if (!object.isMesh) return;
    const replacement = materials.get(object.material.color.getHex());
    if (replacement) object.material = replacement;
  });
}

function textureFace(mesh, material) {
  const geometry = mesh.geometry;
  const [caps, sides] = geometry.groups;
  const frontCount = caps.count / 2;
  const frontIndex = caps.start + frontCount;
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;

  for (let index = frontIndex; index < frontIndex + frontCount; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) - min.x) / (max.x - min.x),
      (position.getY(index) - min.y) / (max.y - min.y),
    );
  }
  uv.needsUpdate = true;
  geometry.clearGroups();
  geometry.addGroup(caps.start, frontCount, 0);
  geometry.addGroup(frontIndex, frontCount, 1);
  geometry.addGroup(sides.start, sides.count, 0);
  mesh.material = [mesh.material, material];
}

function mappedMaterial(map, properties) {
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: 0xffffff,
    roughness: 0.63,
    ...properties,
  });
}

export async function dressRoom(scene, room, renderer) {
  const loader = new THREE.TextureLoader();
  const files = ["wall", "wood", "crt", "phone-lid", "ccd", "resume-cover", "incoming-call"];
  const textures = Object.fromEntries(await Promise.all(files.map(async (name) => {
    const texture = await loader.loadAsync(new URL(`./assets/${name}.webp`, import.meta.url).href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return [name, texture];
  })));
  const part = (name) => room.getObjectByName(name);

  paint(room, "墙与书桌", { white: 0x65311e, light: 0x704c37, warm: 0x593723, mid: 0x361c15, dark: 0x382822 });
  paint(room, "CRT 显示器", { white: 0xb19d83, light: 0x97826a, warm: 0x8b7157, mid: 0x6d5744, dark: 0x211a19 });
  paint(room, "键盘", { light: 0xa6947c, white: 0xc7b59c });
  paint(room, "鼠标与鼠标垫", { mid: 0x632846, white: 0xbda88f, dark: 0x4d3931 });
  paint(room, "桌面音箱", { mid: 0x291e1c, dark: 0x3f3130, inset: 0x191413 });
  paint(room, "翻盖手机", { warm: 0xad6388, white: 0xd79ab5, light: 0xaa5c85, dark: 0x966145 }, { roughness: 0.34, metalness: 0.25 });
  paint(room, "Resume 线圈本", { warm: 0x352321, white: 0xa99176, mid: 0x3d2429, dark: 0x664333 });
  paint(room, "银色 CCD 相机", { white: 0xc4aca3, light: 0xcfb6ad, mid: 0x8f7771, dark: 0x473a35, inset: 0x1b2225 }, { roughness: 0.37, metalness: 0.38 });
  paint(room, "光盘盒", { light: 0x6c5452, warm: 0x443132, white: 0xbea0a7, mid: 0x827a74 }, { roughness: 0.42, metalness: 0.18 });
  paint(room, "光盘筒", { warm: 0x3e2c34, light: 0x735953, dark: 0x69564a });
  paint(room, "笔筒", { warm: 0x926557, dark: 0x623e3f, white: 0xc7388c, mid: 0x378b9c });

  // The poster collage is a single continuous print on the wall; the whitebox keeps the paper layout.
  part("海报与星灯的位置").visible = false;
  const backWall = part("后墙");
  const { width: wallWidth, height: wallHeight, depth: wallDepth } = backWall.geometry.parameters;
  const deskHeight = new THREE.Box3().setFromObject(part("桌板")).max.y;
  const muralAspect = textures.wall.image.width / textures.wall.image.height;
  const muralWidth = Math.min(6.56, wallWidth - 0.06, (wallHeight - deskHeight - 0.03) * muralAspect);
  const muralHeight = muralWidth / muralAspect;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(muralWidth, muralHeight),
    mappedMaterial(textures.wall, { emissiveIntensity: 0.54, roughness: 0.91 }),
  );
  wall.name = "海报与星星灯纹理";
  wall.position.set(0.14, deskHeight + muralHeight / 2, backWall.position.z + wallDepth / 2 + 0.004);
  wall.receiveShadow = true;
  room.add(wall);

  textureFace(part("桌板"), mappedMaterial(textures.wood, { emissiveIntensity: 0.22, roughness: 0.41, metalness: 0.12 }));
  textureFace(part("CRT 屏幕面"), new THREE.MeshBasicMaterial({ map: textures.crt, toneMapped: false }));
  textureFace(part("手机翻盖正面"), mappedMaterial(textures["phone-lid"], { emissiveIntensity: 0.38, roughness: 0.36 }));
  textureFace(part("线圈本封面"), mappedMaterial(textures["resume-cover"], { emissiveIntensity: 0.40, roughness: 0.78 }));
  textureFace(part("相机机身"), mappedMaterial(textures.ccd, { emissiveIntensity: 0.40, roughness: 0.43, metalness: 0.16 }));
  for (const name of ["手机外屏边框", "手机外屏块", "手机装饰块", "白模封面铭牌", "相机闪光灯块", "相机取景器块"]) {
    part(name).visible = false;
  }
  part("吊坠").material = new THREE.MeshStandardMaterial({
    color: 0xb33b7d, roughness: 0.30, metalness: 0.16, emissive: 0x852153, emissiveIntensity: 0.26,
  });

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures["incoming-call"], transparent: true, depthWrite: false, toneMapped: false,
  }));
  glow.name = "来电气泡";
  glow.position.copy(part("翻盖手机").position).add(new THREE.Vector3(-0.69, 0.60, -0.40));
  glow.scale.set(0.94, 0.82, 1);
  room.add(glow);

  scene.add(new THREE.HemisphereLight(0xffdcc2, 0x6b382c, 1.12));
  const key = new THREE.DirectionalLight(0xffbb81, 1.75);
  key.position.set(-3.4, 7.5, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.camera.far = 25;
  key.shadow.normalBias = 0.022;
  key.shadow.radius = 2.4;
  scene.add(key);

  function lamp(color, intensity, distance, x, y, z) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, y, z);
    scene.add(light);
  }
  lamp(0xffa047, 14, 7.1, 2.8, 7.3, -1.14);
  lamp(0xffad56, 11, 6.7, -2.65, 7.6, -1.12);
  lamp(0x79caff, 4.2, 3.2, -0.99, 2.68, 0.11);
  lamp(0xff338d, 0.53, 1.65, glow.position.x, glow.position.y - 0.11, glow.position.z);
  return glow;
}
