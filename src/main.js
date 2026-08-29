import * as THREE from 'three';

/* =========================================================
   Geo Dash 3D
   One world, one renderer. Mode 1 watches it from the side,
   mode 2 flies the camera around behind the player.
   ========================================================= */

/* ---------------- tuning ---------------- */

const LANE_W = 2.2;
const LANES = [-LANE_W, 0, LANE_W];          // -z is the player's left

const GRAVITY = -38;
const JUMP_V = 13.2;                          // ~0.70s hang, ~2.3 units high
const P_HALF = 0.45;
const HIT_HALF = 0.36;                        // forgiving hitbox
const GROUND_Y = P_HALF;

const SPEED_2D_START = 10, SPEED_2D_MAX = 12.5, SPEED_2D_RAMP = 0.09;
const SPEED_3D_START = 15, SPEED_3D_MAX = 26, SPEED_3D_RAMP = 0.13;

const PPS_2D = 1.15, PPS_3D = 1.6;            // points per second
const PORTAL_AT = 28;                         // score that spawns the portal
const SHIFT_DUR = 1.4;

const WALL_H = 4.2, WALL_Z = 4.4, WALL_SEG = 32, WALL_N = 6;
const STRIPE_GAP = 8, STRIPE_N = 22;
const RUNG_GAP = 8, RUNG_N = 20;
const BLOCK_HZ = 0.78;                        // half width of a lane block
const OB_POOL = 24;

const TURN_FIRST = 190, TURN_MIN = 240, TURN_VAR = 130;
const TURN_WINDOW = 46;                       // how early the arrow appears
const TURN_SWING = 0.65;                      // seconds of camera swing

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (n) => (Math.random() * n) | 0;

/* ---------------- renderer ---------------- */

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070f);
scene.fog = new THREE.Fog(0x07070f, 30, 108);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);

scene.add(new THREE.HemisphereLight(0x99aaff, 0x101024, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 0.55);
sun.position.set(1, 2.4, 1.2);
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------------- world geometry ---------------- */

const box = new THREE.BoxGeometry(1, 1, 1);

// floor: one long plane that follows the player
const floorMat = new THREE.MeshLambertMaterial({ color: 0x15152c });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 420), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.rotation.z = Math.PI / 2;
scene.add(floor);

// apron: the ground either side of the track. Only exists for the side view,
// where the corridor floor alone would read as a floating ribbon.
const apronMat = new THREE.MeshLambertMaterial({ color: 0x15152c, transparent: true, opacity: 1 });
const apron = new THREE.Mesh(new THREE.PlaneGeometry(34, 420), apronMat);
apron.rotation.x = -Math.PI / 2;
apron.rotation.z = Math.PI / 2;
apron.position.set(0, -0.02, 11);
scene.add(apron);

// corridor walls + bright top rails, recycled forward
const wallMat = new THREE.MeshLambertMaterial({ color: 0x27274f });
const railMat = new THREE.MeshBasicMaterial({ color: 0x6a3cff, transparent: true, opacity: 0 });
const walls = [];
for (let side = 0; side < 2; side++) {
  for (let i = 0; i < WALL_N; i++) {
    const w = new THREE.Mesh(box, wallMat);
    const r = new THREE.Mesh(box, railMat);
    const z = side === 0 ? -WALL_Z : WALL_Z;
    w.scale.set(WALL_SEG - 0.4, WALL_H, 0.5);
    r.scale.set(WALL_SEG - 0.4, 0.18, 0.62);
    w.position.z = z;
    r.position.z = z;
    scene.add(w, r);
    walls.push({ wall: w, rail: r, near: side === 1 });
  }
}

// lane dividers
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x3d3d8f, transparent: true, opacity: 0 });
const stripes = [];
for (let side = 0; side < 2; side++) {
  for (let i = 0; i < STRIPE_N; i++) {
    const s = new THREE.Mesh(box, stripeMat);
    s.scale.set(3.4, 0.05, 0.16);
    s.position.set(0, 0.04, side === 0 ? -LANE_W / 2 - 0.05 : LANE_W / 2 + 0.05);
    scene.add(s);
    stripes.push(s);
  }
}

