/* ============================================================
   Effects — blaster bolts, explosions/particles, floating texts
   ============================================================ */
'use strict';

/* ---------------- Floating score texts (DOM) ---------------- */
const FloatTexts = (() => {
  const layer = () => document.getElementById('float-layer');

  function show(text, color, worldPos, camera) {
    const layerEl = layer();
    if (!layerEl) return;
    const v = worldPos.clone().project(camera);
    // ignore things behind the camera
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('span');
    el.className = 'float-text';
    el.style.color = color || '#fff';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.textContent = text;
    layerEl.appendChild(el);
    setTimeout(() => el.remove(), 1050);
  }

  return { show };
})();

/* ---------------- Blaster bolts ---------------- */
const Bolts = (() => {
  const MAX = 24;
  const pool = [];
  let scene = null;
  const geo = new THREE.BoxGeometry(0.22, 0.22, 2.8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffa93c,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function init(sc) {
    scene = sc;
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      scene.add(m);
      pool.push({ mesh: m, active: false, z: 0, x: 0, y: 0 });
    }
  }

  function fire(x, y, z, charge) {
    const b = pool.find((p) => !p.active);
    if (!b) return;
    b.active = true;
    b.x = x; b.y = y; b.z = z;
    b.mesh.position.set(x, y, z);
    const s = 1 + charge * 2.2;            // charged shots are bigger
    b.mesh.scale.set(s, s, s * (1 + charge * 1.5));
    b.mesh.visible = true;
  }

  function update(dt, speed) {
    for (const b of pool) {
      if (!b.active) continue;
      b.z += (speed - 170) * dt;           // bolt flies forward (-z) relative to the world
      b.mesh.position.z = b.z;
      if (b.z < -345 || b.z > 15) { b.active = false; b.mesh.visible = false; }
    }
  }

  function allActive() {
    return pool.filter((b) => b.active);
  }

  function hit(b) {
    b.active = false;
    b.mesh.visible = false;
  }

  return { init, fire, update, allActive, hit };
})();

/* ---------------- Particles / explosions ---------------- */
const Particles = (() => {
  const MAX = 240;
  const pool = [];
  let scene = null;
  const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const baseMat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function init(sc) {
    scene = sc;
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(geo, baseMat.clone());
      m.visible = false;
      scene.add(m);
      pool.push({
        mesh: m,
        active: false, life: 0, maxLife: 1,
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        shrink: 1,
      });
    }
  }

  function burst(pos, colors, count, power, gravity) {
    let used = 0;
    for (const p of pool) {
      if (p.active) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.scale.set(1, 1, 1);
      p.mesh.material.color.copy(colors[(Math.random() * colors.length) | 0]);
      const ang = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.4) * Math.PI;
      const sp = (0.4 + Math.random() * 1.4) * power;
      p.vel.set(
        Math.cos(ang) * Math.cos(elev) * sp,
        Math.abs(Math.sin(elev)) * sp + 1.5,
        Math.sin(ang) * Math.cos(elev) * sp
      );
      p.life = p.maxLife = 0.5 + Math.random() * 0.7;
      p.shrink = 0.6 + Math.random() * 0.9;
      if (++used >= count) break;
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
      p.vel.y -= 9 * dt * 0.35;          // light gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = t;
      const s = p.shrink * (0.4 + t * 0.8);
      p.mesh.scale.set(s, s, s);
    }
  }

  return { init, burst, update };
})();

/* ---------------- Smoke (grey, for near-miss / skids) ---------------- */
const Smoke = (() => {
  const MAX = 60;
  const pool = [];
  let scene = null;
  const geo = new THREE.SphereGeometry(0.5, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9aa3b8, transparent: true, opacity: 0.4, depthWrite: false,
  });

  function init(sc) {
    scene = sc;
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      scene.add(m);
      pool.push({ mesh: m, active: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), grow: 1 });
    }
  }

  function emit(pos, vel, count) {
    let used = 0;
    for (const p of pool) {
      if (p.active) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      p.vel.copy(vel).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2));
      p.life = p.maxLife = 0.8 + Math.random() * 0.8;
      p.grow = 1.4 + Math.random();
      if (++used >= count) break;
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = 0.42 * t;
      p.mesh.scale.setScalar(0.8 + (1 - t) * p.grow);
    }
  }

  return { init, emit, update };
})();