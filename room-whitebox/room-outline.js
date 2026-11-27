import * as THREE from "./vendor/three.module.js";

export function createRoomOutline(renderer, roomScene, meshes, ownership, callBubble) {
  const mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: 4 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const effect = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      silhouette: { value: mask.texture },
      pixel: { value: new THREE.Vector2() },
    },
    vertexShader: `
      varying vec2 uvOnScreen;
      void main() {
        uvOnScreen = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D silhouette;
      uniform vec2 pixel;
      varying vec2 uvOnScreen;

      void main() {
        float inside = texture2D(silhouette, uvOnScreen).r;
        float edge = 0.0;
        float glow = 0.0;
        for (int i = 0; i < 8; ++i) {
          float angle = float(i) * 0.7853981634;
          vec2 direction = vec2(cos(angle), sin(angle)) * pixel;
          edge = max(edge, texture2D(silhouette, uvOnScreen + direction * 1.5).r);
          glow += texture2D(silhouette, uvOnScreen + direction * 3.8).r * 0.0625;
          glow += texture2D(silhouette, uvOnScreen + direction * 7.5).r * 0.0375;
        }
        float alpha = (1.0 - inside) * clamp(edge * 0.90 + glow, 0.0, 1.0);
        gl_FragColor = vec4(mix(vec3(1.0, 0.28, 0.65), vec3(1.0, 0.82, 0.93), edge), alpha);
      }`,
  });
  const effectScene = new THREE.Scene();
  const effectCamera = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), effect);
  quad.frustumCulled = false;
  effectScene.add(quad);

  const originalMaterials = meshes.map((mesh) => mesh.material);
  const size = new THREE.Vector2();
  let cachedDevice = null;

  function draw(device, camera, cameraChanged) {
    if (!device) return;
    if (cameraChanged || cachedDevice !== device) {
      renderer.getDrawingBufferSize(size);
      mask.setSize(size.x, size.y);
      const ratio = renderer.getPixelRatio();
      effect.uniforms.pixel.value.set(ratio / size.x, ratio / size.y);

      // Black surfaces still write depth, so a nearby prop correctly hides the selected outline.
      for (const mesh of meshes) mesh.material = ownership.get(mesh) === device ? white : black;
      callBubble.visible = false;
      renderer.setRenderTarget(mask);
      try {
        renderer.render(roomScene, camera);
      } finally {
        meshes.forEach((mesh, index) => { mesh.material = originalMaterials[index]; });
        callBubble.visible = true;
        renderer.setRenderTarget(null);
      }
      cachedDevice = device;
    }

    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(effectScene, effectCamera);
    renderer.autoClear = autoClear;
  }

  return { draw };
}