// rungs across the track: the motion cue in both views
const rungMat = new THREE.MeshBasicMaterial({ color: 0x2a2a5c, transparent: true, opacity: 0 });
const rungs = [];
for (let i = 0; i < RUNG_N; i++) {
  const r = new THREE.Mesh(box, rungMat);
  r.scale.set(0.22, 0.05, 8.6);
  r.position.y = 0.02;
  r.visible = false;
  scene.add(r);
  rungs.push(r);
}

// player
const player = new THREE.Mesh(
  box,
  new THREE.MeshLambertMaterial({ color: 0x22e6ff, emissive: 0x0b5e70 })
);
player.scale.setScalar(P_HALF * 2);
player.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(box),
  new THREE.LineBasicMaterial({ color: 0xffffff })
));
scene.add(player);

// portal
const portal = new THREE.Mesh(
  new THREE.TorusGeometry(2.9, 0.17, 10, 40),
  new THREE.MeshBasicMaterial({ color: 0x2effd5 })
);
portal.position.y = 2.3;
portal.visible = false;
scene.add(portal);

// corner wall for turns
const turnWall = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x9b5cff, emissive: 0x33127a }));
turnWall.scale.set(1.1, 3.6, 9.6);
turnWall.visible = false;
scene.add(turnWall);

// obstacle pool
const matBlock = new THREE.MeshLambertMaterial({ color: 0xff2e63, emissive: 0x5c0a22 });
const matLow = new THREE.MeshLambertMaterial({ color: 0xffc247, emissive: 0x5c3c00 });
const obstacles = [];
for (let i = 0; i < OB_POOL; i++) {
  const m = new THREE.Mesh(box, matBlock);
  m.visible = false;
  scene.add(m);
  obstacles.push({ mesh: m, on: false, x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0 });
}

function addOb(x, y, z, hx, hy, hz, low) {
  for (let i = 0; i < OB_POOL; i++) {
    const o = obstacles[i];
    if (o.on) continue;
    o.on = true;
    o.x = x; o.y = y; o.z = z;
    o.hx = hx; o.hy = hy; o.hz = hz;
    o.mesh.material = low ? matLow : matBlock;
    o.mesh.scale.set(hx * 2, hy * 2, hz * 2);
    o.mesh.position.set(x, y, z);
    o.mesh.visible = true;
    return o;
  }
  return null;
}

/* ---------------- dom ---------------- */

const elScore = document.getElementById('score');
const elBest = document.getElementById('best');
const elPanel = document.getElementById('panel');
const elTitle = document.getElementById('panelTitle');
const elBody = document.getElementById('panelBody');
const elKeys = document.getElementById('panelKeys');
const elBtn = document.getElementById('panelBtn');
const elFlash = document.getElementById('flash');
const elShift = document.getElementById('shiftText');
const elTurn = document.getElementById('turnCue');
const elTurnText = document.getElementById('turnText');

let best = Number(localStorage.getItem('geoDash3D.best') || 0);
elBest.textContent = 'BEST ' + best;

/* ---------------- state ---------------- */

const G = {
  mode: 'start',        // start | run2d | shift | run3d | over
  score: 0, shown: -1,
  speed: SPEED_2D_START,
  px: 0, py: GROUND_Y, vy: 0, grounded: true,
  lane: 1, laneZ: 0,
  spin: 0,
  coyote: 0, buffer: 0,
  modeT: 0,
  nextSpawn: 0,
  lastPattern: '',
  portalX: 0, portalOn: false,
  shiftT: 0,
  turn: null,
  overLock: 0
};

