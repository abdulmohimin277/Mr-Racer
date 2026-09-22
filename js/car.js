/* ============================================================
   CarBuilder — procedural low-poly 3D car models
   (sport racer for the player, sedans & trucks for traffic)
   ============================================================ */
'use strict';

const CarBuilder = (() => {

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 18);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.92, metalness: 0.1 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, roughness: 0.35, metalness: 0.8 });

  function makeWheel() {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    return w;
  }

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0e1b33, metalness: 0.6, roughness: 0.12,
    transparent: true, opacity: 0.92, side: THREE.DoubleSide,
  });

  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff6c8, emissiveIntensity: 1.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.4,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dce8, metalness: 0.95, roughness: 0.2 });

  /* Sport (player) car — sleek, low, with rear wing */
  function buildSport(bodyColor, opts = {}) {
    const { underglow = null } = opts;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.55, roughness: 0.28 });

    // main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.3), mat);
    body.position.y = 0.52;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // nose wedge
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 1.1), mat);
    nose.position.set(0, 0.38, 2.35);
    nose.rotation.x = -0.12;
    g.add(nose);

    // rear haunch
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.4, 1.2), mat);
    tail.position.set(0, 0.45, -2.32);
    tail.rotation.x = 0.1;
    g.add(tail);

    // cabin / canopy (sporty bubble)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.1), glassMat);
    cabin.position.set(0, 1.0, -0.15);
    cabin.rotation.x = 0.03;
    g.add(cabin);

    // roof strip hints at sportiness
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.06, 1.6), mat);
    roof.position.set(0, 1.27, -0.15);
    g.add(roof);

    // rear spoiler
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.55), mat);
    wing.position.set(0, 1.28, -2.1);
    const wingArmL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.22), mat);
    wingArmL.position.set(-0.62, 1.12, -2.1);
    const wingArmR = wingArmL.clone();
    wingArmR.position.x = 0.62;
    g.add(wing, wingArmL, wingArmR);

    // headlights
    const hlGeo = new THREE.BoxGeometry(0.34, 0.13, 0.06);
    const hlL = new THREE.Mesh(hlGeo, lightMat);
    hlL.position.set(-0.62, 0.55, 2.42);
    const hlR = hlL.clone();
    hlR.position.x = 0.62;
    g.add(hlL, hlR);

    // taillight bar
    const tL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.08), tailMat);
    tL.position.set(0, 0.62, -2.46);
    g.add(tL);

    // front splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), chromeMat);
    splitter.position.set(0, 0.14, 2.5);
    splitter.castShadow = true;
    g.add(splitter);

    // wheels
    const wheelPos = [
      [-0.85, -0.62], [0.85, -0.62],
      [-0.85, 0.62], [0.85, 0.62],
    ];
    for (let i = 0; i < 4; i++) {
      const w = makeWheel();
      w.position.set(wheelPos[i][0], 0.36, wheelPos[i][1] * 1.55);
      g.add(w);
    }

    // neon underglow disc
    if (underglow) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.05, 20),
        new THREE.MeshBasicMaterial({
          color: underglow,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.06;
      glow.renderOrder = 1;
      g.add(glow);
    }

    return g;
  }

  /* Sedan — everyday traffic */
  function buildSedan(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.55, 4.1), mat);
    body.position.y = 0.55;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), glassMat);
    cabin.position.set(0, 1.08, -0.1);
    g.add(cabin);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 1.0), mat);
    hood.position.set(0, 0.95, 1.6);
    g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.9), mat);
    trunk.position.set(0, 0.95, -1.7);
    g.add(trunk);

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), lightMat);
    hl.position.set(-0.62, 0.62, 2.28);
    const hlR = hl.clone(); hlR.position.x = 0.62;
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.08), tailMat);
    tl.position.set(0, 0.62, -2.3);
    g.add(hl, hlR, tl);

    const wheelPos = [[-0.75, -0.72], [0.75, -0.72], [-0.75, 0.72], [0.75, 0.72]];
    for (let i = 0; i < 4; i++) {
      const w = makeWheel();
      w.position.set(wheelPos[i][0], 0.36, wheelPos[i][1] * 1.5);
      g.add(w);
    }
    return g;
  }

  /* Cargo truck — heavy traffic */
  function buildTruck(color) {
    const g = new THREE.Group();
    const cabMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xdfe4f0, metalness: 0.1, roughness: 0.65 });

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.4), cabMat);
    cab.position.set(0, 1.0, 1.7);
    cab.castShadow = true; cab.receiveShadow = true;
    g.add(cab);

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), glassMat);
    cabGlass.position.set(0, 1.45, 2.0);
    g.add(cabGlass);

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 3.4), boxMat);
    cargo.position.set(0, 1.05, -0.9);
    cargo.castShadow = true; cargo.receiveShadow = true;
    g.add(cargo);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.08), tailMat);
    tl.position.set(0, 1.35, -2.6);
    g.add(tl);

    const wheelPos = [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8], [-0.85, -1.6], [0.85, -1.6]];
    for (let i = 0; i < wheelPos.length; i++) {
      const w = makeWheel();
      w.position.set(wheelPos[i][0], 0.36, wheelPos[i][1] * 1.1);
      g.add(w);
    }
    return g;
  }

  const TRAFFIC_COLORS = [
    0x3b82f6, 0xef4444, 0xffffff, 0x10b981, 0xf97316,
    0x8b5cf6, 0x64748b, 0xfacc15, 0xec4899, 0x14b8a6, 0x78716c, 0xe2e8f0,
  ];

  let sedanIdx = 0;
  function buildTraffic(random = Math.random) {
    const color = TRAFFIC_COLORS[(sedanIdx++) % TRAFFIC_COLORS.length];
    const r = random();
    if (r < 0.18) return buildTruck(color);
    return buildSedan(color);
  }

  return {
    buildSport,
    buildSedan,
    buildTruck,
    buildTraffic,
  };
})();