import * as THREE from "./vendor/three.module.js";

export function frameRoom(camera, bounds, {
  azimuth, elevation, targetY, targetZ = 0.16, minDistance = 0,
  zoom = 1, marginX = 0.90, marginY = 0.91,
}) {
  const target = new THREE.Vector3(0, targetY, targetZ);
  const back = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth),
  );
  const right = new THREE.Vector3().crossVectors(camera.up, back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const horizontal = tangent * camera.aspect * marginX;
  const vertical = tangent * marginY;
  const offset = new THREE.Vector3();
  let distance = minDistance;

  for (const corner of bounds) {
    offset.subVectors(corner, target);
    distance = Math.max(
      distance,
      offset.dot(back) + Math.abs(offset.dot(right)) / horizontal,
      offset.dot(back) + Math.abs(offset.dot(up)) / vertical,
    );
  }
  camera.position.copy(target).addScaledVector(back, distance);
  camera.zoom = zoom;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