function reset() {
  G.mode = 'run2d';
  G.score = 0; G.shown = -1;
  G.speed = SPEED_2D_START;
  G.px = 0; G.py = GROUND_Y; G.vy = 0; G.grounded = true;
  G.lane = 1; G.laneZ = 0;
  G.spin = 0; G.coyote = 0.1; G.buffer = 0;
  G.modeT = 0;
  G.nextSpawn = 22;
  G.lastPattern = '';
  G.portalX = 0; G.portalOn = false;
  G.shiftT = 0;
  G.turn = null;
  G.overLock = 0;

  for (const o of obstacles) { o.on = false; o.mesh.visible = false; }
  portal.visible = false;
  turnWall.visible = false;
  turnWall.position.z = 0;

  for (let i = 0; i < walls.length; i++) {
    const seg = walls[i];
    seg.wall.position.x = (i % WALL_N) * WALL_SEG - 40;
    seg.rail.position.x = seg.wall.position.x;
    seg.wall.visible = false;
    seg.rail.visible = false;
  }
  for (let i = 0; i < stripes.length; i++) {
    stripes[i].position.x = (i % STRIPE_N) * STRIPE_GAP - 40;
    stripes[i].visible = false;
  }
  for (let i = 0; i < RUNG_N; i++) {
    rungs[i].position.x = i * RUNG_GAP - 40;
    rungs[i].visible = false;
  }
  stripeMat.opacity = 0;
  railMat.opacity = 0;
  rungMat.opacity = 0;
  apronMat.opacity = 1;
  apron.visible = true;

  elTurn.classList.add('hidden');
  elShift.classList.add('hidden');
  elShift.classList.remove('go');
  elFlash.classList.remove('go');
  elPanel.classList.add('hidden');
  elScore.textContent = '0';

  player.position.set(G.px, G.py, 0);
  placeCamera(0);
}

/* ---------------- input ---------------- */

function jump() {
  if (G.mode !== 'run2d' && G.mode !== 'run3d') return;
  if (G.coyote > 0) {
    G.vy = JUMP_V;
    G.grounded = false;
    G.coyote = 0;
  } else {
    G.buffer = 0.13;                       // remembered until we land
  }
}

function steer(dir) {                      // -1 left, +1 right
  if (G.mode !== 'run3d') return;
  const t = G.turn;
  if (t && t.state === 'pending' && G.px > t.x - TURN_WINDOW && dir === t.dir) {
    t.state = 'armed';                     // the press is consumed by the corner
    elTurn.classList.add('hidden');
    return;
  }
  G.lane = Math.max(0, Math.min(2, G.lane + dir));
}

function primary() {                       // space / tap / click
  if (G.mode === 'start') { reset(); return; }
  if (G.mode === 'over') { if (G.overLock <= 0) reset(); return; }
  jump();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'Space': case 'ArrowUp': case 'KeyW':
      e.preventDefault(); primary(); break;
    case 'ArrowLeft': case 'KeyA': steer(-1); break;
    case 'ArrowRight': case 'KeyD': steer(1); break;
    case 'Enter': case 'KeyR':
      if (G.mode === 'start' || (G.mode === 'over' && G.overLock <= 0)) reset();
      break;
  }
});

function pointer(e) {
  if (G.mode === 'run3d') {
    const x = e.clientX / window.innerWidth;
    if (x < 0.32) { steer(-1); return; }
    if (x > 0.68) { steer(1); return; }
  }
  primary();
}
canvas.addEventListener('pointerdown', pointer);
elPanel.addEventListener('pointerdown', (e) => { e.preventDefault(); primary(); });
elBtn.addEventListener('click', (e) => { e.stopPropagation(); });

/* ---------------- spawning ---------------- */

function spawn2D() {
  const r = Math.random();
  const tall = r < 0.3, wide = r > 0.72;      // never both: that pairing leaves a ~60ms window
  addOb(G.nextSpawn, tall ? 0.85 : 0.55, 0,
    wide ? 0.9 : 0.5, tall ? 0.85 : 0.55, 0.85, false);
  G.nextSpawn += G.speed * rnd(1.15, 1.7);
}

