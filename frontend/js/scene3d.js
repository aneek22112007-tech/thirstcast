/**
 * ThirstCast — Cinematic 3D Earth & Scroll-Driven Storytelling
 * Built with Three.js (vendor/three/three.min.js)
 *
 * Architecture:
 *   - Uses IntersectionObserver to watch each .story-step element
 *   - Maps viewport-center position to a 0-1 scroll progress
 *   - Each scene has a keyframe descriptor: camera position, globe rotation,
 *     particle/overlay state, and easing
 *   - Smooth lerp with separate rates for camera vs. overlay elements
 */

import { prefersReducedMotion } from "./format.js";

// ─── Pilot district lat/lon ───────────────────────────────────────────────────
const PILOT_COORDS = {
  Bengaluru_Urban: { lat: 12.9508, lon: 77.5959, name: "Bengaluru Urban", color: 0x55e6cd },
  Kolar:           { lat: 13.1393, lon: 78.2177, name: "Kolar",           color: 0xf6b94a },
  Mandya:          { lat: 12.6104, lon: 76.7980, name: "Mandya",          color: 0x5dd68a },
};

function latLonToVector3(lat, lon, radius) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── Smooth easing functions ──────────────────────────────────────────────────
const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeOutExpo    = t => t === 1 ? 1 : 1 - Math.pow(2, -10*t);
const easeOutQuart   = t => 1 - Math.pow(1-t, 4);

// ─── Scene keyframes: 6 scenes, each defines camera & globe target state ──────
const SCENES = [
  // Scene 0: The Atmosphere – orbital wide shot
  {
    camPos:    { x: 0,    y: 1.5,  z: 22  },
    camLookAt: { x: 0,    y: 0,    z: 0   },
    globeRotDelta: { x: 0,     y: 0     },
    fogDensity: 0.022,
    label: "Orbital Climatology",
  },
  // Scene 1: Water Cycle – begin zoom toward Karnataka
  {
    camPos:    { x: 1.5,  y: 0.5,  z: 16  },
    camLookAt: { x: 0.5,  y: 0,    z: 0   },
    globeRotDelta: { x: 0.08,  y: -0.18 },
    fogDensity: 0.019,
    label: "FAO-56 Penman-Monteith",
  },
  // Scene 2: Atmospheric Demand – closer zoom, Karnataka centre
  {
    camPos:    { x: 2.5,  y: -0.5, z: 12  },
    camLookAt: { x: 1.0,  y: -0.3, z: 0   },
    globeRotDelta: { x: 0.14,  y: -0.34 },
    fogDensity: 0.016,
    label: "30-Year ERA5 Baseline",
  },
  // Scene 3: Thirstwave Trigger – tight zoom, chart view
  {
    camPos:    { x: 3.2,  y: -0.8, z: 9.5 },
    camLookAt: { x: 1.4,  y: -0.5, z: 0   },
    globeRotDelta: { x: 0.17,  y: -0.44 },
    fogDensity: 0.013,
    label: "≥3 Consecutive Days > p90",
  },
  // Scene 4: Litres Conversion – pull back and tilt, particles
  {
    camPos:    { x: 2.0,  y: 1.8,  z: 11  },
    camLookAt: { x: 0.8,  y: 0.5,  z: 0   },
    globeRotDelta: { x: 0.12,  y: -0.38 },
    fogDensity: 0.018,
    label: "Litres & Cubic Metres",
  },
  // Scene 5: Dashboard Reveal – pull back to wide isometric angle
  {
    camPos:    { x: -2.5, y: 3.5,  z: 18  },
    camLookAt: { x: -0.5, y: 0.5,  z: 0   },
    globeRotDelta: { x: 0.04,  y: -0.1  },
    fogDensity: 0.022,
    label: "Platform Access",
  },
];

