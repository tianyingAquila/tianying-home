/* ==========================================================================
   天鹰档案终端 · 3D 档案阵列（PC 端专用）
   几何、排布、镜头与波形逐项对齐 LBEILC/RhineLabUI（MIT License，
   Copyright (c) 2026 LBEILC）；但不加载它的模型资产 ——
   档案盒用长方体 + 程序化贴图生成，省略内部环腔等细节。
     通道间距 5.2、排距 0.62、盒体 5 × 3.76 × 0.31
     镜头：方位角 57.3°、仰角 21.8°、距离 105.17、纵向取景 9.02 世界单位
           （从原版实机取到的稳定值，比 DESIGN.md 的胶片基准更近）
     选中档案恒定停在画面左侧约三分之一处
   ========================================================================== */
import * as THREE from "./lib/three.module.min.js";

/* ---------------------------------------------------------------- 阵列参数 */

const COL_SPACING = 5.2;      // 通道间距（X）
const ROW_SPACING = 0.62;     // 排距（Z）
const CARD_W = 5;             // 盒宽（沿 X）
const CARD_H = 3.76;          // 盒高（沿 Y）
const CARD_D = 0.31;          // 盒厚（沿 Z）
const BASE_Y = -4.6;          // 阵列基准面
const SLOT_LANE = 2;          // 选中档案所在通道（x = 0）
const SLOT_ROW = 12;          // 选中档案所在排

const CAM_YAW = 57.3;         // 方位角：从阵列左端朝里看
const CAM_ELEV = 21.8;        // 仰角：略俯视
const CAM_DIST = 105.17;      // 相机距离（原版实机稳定值）
const VIEW_SPAN = 9.02;       // 画面纵向覆盖的世界单位（16:9 基准）
const AIM_X = -0.73;
const AIM_Y = 0.65;
const AIM_Z = 0.43;

const BG = 0xe9e4e1;          // 画布底色（暖白，与原版页面一致）
const CARD_BASE = 0xf1e9dc;   // 档案盒本体
const CARD_LIT = 0xfffcf2;    // 选中 / 悬停时提亮
const INLAY = 0xc9a163;       // 端面香槟嵌条

const LIFT = 0.9;             // 选中档案抬起高度
const HOVER_LIFT = 0.26;      // 鼠标指到哪一册，哪一册微抬
const LANE_MIN = -2;          // 实例通道范围（含换档补位）
const LANE_MAX = 10;
const ROW_LIMIT = 90;         // 单侧最多铺多少排，防止极端比例下爆量
const CAPACITY = 2600;        // 实例缓冲上限

/* -------------------------------------------- 波形（移植自 RhineLabUI 原式） */

const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + t * 6));
};
const bell = (x, width) => Math.exp(-0.5 * (x / width) ** 2);

// 选中档案周围的肩部抬升：中心最高，向两侧衰减成一道缓慢的垄
function shoulderWave(dRow) {
  const envelope = Math.max(-0.42, 2.15 - 0.17 * (Math.sqrt(dRow * dRow + 1) - 1));
  const age = 1.51 - Math.abs(dRow) * 0.065;
  const rise = smooth(age / 0.62);
  const ring = age > 0 ? Math.sin(age * 5.1) * Math.exp(-age * 1.3) : 0;
  return envelope * (rise + 0.18 * ring * smooth(age / 0.16));
}

// 横向强度：选中通道最强，相邻通道只剩三成，远处压到最低
const columnStrength = (dLane) => 0.25 + 0.75 * bell(dLane, 0.55);

// 静止时的呼吸感（最大约 0.1，不到盒高的 3%）
function idleWave(row, lane, time) {
  return (
    0.075 * Math.sin((time * Math.PI * 2) / 8 + row * 0.3 - lane * 0.45) +
    0.027 * Math.sin((time * Math.PI * 2) / 13 - row * 0.17 + lane * 0.3)
  );
}

// 换档时从选中档案扩散出去的涟漪
function rippleWave(distance, age) {
  if (age < 0 || age > 3.2) return 0;
  return (
    0.8 *
    smooth(age / 0.2) *
    Math.exp(-age * 1.15) *
    Math.cos((distance - age * 8) * 0.58) *
    bell(distance - age * 8, 3.4)
  );
}

const wrap = (v, n) => ((v % n) + n) % n;
// 取周期内最短的滑动步数，避免长距离平移把阵列拖出画面
function wrapShort(delta, period) {
  const p = Math.max(1, period);
  const rest = wrap(delta, p);
  return rest > p / 2 ? rest - p : rest;
}

/* ---------------------------------------------------- 程序化贴图（无外部素材） */