function spawn3D() {
  const x = G.nextSpawn;

  // keep the run-up to a corner clear
  const t = G.turn;
  if (t && x > t.x - 30 && x < t.x + 26) {
    G.nextSpawn = t.x + 26;
    return;
  }

  const r = Math.random();
  if (r < 0.22) {
    addOb(x, 0.35, 0, 0.5, 0.35, 3.5, true);          // low bar across all lanes: jump
    G.lastPattern = 'low';
  } else if (r < 0.72 || G.lastPattern === 'two') {
    const l = rndInt(3);
    addOb(x, 1.4, LANES[l], 0.5, 1.4, BLOCK_HZ, false); // one lane blocked
    G.lastPattern = 'one';
  } else {
    const open = rndInt(3);
    for (let i = 0; i < 3; i++) {
      if (i !== open) addOb(x, 1.4, LANES[i], 0.5, 1.4, BLOCK_HZ, false);
    }
    G.lastPattern = 'two';
  }
  G.nextSpawn += Math.max(12, G.speed * rnd(0.85, 1.35));
}

function scheduleTurn(atX) {
  G.turn = { x: atX, dir: Math.random() < 0.5 ? -1 : 1, state: 'pending', slide: 0, swing: -1 };
}

/* ---------------- camera ---------------- */

// side view and chase view, expressed as an orbit around the player
const A0 = Math.atan2(20.0, 4.6), R0 = Math.hypot(4.6, 20.0), Y0 = 2.6;
const A1 = Math.PI, R1 = 8.0, Y1 = 4.0;
const LOOK0 = new THREE.Vector3(4.6, 1.9, 0);
const LOOK1 = new THREE.Vector3(11.0, 1.5, 0);

const _off = new THREE.Vector3();
const _look = new THREE.Vector3();

function rotY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x; v.z = z;
}

function placeCamera(p) {                   // p: 0 = side view, 1 = chase view
  const e = easeInOut(clamp01(p));
  const a = A0 + (A1 - A0) * e;
  const r = R0 + (R1 - R0) * e;
  _off.set(r * Math.cos(a), Y0 + (Y1 - Y0) * e, r * Math.sin(a));
  _look.lerpVectors(LOOK0, LOOK1, e);

  // lane / jump follow, faded in as we swing behind the player
  _off.z += G.laneZ * 0.4 * e;
  _off.y += (G.py - GROUND_Y) * 0.22 * e;
  _look.z += G.laneZ * 0.75 * e;

  let roll = 0;
  const t = G.turn;
  if (t && t.swing >= 0 && t.swing < TURN_SWING) {
    const s = Math.sin(Math.PI * (t.swing / TURN_SWING));
    rotY(_off, t.dir * 0.30 * s);
    rotY(_look, t.dir * 0.58 * s);
    roll = -t.dir * 0.20 * s;
  }

  camera.position.set(G.px + _off.x, _off.y, _off.z);
  camera.lookAt(G.px + _look.x, _look.y, _look.z);
  if (roll) camera.rotateZ(roll);
}

/* ---------------- game over ---------------- */

function gameOver() {
  G.mode = 'over';
  G.overLock = 0.35;
  const s = Math.floor(G.score);
  if (s > best) {
    best = s;
    localStorage.setItem('geoDash3D.best', String(best));
    elBest.textContent = 'BEST ' + best;
  }
  elTurn.classList.add('hidden');
  elTitle.textContent = 'GAME OVER';
  elBody.textContent = 'Score ' + s + '   ·   Best ' + best;
  elKeys.textContent = 'SPACE / TAP — RESTART';
  elBtn.textContent = 'RESTART';
  elPanel.classList.remove('hidden');
}

/* ---------------- per-frame pieces ---------------- */