export function init3DScene() {
  const container = document.getElementById("story-3d-stage");
  if (!container || typeof THREE === "undefined") {
    console.warn("Three.js or #story-3d-stage not found.");
    return null;
  }
  if (prefersReducedMotion()) {
    container.classList.add("reduced-motion-fallback");
    return null;
  }

  let W = container.clientWidth  || window.innerWidth;
  let H = container.clientHeight || window.innerHeight;

  // ── Scene / Camera / Renderer ────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020708, 0.022);

  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 800);
  camera.position.set(0, 1.5, 22);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("WebGL unavailable:", e);
    return null;
  }
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);

  // ── Lighting ─────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0f2d36, 1.5));

  const sun = new THREE.DirectionalLight(0xd4f0f0, 2.8);
  sun.position.set(18, 14, 12);
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x55e6cd, 1.6);
  rim.position.set(-16, -8, -10);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xf6b94a, 0.5);
  fill.position.set(8, -14, 6);
  scene.add(fill);

  // ── Globe ────────────────────────────────────────────────────────────────
  const GLOBE_R = 6.0;
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // Base rotation so India/Karnataka faces front
  const BASE_ROT_Y = -((77.6 * Math.PI) / 180) - Math.PI / 2 + 0.28;
  const BASE_ROT_X = ((13.0 * Math.PI) / 180) - 0.18;
  globeGroup.rotation.y = BASE_ROT_Y;
  globeGroup.rotation.x = BASE_ROT_X;

  // Procedural Earth texture
  function createEarthTexture() {
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 1024;
    const ctx = c.getContext("2d");

    // Deep ocean gradient
    const og = ctx.createLinearGradient(0, 0, 0, 1024);
    og.addColorStop(0,   "#040d12");
    og.addColorStop(0.5, "#071a22");
    og.addColorStop(1,   "#030a0e");
    ctx.fillStyle = og; ctx.fillRect(0, 0, 2048, 1024);

    // Subtle polar ice caps glow
    const pole = ctx.createRadialGradient(1024, 0, 0, 1024, 0, 340);
    pole.addColorStop(0,   "rgba(180,230,240,0.18)");
    pole.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = pole; ctx.fillRect(0, 0, 2048, 340);

    const pole2 = ctx.createRadialGradient(1024, 1024, 0, 1024, 1024, 300);
    pole2.addColorStop(0,   "rgba(160,210,230,0.14)");
    pole2.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = pole2; ctx.fillRect(0, 724, 2048, 300);

    // Latitude grid
    ctx.strokeStyle = "rgba(85,230,205,0.07)"; ctx.lineWidth = 0.8;
    for (let y = 0; y <= 1024; y += 64)  { ctx.beginPath(); ctx.moveTo(0,y);    ctx.lineTo(2048,y);   ctx.stroke(); }
    for (let x = 0; x <= 2048; x += 128) { ctx.beginPath(); ctx.moveTo(x,0);    ctx.lineTo(x,1024);   ctx.stroke(); }

    // Continents — rendered as dark land with aqua coastal glow
    const landColor = "rgba(16,48,58,0.88)";
    const coastStroke = "rgba(85,230,205,0.4)";

    function landmass(pts, glow) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = landColor; ctx.fill();
      ctx.strokeStyle = glow || coastStroke; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // India/South Asia
    landmass([[1408,370],[1418,330],[1465,310],[1520,320],[1540,370],[1530,400],[1510,440],[1520,470],[1500,510],[1475,545],[1460,520],[1448,480],[1430,470],[1415,440]]);
    // Karnataka highlight
    ctx.fillStyle = "rgba(85,230,205,0.28)";
    ctx.beginPath(); ctx.ellipse(1464, 492, 20, 30, 0.18, 0, Math.PI*2); ctx.fill();
    // Karnataka glow pulse (concentric rings)
    [36, 52, 70].forEach((r, i) => {
      ctx.strokeStyle = `rgba(85,230,205,${0.18 - i*0.05})`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(1464, 492, r, r*1.4, 0.18, 0, Math.PI*2); ctx.stroke();
    });

    // Africa
    landmass([[960,370],[1000,350],[1080,360],[1130,400],[1160,470],[1170,550],[1140,700],[1080,730],[1010,680],[950,580],[920,480]]);
    // Europe/Eurasia
    landmass([[1060,310],[1240,290],[1420,285],[1620,310],[1750,360],[1800,420],[1680,450],[1520,420],[1380,400],[1200,360],[1080,345]]);
    // Americas (western)
    landmass([[200,320],[280,290],[330,350],[340,420],[320,480],[280,550],[240,640],[200,680],[170,620],[160,540],[175,440],[190,380]]);
    // Australia
    landmass([[1720,650],[1820,620],[1900,670],[1930,740],[1900,800],[1820,810],[1720,780],[1680,720]]);

    // Atmospheric cloud bands
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.ellipse(1024, 160 + i*52 + Math.sin(i*0.9)*18, 900 + Math.sin(i)*80, 16 + (i%4)*5, Math.sin(i*0.4)*0.08, 0, Math.PI*2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_R, 72, 72),
    new THREE.MeshStandardMaterial({
      map: createEarthTexture(),
      roughness: 0.60, metalness: 0.22,
      color: 0x0a1e28, emissive: 0x040d11, emissiveIntensity: 0.35,
    })
  );
  globeGroup.add(earthMesh);

  // Atmosphere limb-glow — FrontSide, exterior Fresnel (1 - |dot|)
  // Uses the perpendicularity to view direction to peak at the limb
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying float vFresnel;
      void main() {
        vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec3 worldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 viewDir     = normalize(cameraPosition - worldPos);
        vFresnel = 1.0 - abs(dot(worldNormal, viewDir));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying float vFresnel;
      void main() {
        float rim   = pow(vFresnel, 2.8);
        vec3  color = mix(vec3(0.18, 0.78, 0.70), vec3(0.10, 0.55, 0.80), rim);
        gl_FragColor = vec4(color, rim * 0.65);
      }`,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.055, 48, 48), atmoMat));

  // Graticule rings (very faint latitude lines on the globe surface)
  const gratMat = new THREE.LineBasicMaterial({ color: 0x55e6cd, transparent: true, opacity: 0.08 });
  [-40, -20, 0, 20, 40].forEach(lat => {
    const r = GLOBE_R * Math.cos((lat * Math.PI) / 180);
    const y = GLOBE_R * Math.sin((lat * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    globeGroup.add(new THREE.Line(g, gratMat));
  });


  // ── District markers ─────────────────────────────────────────────────────
  const markersGroup = new THREE.Group();
  globeGroup.add(markersGroup);

  const beacons = [];
  Object.entries(PILOT_COORDS).forEach(([id, info]) => {
    const pos = latLonToVector3(info.lat, info.lon, GLOBE_R + 0.06);

    // Core dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      new THREE.MeshBasicMaterial({ color: info.color })
    );
    dot.position.copy(pos);
    markersGroup.add(dot);

    // Inner ring
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 32),
      new THREE.MeshBasicMaterial({ color: info.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
    );
    ring1.position.copy(pos);
    ring1.lookAt(pos.clone().multiplyScalar(2));
    markersGroup.add(ring1);

    // Outer halo ring
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(0.30, 0.38, 32),
      new THREE.MeshBasicMaterial({ color: info.color, side: THREE.DoubleSide, transparent: true, opacity: 0.30 })
    );
    ring2.position.copy(pos);
    ring2.lookAt(pos.clone().multiplyScalar(2));
    markersGroup.add(ring2);

    beacons.push({ ring1, ring2, dot, basePos: pos, color: info.color, phase: Math.random() * Math.PI * 2 });
  });

  // ── Evaporation particle stream (Scene 1-2) ───────────────────────────────
  const PARTICLE_N = 480;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_N * 3);
  const kCenter = latLonToVector3(13.0, 77.5, GLOBE_R);
  const kNorm   = kCenter.clone().normalize();

  const pVel = [];
  for (let i = 0; i < PARTICLE_N; i++) {
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6
    );
    const base = kCenter.clone().add(jitter).normalize().multiplyScalar(GLOBE_R + 0.08);
    pPos[i*3]   = base.x;
    pPos[i*3+1] = base.y;
    pPos[i*3+2] = base.z;
    pVel.push({ h: Math.random() * 3.0, spd: 0.012 + Math.random() * 0.022, phase: Math.random() * Math.PI * 2, base });
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x55e6cd, size: 0.13, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending,
  });
  const particleSys = new THREE.Points(pGeo, pMat);
  globeGroup.add(particleSys);

  // ── ET₀ contour rings (Scene 2-3) ────────────────────────────────────────
  const contourGroup = new THREE.Group();
  globeGroup.add(contourGroup);
  const contours = [];
  for (let i = 1; i <= 5; i++) {
    const pts = [];
    const r = 0.45 * i;
    for (let j = 0; j <= 60; j++) {
      const a = (j / 60) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const cm = new THREE.LineBasicMaterial({
      color: i >= 4 ? 0xf6b94a : (i >= 3 ? 0xffdd88 : 0x55e6cd),
      transparent: true, opacity: 0.0,
    });
    const cl = new THREE.Line(cg, cm);
    cl.position.copy(kCenter.clone().multiplyScalar(1.02));
    cl.lookAt(kCenter.clone().multiplyScalar(2.5));
    contourGroup.add(cl);
    contours.push(cl);
  }

  // ── Threshold bar chart hologram (Scene 3) ───────────────────────────────
  const barGroup = new THREE.Group();
  barGroup.position.copy(kCenter.clone().multiplyScalar(1.1));
  barGroup.lookAt(kCenter.clone().multiplyScalar(3.5));
  globeGroup.add(barGroup);

  const barVals  = [4.8, 5.2, 6.4, 6.9, 7.2, 7.1, 5.5];
  const barMeshes = [];
  barVals.forEach((val, idx) => {
    const above = val >= 6.0;
    const h     = (val / 7.5) * 1.8;
    const bm = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, h, 0.09),
      new THREE.MeshBasicMaterial({ color: above ? 0xf6b94a : 0x55e6cd, transparent: true, opacity: 0 })
    );
    bm.position.set((idx - 3) * 0.27, h / 2, 0);
    barGroup.add(bm);
    barMeshes.push({ mesh: bm, above });
  });
  const p90Geo = new THREE.BufferGeometry();
  const p90H   = (6.0 / 7.5) * 1.8;
  p90Geo.setAttribute("position", new THREE.Float32BufferAttribute([-1.1, p90H, 0.06,  1.1, p90H, 0.06], 3));
  const p90Mat = new THREE.LineDashedMaterial({ color: 0xff6b6b, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0 });
  const p90Line = new THREE.Line(p90Geo, p90Mat);
  p90Line.computeLineDistances();
  barGroup.add(p90Line);

  // ── Volumetric water drop particles (Scene 4) ─────────────────────────────
  const volGeo = new THREE.BufferGeometry();
  const VOL_N  = 240;
  const volPos = new Float32Array(VOL_N * 3);
  const volVel = [];
  for (let i = 0; i < VOL_N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi2  = Math.acos(2 * Math.random() - 1);
    const r2    = GLOBE_R + 0.5 + Math.random() * 2.2;
    const x = r2 * Math.sin(phi2) * Math.cos(theta);
    const y = r2 * Math.sin(phi2) * Math.sin(theta);
    const z = r2 * Math.cos(phi2);
    volPos[i*3]=x; volPos[i*3+1]=y; volPos[i*3+2]=z;
    volVel.push({ base: new THREE.Vector3(x,y,z), phase: Math.random()*Math.PI*2, speed: 0.3 + Math.random()*0.4 });
  }
  volGeo.setAttribute("position", new THREE.BufferAttribute(volPos, 3));
  const volMat = new THREE.PointsMaterial({
    color: 0x38bdf8, size: 0.09, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending,
  });
  const volSys = new THREE.Points(volGeo, volMat);
  globeGroup.add(volSys);

  // ── Star field ────────────────────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starPts = new Float32Array(1600 * 3);
  for (let i = 0; i < 1600; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi2  = Math.acos(2 * Math.random() - 1);
    const r2    = 60 + Math.random() * 180;
    starPts[i*3]   = r2 * Math.sin(phi2) * Math.cos(theta);
    starPts[i*3+1] = r2 * Math.sin(phi2) * Math.sin(theta);
    starPts[i*3+2] = r2 * Math.cos(phi2);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPts, 3));

  // Two-tier star field: faint background + brighter foreground
  const starFar = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x8fb8f0, size: 0.18, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(starFar);

  // Sparse bright stars
  const brightGeo = new THREE.BufferGeometry();
  const bPts = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi2  = Math.acos(2 * Math.random() - 1);
    const r2    = 80 + Math.random() * 120;
    bPts[i*3]   = r2 * Math.sin(phi2) * Math.cos(theta);
    bPts[i*3+1] = r2 * Math.sin(phi2) * Math.sin(theta);
    bPts[i*3+2] = r2 * Math.cos(phi2);
  }
  brightGeo.setAttribute("position", new THREE.BufferAttribute(bPts, 3));
  const brightStars = new THREE.Points(brightGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.28, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(brightStars);

  // ── Scroll State ─────────────────────────────────────────────────────────
  const storyEl    = document.getElementById("story-3d");
  const storyCards = document.querySelectorAll(".story-card");
  const storyDots  = document.querySelectorAll(".story-dot");

  let targetScene    = 0;
  let smoothProgress = 0;   // overall 0-1 progress through all scenes
  let targetProgress = 0;

  // Compute scroll progress from DOM position
  function onScroll() {
    if (!storyEl) return;
    const rect    = storyEl.getBoundingClientRect();
    const total   = storyEl.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const scrolled = Math.max(0, -rect.top);
    targetProgress = Math.min(1, scrolled / total);

    // Scene index is divided evenly
    const rawScene = targetProgress * SCENES.length;
    const newScene = Math.min(SCENES.length - 1, Math.floor(rawScene));

    if (newScene !== targetScene) {
      targetScene = newScene;
      activateCard(newScene);
    }
  }

  function activateCard(idx) {
    storyCards.forEach((c, i) => {
      const active = i === idx;
      c.classList.toggle("active", active);
      c.setAttribute("aria-current", active ? "true" : "false");
    });
    storyDots.forEach((d, i) => d.classList.toggle("active", i === idx));
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll(); // initial

  // ── Resize ────────────────────────────────────────────────────────────────
  function onResize() {
    W = container.clientWidth  || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }
  window.addEventListener("resize", onResize);

  // ── Camera interpolation helpers ─────────────────────────────────────────
  const camCur  = { x: 0,   y: 1.5, z: 22  };
  const lookCur = { x: 0,   y: 0,   z: 0   };

  function lerpScene(clock) {
    const elapsed = clock.getElapsedTime();

    // Smooth overall progress with fast lerp (feels responsive)
    smoothProgress += (targetProgress - smoothProgress) * 0.10;

    // Compute which scene pair we are interpolating between
    const rawScene = smoothProgress * SCENES.length;
    const scIdx    = Math.min(SCENES.length - 1, Math.floor(rawScene));
    // Clamp t to [0,1] to avoid easing fn edge case at exact integers
    const tRaw     = rawScene - Math.floor(rawScene);
    const t        = easeInOutCubic(Math.min(0.9999, tRaw));

    const scA = SCENES[scIdx];
    const scB = SCENES[Math.min(SCENES.length - 1, scIdx + 1)];

    // Target camera
    const tCam = {
      x: scA.camPos.x + (scB.camPos.x - scA.camPos.x) * t,
      y: scA.camPos.y + (scB.camPos.y - scA.camPos.y) * t,
      z: scA.camPos.z + (scB.camPos.z - scA.camPos.z) * t,
    };
    const tLook = {
      x: scA.camLookAt.x + (scB.camLookAt.x - scA.camLookAt.x) * t,
      y: scA.camLookAt.y + (scB.camLookAt.y - scA.camLookAt.y) * t,
      z: scA.camLookAt.z + (scB.camLookAt.z - scA.camLookAt.z) * t,
    };

    // Camera gentle sway (sinusoidal micro-motion)
    const sway = 0.018;
    tCam.x += Math.sin(elapsed * 0.22 + 1.1) * sway;
    tCam.y += Math.cos(elapsed * 0.18 + 0.4) * sway * 0.8;

    // Smooth camera position with different lerp rates
    const camLerp  = 0.055;  // slightly slower for cinematic feel
    const lookLerp = 0.065;
    camCur.x  += (tCam.x  - camCur.x)  * camLerp;
    camCur.y  += (tCam.y  - camCur.y)  * camLerp;
    camCur.z  += (tCam.z  - camCur.z)  * camLerp;
    lookCur.x += (tLook.x - lookCur.x) * lookLerp;
    lookCur.y += (tLook.y - lookCur.y) * lookLerp;
    lookCur.z += (tLook.z - lookCur.z) * lookLerp;

    camera.position.set(camCur.x, camCur.y, camCur.z);
    camera.lookAt(lookCur.x, lookCur.y, lookCur.z);

    // Globe rotation — base orientation + scroll-driven delta
    const tRotX = BASE_ROT_X + (scA.globeRotDelta.x + (scB.globeRotDelta.x - scA.globeRotDelta.x) * t);
    const tRotY = BASE_ROT_Y + (scA.globeRotDelta.y + (scB.globeRotDelta.y - scA.globeRotDelta.y) * t);
    // Continuous slow drift layered on top
    const drift = 0.03;
    globeGroup.rotation.x += (tRotX + Math.sin(elapsed * 0.10) * 0.012 - globeGroup.rotation.x) * 0.042;
    globeGroup.rotation.y += (tRotY + Math.cos(elapsed * 0.08) * 0.012 - globeGroup.rotation.y) * 0.042;

    // Fog density lerp
    const tFog = scA.fogDensity + (scB.fogDensity - scA.fogDensity) * t;
    scene.fog.density += (tFog - scene.fog.density) * 0.03;
  }

  // Weight functions for each scene's special effects (smooth bell curves)
  function sceneWeight(targetIdx, p, halfWidth) {
    const sceneCenter = (targetIdx + 0.5) / SCENES.length;
    const dist = Math.abs(p - sceneCenter);
    return Math.max(0, 1 - dist / halfWidth);
  }

  // ── Clock ─────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  // ── Animation Loop ────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const p = smoothProgress;

    lerpScene(clock);

    // ── Beacons: pulsing rings ──────────────────────────────────────────────
    beacons.forEach((b, i) => {
      const pulse = 1 + Math.sin(elapsed * 2.8 + b.phase) * 0.30;
      const halo  = 1 + Math.sin(elapsed * 1.4 + b.phase + 1.5) * 0.55;
      b.ring1.scale.set(pulse, pulse, pulse);
      b.ring2.scale.set(halo,  halo,  halo);
      b.ring1.material.opacity = 0.55 + Math.sin(elapsed * 2.8 + b.phase) * 0.3;
      b.ring2.material.opacity = 0.18 + Math.sin(elapsed * 1.4 + b.phase) * 0.12;
    });

    // ── Evaporation particles (scenes 1-2) ──────────────────────────────────
    // Use Math.max so particles are visible across the full extent of scenes 1 AND 2
    const pWeight = Math.min(1, Math.max(sceneWeight(1, p, 0.20), sceneWeight(2, p, 0.20)) * 1.3);
    pMat.opacity += (pWeight * 0.82 - pMat.opacity) * 0.06;

    if (pMat.opacity > 0.01) {
      const posArr = pGeo.attributes.position.array;
      for (let i = 0; i < PARTICLE_N; i++) {
        const v = pVel[i];
        v.h = (v.h + v.spd) % 3.5;
        const cur = v.base.clone().add(kNorm.clone().multiplyScalar(v.h));
        cur.x += Math.sin(elapsed * 1.6 + v.phase) * 0.14;
        cur.z += Math.cos(elapsed * 1.6 + v.phase) * 0.14;
        posArr[i*3]   = cur.x;
        posArr[i*3+1] = cur.y;
        posArr[i*3+2] = cur.z;
      }
      pGeo.attributes.position.needsUpdate = true;
    }

    // ── ET₀ contours (scenes 2-3) ───────────────────────────────────────────
    // Use Math.max so contours span scenes 2 AND 3
    const contourAlpha = Math.min(1, Math.max(sceneWeight(2, p, 0.20), sceneWeight(3, p, 0.20)) * 1.3);
    contours.forEach((c, idx) => {
      const tOp = contourAlpha * (0.28 + idx * 0.13);
      c.material.opacity += (tOp - c.material.opacity) * 0.07;
      const pulse = 1 + Math.sin(elapsed * 1.8 + idx * 1.1) * 0.07;
      c.scale.set(pulse, pulse, 1);
    });

    // ── Bar chart (scene 3) ─────────────────────────────────────────────────
    const bw = sceneWeight(3, p, 0.20);
    const barAlpha = Math.min(1, bw * 1.4);
    barMeshes.forEach(({ mesh, above }) => {
      const tOp = barAlpha * (above ? 0.88 : 0.65);
      mesh.material.opacity += (tOp - mesh.material.opacity) * 0.08;
      if (barAlpha > 0.02) {
        const tScl = 0.15 + barAlpha * 0.85;
        mesh.scale.y += (tScl - mesh.scale.y) * 0.10;
      }
    });
    const p90Tgt = barAlpha * 0.92;
    p90Mat.opacity += (p90Tgt - p90Mat.opacity) * 0.08;

    // ── Volumetric water drop particles (scene 4) ───────────────────────────
    const vw = sceneWeight(4, p, 0.22);
    const volAlpha = Math.min(1, vw * 1.4);
    volMat.opacity += (volAlpha * 0.75 - volMat.opacity) * 0.06;

    if (volMat.opacity > 0.01) {
      const vPos = volGeo.attributes.position.array;
      for (let i = 0; i < VOL_N; i++) {
        const v = volVel[i];
        const t2 = (elapsed * v.speed + v.phase) % (Math.PI * 2);
        const r2 = v.base.length();
        vPos[i*3]   = v.base.x + Math.sin(t2) * 0.22 * (r2 / GLOBE_R);
        vPos[i*3+1] = v.base.y + Math.cos(t2*1.3) * 0.15 * (r2 / GLOBE_R);
        vPos[i*3+2] = v.base.z + Math.sin(t2*0.7+1) * 0.18 * (r2 / GLOBE_R);
      }
      volGeo.attributes.position.needsUpdate = true;
    }

    // ── Stars slow drift ────────────────────────────────────────────────────
    starFar.rotation.y    = elapsed * 0.018;
    brightStars.rotation.y = elapsed * 0.012;

    renderer.render(scene, camera);
  }

  animate();

  return {
    destroy() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (renderer?.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer?.dispose();
    },
  };
}