// 大面：磨砂亚克力面板 —— 顶端亮、往下压暗，正是原版那种"立着的档案板"的观感。
// （对应原实现的 onBeforeCompile：diffuse * mix(vec3(.40,.30,.20), vec3(1,.98,.94), smoothstep(.1,1,y/3.7))）
function makeCardTexture(renderer) {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#fefdfb");
  grad.addColorStop(0.04, "#f8f3ea");
  grad.addColorStop(0.08, "#ece2d3");
  grad.addColorStop(0.12, "#ddccb5");
  grad.addColorStop(0.16, "#ceb9a0");
  grad.addColorStop(0.2, "#c3ae96");
  grad.addColorStop(0.3, "#bca891");
  grad.addColorStop(1, "#b6a28c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.strokeStyle = "rgba(126,110,92,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

// 顶面标签：一小条印刷块 + 一颗螺钉（原模型的 Printed_Label）
function makeLabelTexture() {
  const w = 512;
  const h = 96;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(52,48,42,0.5)";
  ctx.fillRect(46, 34, 188, 26);
  ctx.fillStyle = "rgba(248,245,240,0.85)";
  ctx.font = "600 17px 'Segoe UI', 'PingFang SC', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("TIANYING ARCHIVE", 56, 48);

  ctx.beginPath();
  ctx.arc(22, 47, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(70,66,58,0.32)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(22, 47, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30,28,24,0.3)";
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------------- 舞台 */

export function createStage(canvas, columns, hooks) {
  const onPick = (hooks && hooks.onPick) || function () {};

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, CAM_DIST + 5, CAM_DIST + 25);

  const aim = new THREE.Vector3(AIM_X, AIM_Y, AIM_Z);
  const camera = new THREE.PerspectiveCamera(5, 1, 5, 400);
  const yaw = THREE.MathUtils.degToRad(CAM_YAW);
  const elev = THREE.MathUtils.degToRad(CAM_ELEV);
  const viewDir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(elev),
    Math.sin(elev),
    Math.cos(yaw) * Math.cos(elev),
  );
  camera.position.copy(aim).addScaledVector(viewDir, CAM_DIST);
  camera.lookAt(aim);
  const forward = viewDir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  /* ------------------------------------------------------------- 灯光 */

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdbe, 1.18));
  scene.add(new THREE.AmbientLight(0xffffff, 0.44));

  const key = new THREE.DirectionalLight(0xfffaf2, 2.7);
  key.position.set(AIM_X - 48, AIM_Y + 84, AIM_Z - 30);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -70;
  key.shadow.camera.right = 70;
  key.shadow.camera.top = 70;
  key.shadow.camera.bottom = -70;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 260;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xfffaf4, 0.92);
  fill.position.set(AIM_X + 42, AIM_Y + 46, AIM_Z + 62);
  scene.add(fill);

  /* ----------------------------------------------------------- 档案盒 */

  const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
  const DEBUG_FACES = new URLSearchParams(location.search).has("faces");
  // 六个面分开给材质：大面用带渐变的磨砂面板，端面/顶面用象牙色包边
  const panelMat = new THREE.MeshStandardMaterial({
    map: makeCardTexture(renderer),
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xfaf5ec, roughness: 0.44 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0xcbbfae, roughness: 0.7 });
  const material = DEBUG_FACES
    ? [
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        new THREE.MeshBasicMaterial({ color: 0x0000ff }),
        new THREE.MeshBasicMaterial({ color: 0xffff00 }),
        new THREE.MeshBasicMaterial({ color: 0xff00ff }),
        new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      ]
    : [edgeMat, edgeMat, topMat, underMat, panelMat, panelMat];
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // 顶面标签
  const labels = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.35, 0.19),
    new THREE.MeshBasicMaterial({ map: makeLabelTexture(), transparent: true, opacity: 0.72, depthWrite: false }),
    CAPACITY,
  );
  labels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  labels.count = 0;
  labels.frustumCulled = false;
  scene.add(labels);

  // 端面香槟嵌条（原模型的 Amber_Optical_Inlay）
  const inlays = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.035, 3.1),
    new THREE.MeshBasicMaterial({ color: INLAY, transparent: true, opacity: 0.34, depthWrite: false }),
    CAPACITY,
  );
  inlays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inlays.count = 0;
  inlays.frustumCulled = false;
  scene.add(inlays);

  const dummy = new THREE.Object3D();
  const cardMatrix = new THREE.Matrix4();
  const labelLocal = new THREE.Matrix4().makeTranslation(-1.25, CARD_H / 2 + 0.004, 0.02);
  const labelFlat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const endLocal = new THREE.Matrix4().makeTranslation(-CARD_W / 2 - 0.004, 0, 0);
  const endFace = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const color = new THREE.Color();
  const baseColor = new THREE.Color(CARD_BASE);
  const litColor = new THREE.Color(CARD_LIT);

  /* ------------------------------------------------------------- 状态 */

  let cells = [];
  let halfWidth = 8;
  let col = 0;
  let row = 0;
  let shiftX = 0;          // 换档时整片阵列的临时位移（会衰减回 0）
  let shiftZ = 0;
  let liftValue = 0;       // 选中档案当前抬起高度
  let liftTarget = LIFT;
  let hoverValue = 0;      // 悬停档案当前抬起高度
  let hoverL = null;
  let hoverR = null;
  let pulses = [];         // 换档涟漪
  let running = true;
  let lastTime = performance.now() / 1000;

  /* ---------------------------------------------- 实例范围（按取景计算） */

  function rebuildCells() {
    const reach = halfWidth * 1.16;
    const list = [];
    for (let L = LANE_MIN; L <= LANE_MAX; L += 1) {
      const x = (L - 2) * COL_SPACING;
      const sideways = right.x * (x - AIM_X);
      const zA = AIM_Z + (-reach - sideways) / right.z;
      const zB = AIM_Z + (reach - sideways) / right.z;
      const lo = Math.min(zA, zB);
      const hi = Math.max(zA, zB);
      let rMin = Math.floor(lo / ROW_SPACING + 15.5) - 3;
      let rMax = Math.ceil(hi / ROW_SPACING + 15.5) + 3;
      rMin = Math.max(rMin, -ROW_LIMIT);
      rMax = Math.min(rMax, ROW_LIMIT);
      for (let R = rMin; R <= rMax && list.length < CAPACITY; R += 1) {
        list.push({ L, R });
      }
    }
    cells = list;
  }

  /* ------------------------------------------------------------ 写入矩阵 */

  function writeMatrices(time) {
    const count = cells.length;
    for (let i = 0; i < count; i += 1) {
      const cell = cells[i];
      const dLane = cell.L - SLOT_LANE;
      const dRow = cell.R - SLOT_ROW;
      const isChosen = dLane === 0 && dRow === 0;
      const isHover = cell.L === hoverL && cell.R === hoverR;

      let height = shoulderWave(dRow) * columnStrength(dLane) + idleWave(cell.R, cell.L, time);
      for (let p = 0; p < pulses.length; p += 1) {
        const pulse = pulses[p];
        const distance = Math.hypot(cell.R - pulse.row, (cell.L - pulse.lane) * 2.2);
        height += rippleWave(distance, time - pulse.time);
      }

      const lift = isChosen ? liftValue : isHover ? hoverValue : 0;
      const x = (cell.L - 2) * COL_SPACING + shiftX;
      const y = BASE_Y + height + lift;
      const z = (cell.R - 15.5) * ROW_SPACING + shiftZ;
      const slope = shoulderWave(dRow + 0.5) - shoulderWave(dRow - 0.5);
      const pitch = slope * 0.024;

      dummy.position.set(x, y, z);
      dummy.rotation.set(pitch, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      cardMatrix.copy(dummy.matrix);

      // 每册微调一点冷暖，避免整片死白
      const tone = (((cell.L * 92821) ^ (cell.R * 68917)) % 100) / 100;
      const mix = isChosen ? 1 : isHover ? 0.55 : 0;
      color.copy(baseColor).multiplyScalar(0.975 + tone * 0.035).lerp(litColor, mix);
      mesh.setColorAt(i, color);

      // 顶面标签（贴在靠左一端）与端面嵌条：直接拼在卡片矩阵上
      dummy.matrix.multiply(labelLocal).multiply(labelFlat);
      labels.setMatrixAt(i, dummy.matrix);
      dummy.matrix.copy(cardMatrix).multiply(endLocal).multiply(endFace);
      inlays.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = count;
    labels.count = count;
    inlays.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    labels.instanceMatrix.needsUpdate = true;
    inlays.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /* ---------------------------------------------------------------- 循环 */

  function frame() {
    if (!running) { return; }
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(0.001, now - lastTime));
    lastTime = now;

    const decay = 1 - Math.exp(-dt * 7.2);
    shiftX -= shiftX * decay;
    shiftZ -= shiftZ * decay;
    if (Math.abs(shiftX) < 0.0005) { shiftX = 0; }
    if (Math.abs(shiftZ) < 0.0005) { shiftZ = 0; }

    const ease = 1 - Math.exp(-dt * 6.5);
    liftValue += (liftTarget - liftValue) * ease;
    const hoverEase = 1 - Math.exp(-dt * 12);
    hoverValue += ((hoverL === null ? 0 : HOVER_LIFT) - hoverValue) * hoverEase;

    if (pulses.length) {
      pulses = pulses.filter((pulse) => now - pulse.time < 3.2);
    }

    writeMatrices(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- 尺寸 */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const aspect = w / h;
    // 与参考实现一致：横向固定覆盖 16 个世界单位，纵向按比例放大
    const span = Math.max(VIEW_SPAN, (VIEW_SPAN * (16 / 9)) / aspect);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(span / (2 * CAM_DIST)));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    halfWidth = (span * aspect) / 2;
    rebuildCells();
  }

  /* ------------------------------------------------------------ 鼠标交互 */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hitCell(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit || hit.instanceId === undefined) { return null; }
    return cells[hit.instanceId] || null;
  }

  function entryAt(lane, rowIndex) {
    if (!columns.length) { return null; }
    const colIndex = wrap(col + (lane - SLOT_LANE), columns.length);
    const list = columns[colIndex] ? columns[colIndex].entries : null;
    if (!list || !list.length) { return null; }
    const entryIndex = wrap(row + (rowIndex - SLOT_ROW), list.length);
    return { colIndex, entryIndex, entry: list[entryIndex] };
  }

  canvas.addEventListener("pointermove", (event) => {
    const cell = hitCell(event);
    hoverL = cell ? cell.L : null;
    hoverR = cell ? cell.R : null;
    canvas.style.cursor = cell ? "pointer" : "default";
  });

  canvas.addEventListener("pointerleave", () => {
    hoverL = null;
    hoverR = null;
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) { return; }
    const cell = hitCell(event);
    if (!cell) { return; }
    const info = entryAt(cell.L, cell.R);
    if (!info) { return; }
    onPick({
      colIndex: info.colIndex,
      entryIndex: info.entryIndex,
      entry: info.entry,
      dLane: cell.L - SLOT_LANE,
      dRow: cell.R - SLOT_ROW,
    });
  });

  /* ---------------------------------------------------------------- 换档 */

  function spawnPulse(lane, rowIndex) {
    pulses.push({ lane, row: rowIndex, time: performance.now() / 1000 });
    if (pulses.length > 3) { pulses = pulses.slice(-3); }
  }

  function applySlide(dLane, dRow, pulseAt) {
    const periodL = columns.length || 1;
    const list = columns[col] ? columns[col].entries : [];
    const periodR = list.length || 1;
    const stepL = wrapShort(dLane, periodL);
    const stepR = wrapShort(dRow, periodR);
    // 先把整片阵列瞬移一个"步"，再让位移衰减回零：看起来就是无缝滑动一格
    shiftX += stepL * COL_SPACING;
    shiftZ += stepR * ROW_SPACING;
    if (pulseAt) {
      spawnPulse(pulseAt.L, pulseAt.R);
    } else {
      spawnPulse(SLOT_LANE + stepL, SLOT_ROW + stepR);
    }
  }

  window.addEventListener("resize", resize);
  resize();
  writeMatrices(performance.now() / 1000);
  frame();

  // 调试入口：控制台里 __arc3d.cells() / __arc3d.camera 可以核对阵列与镜头
  window.__arc3d = {
    camera,
    mesh,
    cells: () => cells,
    state: () => ({ col, row, shiftX, shiftZ, liftValue }),
    pick: (nx, ny) => {
      ndc.set(nx, ny);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      return hit ? { normal: hit.face.normal.toArray(), distance: hit.distance, instanceId: hit.instanceId, cell: cells[hit.instanceId] } : null;
    },
  };

  return {
    // 点击阵列：把点中的那一册滑到选中位（dLane / dRow 是它相对选中位的格数）
    selectCell(nextCol, nextRow, dLane, dRow) {
      const periodL = columns.length || 1;
      col = wrap(nextCol, periodL);
      const list = columns[col] ? columns[col].entries : [];
      row = list.length ? wrap(nextRow, list.length) : 0;
      applySlide(dLane || 0, dRow || 0, {
        L: SLOT_LANE + (dLane || 0),
        R: SLOT_ROW + (dRow || 0),
      });
    },
    goColumn(delta) {
      const periodL = columns.length || 1;
      col = wrap(col + delta, periodL);
      const list = columns[col] ? columns[col].entries : [];
      row = list.length ? Math.min(row, list.length - 1) : 0;
      applySlide(delta, 0, null);
    },
    goRow(delta) {
      const list = columns[col] ? columns[col].entries : [];
      if (!list.length) { return; }
      row = wrap(row + delta, list.length);
      applySlide(0, delta, null);
    },
    setLift(value) {
      liftTarget = typeof value === "number" ? value : LIFT;
    },
    current() {
      return { col, row };
    },
    resize,
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      geometry.dispose();
      (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
      renderer.dispose();
    },
  };
}