function updatePlayer(dt) {
  if (!G.grounded) {
    G.py += (G.vy + GRAVITY * dt * 0.5) * dt;   // exact under constant gravity at any frame rate
    G.vy += GRAVITY * dt;
    G.spin += 9.04 * dt;                    // exactly one flip per jump
    if (G.py <= GROUND_Y) {
      G.py = GROUND_Y; G.vy = 0; G.grounded = true;
      G.spin = Math.round(G.spin / (Math.PI / 2)) * (Math.PI / 2);
      if (G.buffer > 0) { G.vy = JUMP_V; G.grounded = false; G.buffer = 0; }
    }
  }
  G.coyote = G.grounded ? 0.1 : Math.max(0, G.coyote - dt);
  G.buffer = Math.max(0, G.buffer - dt);

  const target = G.mode === 'run3d' ? LANES[G.lane] : 0;
  G.laneZ += (target - G.laneZ) * (1 - Math.exp(-dt * 18));

  player.position.set(G.px, G.py, G.laneZ);
  player.rotation.z = -G.spin;
  player.rotation.x = (G.laneZ - target) * 0.24;
}

function hitTest() {
  const px = G.px, py = G.py, pz = G.laneZ;
  for (let i = 0; i < OB_POOL; i++) {
    const o = obstacles[i];
    if (!o.on) continue;
    if (Math.abs(px - o.x) < o.hx + HIT_HALF &&
        Math.abs(py - o.y) < o.hy + HIT_HALF &&
        Math.abs(pz - o.z) < o.hz + HIT_HALF) return true;
  }
  const t = G.turn;
  if (t && t.state === 'pending' && turnWall.visible &&
      Math.abs(px - t.x) < 0.55 + HIT_HALF && py < 3.6) return true;
  return false;
}

function recycleObstacles() {
  for (let i = 0; i < OB_POOL; i++) {
    const o = obstacles[i];
    if (o.on && o.x < G.px - 14) { o.on = false; o.mesh.visible = false; }
  }
}

function recycleDecor() {
  const wallSpan = WALL_SEG * WALL_N;
  for (const seg of walls) {
    if (seg.wall.position.x + WALL_SEG * 0.5 < G.px - 30) {
      seg.wall.position.x += wallSpan;
      seg.rail.position.x = seg.wall.position.x;
    }
  }
  const stripeSpan = STRIPE_GAP * STRIPE_N;
  for (const s of stripes) {
    if (s.position.x < G.px - 24) s.position.x += stripeSpan;
  }
  const rungSpan = RUNG_GAP * RUNG_N;
  for (const r of rungs) {
    if (r.position.x < G.px - 24) r.position.x += rungSpan;
  }
}

function updateTurn(dt) {
  const t = G.turn;
  if (!t) return;

  if (t.state === 'pending') {
    turnWall.visible = true;
    turnWall.position.set(t.x, 1.8, 0);
    if (G.px > t.x - TURN_WINDOW && elTurn.classList.contains('hidden')) {
      elTurnText.textContent = t.dir < 0 ? '← TURN LEFT' : 'TURN RIGHT →';
      elTurn.classList.remove('hidden');
    }
    return;
  }

  if (t.state === 'armed' && G.px > t.x - 11) {
    t.state = 'turning';
    t.swing = 0;
  }

  if (t.state === 'turning') {
    t.swing += dt;
    t.slide = Math.min(1, t.slide + dt * 2.6);
    turnWall.position.z = -t.dir * 13 * (1 - Math.pow(1 - t.slide, 3));
    if (t.swing >= TURN_SWING) {
      turnWall.visible = false;
      turnWall.position.z = 0;
      scheduleTurn(G.px + TURN_MIN + Math.random() * TURN_VAR);
    }
  }
}

function startShift() {
  G.mode = 'shift';
  G.shiftT = 0;
  G.lane = 1;
  G.vy = 0; G.py = GROUND_Y; G.grounded = true; G.spin = 0;
  for (const o of obstacles) { o.on = false; o.mesh.visible = false; }
  portal.visible = false;

  elFlash.classList.add('go');
  elShift.classList.remove('hidden');
  elShift.classList.add('go');

  for (const seg of walls) { seg.wall.visible = true; seg.rail.visible = true; }
  for (const s of stripes) s.visible = true;
  for (const r of rungs) r.visible = true;
}

