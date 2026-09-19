/* ==========================================================================
   天鹰档案终端 · 3D 渲染层（PC 端专用）
   用 Three.js 程序化生成长方体当作档案盒——不加载任何模型文件。
   几何与镜头参数对齐 LBEILC/RhineLabUI：
     COLUMN_SPACING 5.2 / ROW_SPACING 0.62 / 端面深度 0.31（DESIGN.md）
     镜头仰角 35-43°、方位角 67°
   ========================================================================== */
import * as THREE from "./lib/three.module.min.js";

const LANES = 13;                // 横向位置 -6..6（含两侧补位，铺满画面）
const ROWS = 32;                 // 纵深位置
const COL_SPACING = 5.2;         // 列间距（纵深方向上"列与列"的距离）
const ROW_SPACING = 1.7;         // 同一列里两片档案的间距（原版 0.62，拉开一点才能看清层次）
const BOX_W = 3.4;               // 档案正面宽
const BOX_H = 7.4;               // 档案高度
const BOX_D = 0.5;               // 端面深度
const ROW_MID = (ROWS - 1) / 2;          // 15.5：阵列的几何中心（用于摆位置）
const CHOSEN_ROW = Math.floor(ROW_MID);  // 15：当前档案所在的格子（实例下标必须是整数）

const wrap = (v, n) => ((v % n) + n) % n;

export function createStage(canvas, columns, hooks) {
  const onPick = (hooks && hooks.onPick) || function () {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf7f6f3, 46, 135);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
  const AZ = THREE.MathUtils.degToRad(58);
  const EL = THREE.MathUtils.degToRad(34);
  const DIST = 36;
  const aim = new THREE.Vector3(-5.5, 3.4, 0);   // 往左上偏，画面左上角留给标题
  camera.position.set(
    Math.sin(AZ) * Math.cos(EL) * DIST,
    Math.sin(EL) * DIST,
    Math.cos(AZ) * Math.cos(EL) * DIST
  );
  camera.lookAt(aim);

  // ---- 光照：一盏主光（顶面亮、侧面自然变暗）+ 半球环境光 + 一盏补光
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcdc6b8, 1.15));
  const sun = new THREE.DirectionalLight(0xfff4e4, 2.5);
  sun.position.set(18, 34, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-24, 14, -14);
  scene.add(fill);

  // ---- 地面：只接收阴影，让档案"站在"某处而不是浮着
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 档案盒：一次绘制 288 个长方体
  const geometry = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf1eade,
    roughness: 0.84,
    metalness: 0.02,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, LANES * ROWS);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseColor = new THREE.Color(0xf1eade);
  const litColor = new THREE.Color(0xfffdf8);
  const color = new THREE.Color();
  for (let i = 0; i < LANES * ROWS; i += 1) {
    mesh.setColorAt(i, baseColor);
  }
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const group = new THREE.Group();
  scene.add(group);

  const dummy = new THREE.Object3D();
  const offsets = new Map();     // instanceId -> { x, y, z }（当前显示位置）
  let col = 0;
  let row = 0;
  let lift = 0;                  // 选中档案抬起量（平滑）
  let targetLift = 0;
  let shiftX = 0;                // 换列时的临时位移（无缝循环用）
  let shiftZ = 0;                // 换档案时同理
  let last = performance.now();
  let running = true;

  for (let i = 0; i < LANES * ROWS; i += 1) {
    const lane = Math.floor(i / ROWS) - (LANES - 1) / 2;
    const r = i % ROWS;
    offsets.set(i, { x: lane * COL_SPACING, y: BOX_H / 2, z: (r - ROW_MID) * ROW_SPACING });
  }

  function entryAt(lane, rowIndex) {
    if (!columns.length) { return null; }
    const colIndex = wrap(col + lane, columns.length);
    const list = columns[colIndex].entries;
    const entryIndex = wrap(row + (rowIndex - CHOSEN_ROW), list.length);
    return { colIndex, entryIndex, entry: list[entryIndex] };
  }

  function writeMatrices() {
    for (let i = 0; i < LANES * ROWS; i += 1) {
      const lane = Math.floor(i / ROWS) - (LANES - 1) / 2;
      const r = i % ROWS;
      const base = offsets.get(i);
      const isChosen = lane === 0 && r === CHOSEN_ROW;
      dummy.position.set(base.x, base.y + (isChosen ? lift : 0), base.z);
      color.copy(baseColor).lerp(litColor, isChosen ? Math.min(1, lift / 2.4) : 0);
      mesh.setColorAt(i, color);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; }
  }

  function frame() {
    if (!running) { return; }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    const k = 1 - Math.exp(-dt * 9);
    lift += (targetLift - lift) * k;
    shiftX += (0 - shiftX) * k;
    shiftZ += (0 - shiftZ) * k;
    group.position.x = shiftX;
    group.position.z = shiftZ;
    writeMatrices();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickInstance(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit || hit.instanceId === undefined) { return null; }
    const lane = Math.floor(hit.instanceId / ROWS) - (LANES - 1) / 2;
    const r = hit.instanceId % ROWS;
    const info = entryAt(lane, r);
    return info ? { lane, rowIndex: r, ...info } : null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const hit = pickInstance(event);
    if (hit) { onPick(hit); }
  });

  window.addEventListener("resize", resize);
  resize();
  writeMatrices();
  frame();

  return {
    // 换列 / 换档案：先把整片阵列瞬时挪一格，再让偏移归零 —— 视觉上就是无缝滑动
    goColumn(delta) {
      if (!columns.length) { return; }
      col = wrap(col + delta, columns.length);
      const entries = columns[col].entries.length;
      row = Math.min(row, entries - 1);
      shiftX = -delta * COL_SPACING;
      writeMatrices();
    },
    goRow(delta) {
      const entries = columns[col] ? columns[col].entries.length : 0;
      if (!entries) { return; }
      const next = wrap(row + delta, entries);
      if (next === row) { return; }
      row = next;
      shiftZ = -delta * ROW_SPACING;
      writeMatrices();
    },
    selectCol(nextCol, nextRow) {
      col = wrap(nextCol, columns.length);
      const entries = columns[col].entries.length;
      row = Math.min(nextRow === undefined ? row : nextRow, entries - 1);
      shiftX = 0;
      shiftZ = 0;
      writeMatrices();
    },
    setLift(value) {
      targetLift = value;
    },
    current() {
      return { col, row };
    },
    resize,
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}