function updateShiftVisuals(p) {
  for (const seg of walls) {
    const a = seg.near ? 0.68 : 0.42;       // the near wall rises last, so it never blocks the view
    const g = clamp01((p - a) / (0.99 - a));
    const h = Math.max(0.001, WALL_H * g);
    seg.wall.scale.y = h;
    seg.wall.position.y = h / 2;
    seg.rail.position.y = h + 0.09;
    seg.rail.visible = g > 0.02;
  }
  const o = clamp01((p - 0.55) / 0.4);
  stripeMat.opacity = o * 0.9;
  railMat.opacity = o;
  rungMat.opacity = o;

  const a = 1 - clamp01((p - 0.2) / 0.4);
  apronMat.opacity = a;
  apron.visible = a > 0.01;
}

/* ---------------- update ---------------- */

function update(dt) {
  if (G.mode === 'start' || G.mode === 'over') {
    G.overLock = Math.max(0, G.overLock - dt);
    return;
  }

  if (G.mode === 'run2d') {
    G.modeT += dt;
    G.speed = Math.min(SPEED_2D_MAX, SPEED_2D_START + G.modeT * SPEED_2D_RAMP);
    G.px += G.speed * dt;
    G.score += PPS_2D * dt;

    updatePlayer(dt);

    if (!G.portalOn && G.score >= PORTAL_AT) {
      G.portalOn = true;
      G.portalX = G.px + 34;
      portal.position.x = G.portalX;
      portal.visible = true;
      for (const o of obstacles) {
        if (o.on && o.x > G.portalX - 7) { o.on = false; o.mesh.visible = false; }
      }
    }

    if (!G.portalOn) {
      while (G.nextSpawn < G.px + 78) spawn2D();
    } else {
      portal.rotation.z += dt * 1.6;
      if (G.px >= G.portalX) { startShift(); return; }
    }

    if (hitTest()) { gameOver(); return; }
    recycleObstacles();
    recycleDecor();
    placeCamera(0);
    return;
  }

  if (G.mode === 'shift') {
    G.shiftT += dt;
    const p = clamp01(G.shiftT / SHIFT_DUR);
    G.speed = SPEED_2D_MAX + (SPEED_3D_START - SPEED_2D_MAX) * p;
    G.px += G.speed * dt;
    G.score += PPS_2D * dt;

    updatePlayer(dt);
    updateShiftVisuals(p);
    recycleDecor();
    placeCamera(p);

    if (p >= 1) {
      G.mode = 'run3d';
      G.modeT = 0;
      G.nextSpawn = G.px + 34;
      G.lastPattern = '';
      scheduleTurn(G.px + TURN_FIRST);
      setTimeout(() => elShift.classList.add('hidden'), 900);
    }
    return;
  }

  if (G.mode === 'run3d') {
    G.modeT += dt;
    G.speed = Math.min(SPEED_3D_MAX, SPEED_3D_START + G.modeT * SPEED_3D_RAMP);
    G.px += G.speed * dt;
    G.score += PPS_3D * dt;

    updatePlayer(dt);
    updateTurn(dt);
    while (G.nextSpawn < G.px + 82) spawn3D();

    if (hitTest()) { gameOver(); return; }
    recycleObstacles();
    recycleDecor();
    placeCamera(1);
  }
}

/* ---------------- loop ---------------- */

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  update(dt);
  floor.position.x = G.px + 150;
  apron.position.x = floor.position.x;

  const s = Math.floor(G.score);
  if (s !== G.shown) { G.shown = s; elScore.textContent = s; }

  renderer.render(scene, camera);
}

document.addEventListener('visibilitychange', () => { last = performance.now(); });

/* ---------------- boot ---------------- */

player.position.set(0, GROUND_Y, 0);
placeCamera(0);
elPanel.classList.remove('hidden');
requestAnimationFrame(frame);
