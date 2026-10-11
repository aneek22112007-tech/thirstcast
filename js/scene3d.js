/**
 * ThirstCast — 3D Earth & Scroll-Driven Storytelling Experience
 * Built with Three.js (local vendor: vendor/three/three.min.js)
 *
 * Implements 6 cinematic scenes linked to scroll progress:
 *   Scene 1: The Atmosphere — Orbital rotating Earth with atmospheric glow & stars
 *   Scene 2: The Water Cycle — Camera zooms to South Asia / Karnataka, evaporation particle streams
 *   Scene 3: Atmospheric Demand — ET₀ topographic contours & heat-energy pulses over Karnataka
 *   Scene 4: Thirstwave Trigger — 3D threshold chart, ≥3 consecutive days p90 breach
 *   Scene 5: Water Litres Conversion — Volumetric crop & reservoir demand particles
 *   Scene 6: Dashboard Reveal — Isometric tilt transition into interactive dashboard preview
 */

import { prefersReducedMotion } from "./format.js";

// Pilot coordinates (lat, lon) mapped to 3D sphere (radius R)
const PILOT_COORDS = {
  Bengaluru_Urban: { lat: 12.9508, lon: 77.5959, name: "Bengaluru Urban", color: 0x55e6cd },
  Kolar: { lat: 13.1393, lon: 78.2177, name: "Kolar", color: 0xf6b94a },
  Mandya: { lat: 12.6104, lon: 76.7980, name: "Mandya", color: 0x5dd68a },
};

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export function init3DScene() {
  const container = document.getElementById("story-3d-stage");
  if (!container || typeof THREE === "undefined") {
    console.warn("Three.js or #story-3d-stage not found, falling back to CSS visual.");
    return null;
  }

  // Respect reduced motion
  if (prefersReducedMotion()) {
    container.classList.add("reduced-motion-fallback");
    return null;
  }

  let width = container.clientWidth || window.innerWidth;
  let height = container.clientHeight || window.innerHeight;

  // 1. Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040a0c, 0.022);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 2, 22);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (e) {
    console.warn("WebGL not supported, falling back:", e);
    return null;
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  // 2. Lighting
  const ambientLight = new THREE.AmbientLight(0x0f2d36, 1.2);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xe0f7fa, 2.4);
  sunLight.position.set(16, 12, 14);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x55e6cd, 1.8);
  rimLight.position.set(-14, -6, -10);
  scene.add(rimLight);

  // 3. Globe Construction
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const GLOBE_RADIUS = 6.0;

  // Globe procedural texture with dark continents & vibrant oceans
  function createEarthTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Deep midnight ocean background
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    oceanGrad.addColorStop(0, "#05161d");
    oceanGrad.addColorStop(0.5, "#08212a");
    oceanGrad.addColorStop(1, "#040d12");
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Latitude & longitude grid lines
    ctx.strokeStyle = "rgba(85, 230, 205, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 2048; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(2048, y);
      ctx.stroke();
    }

    // Continents outline (procedural artistic landmass approximation)
    ctx.fillStyle = "rgba(22, 64, 76, 0.85)";
    ctx.strokeStyle = "rgba(85, 230, 205, 0.35)";
    ctx.lineWidth = 2;

    // South Asia / India Peninsula polygon
    // Lat ~8N to 36N (y ~512 to 310), Lon ~68E to 90E (x ~1410 to 1536)
    ctx.beginPath();
    ctx.moveTo(1410, 370); // Gujarat
    ctx.lineTo(1450, 480); // Goa / Karnataka coast
    ctx.lineTo(1460, 520); // Kerala
    ctx.lineTo(1475, 545); // Kanyakumari
    ctx.lineTo(1495, 500); // Tamil Nadu coast
    ctx.lineTo(1510, 430); // Andhra coast
    ctx.lineTo(1530, 390); // Bengal / Odisha
    ctx.lineTo(1510, 320); // Himalayas
    ctx.lineTo(1430, 320); // North-West
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Karnataka region glowing highlight on map (lat 12-18N, lon 74-78E)
    ctx.fillStyle = "rgba(85, 230, 205, 0.32)";
    ctx.beginPath();
    ctx.ellipse(1465, 490, 18, 28, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Africa outline
    ctx.beginPath();
    ctx.moveTo(1020, 380);
    ctx.lineTo(1120, 420);
    ctx.lineTo(1160, 540);
    ctx.lineTo(1130, 700);
    ctx.lineTo(1080, 720);
    ctx.lineTo(1010, 560);
    ctx.lineTo(950, 460);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eurasia generalized
    ctx.beginPath();
    ctx.moveTo(1100, 340);
    ctx.lineTo(1380, 320);
    ctx.lineTo(1650, 350);
    ctx.lineTo(1750, 420);
    ctx.lineTo(1600, 480);
    ctx.lineTo(1400, 420);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle atmospheric cloud bands
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const cy = 150 + i * 45 + Math.sin(i) * 20;
      ctx.ellipse(1024, cy, 900, 14 + (i % 5) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    map: createEarthTexture(),
    roughness: 0.65,
    metalness: 0.2,
    color: 0x0c2530,
    emissive: 0x051318,
    emissiveIntensity: 0.4,
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  globeGroup.add(earthMesh);

  // Atmospheric Fresnel Glow Shell
  const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.055, 48, 48);
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float intensity = pow(0.7 - dot(vNormal, viewDir), 2.8);
        vec3 glow = vec3(0.33, 0.90, 0.80);
        gl_FragColor = vec4(glow, intensity * 0.9);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  globeGroup.add(atmoMesh);

  // Latitude and longitude graticule rings
  const ringMat = new THREE.LineBasicMaterial({ color: 0x55e6cd, transparent: true, opacity: 0.12 });
  [-40, -20, 0, 20, 40].forEach((lat) => {
    const r = GLOBE_RADIUS * Math.cos((lat * Math.PI) / 180);
    const y = GLOBE_RADIUS * Math.sin((lat * Math.PI) / 180);
    const ringGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(ringGeo, ringMat);
    globeGroup.add(line);
  });

  // 4. District Pin Beacons & Waves
  const markersGroup = new THREE.Group();
  globeGroup.add(markersGroup);

  const markerBeacons = [];
  Object.entries(PILOT_COORDS).forEach(([id, info]) => {
    const pos = latLonToVector3(info.lat, info.lon, GLOBE_RADIUS + 0.05);

    // Glowing core dot
    const dotGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: info.color });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(pos);
    markersGroup.add(dot);

    // Pulsing ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: info.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(pos.clone().multiplyScalar(2));
    markersGroup.add(ring);

    markerBeacons.push({ id, ring, dot, baseScale: 1, color: info.color });
  });

  // 5. Water Cycle Evaporation Particles (Scene 2)
  const PARTICLE_COUNT = 320;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  const particleVelocities = [];

  const karnatakaCenter = latLonToVector3(13.0, 77.5, GLOBE_RADIUS);
  const normal = karnatakaCenter.clone().normalize();

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Spread around Karnataka
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2
    );
    const p = karnatakaCenter.clone().add(jitter).normalize().multiplyScalar(GLOBE_RADIUS + 0.1);
    particlePositions[i * 3] = p.x;
    particlePositions[i * 3 + 1] = p.y;
    particlePositions[i * 3 + 2] = p.z;

    particleVelocities.push({
      height: Math.random() * 2.8,
      speed: 0.015 + Math.random() * 0.025,
      offset: Math.random() * Math.PI * 2,
      basePos: p.clone(),
    });
  }

  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x55e6cd,
    size: 0.14,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
  });
  const particleSystem = new THREE.Points(particleGeo, particleMat);
  globeGroup.add(particleSystem);

  // 6. ET₀ Dynamic Contours (Scene 3)
  const contourGroup = new THREE.Group();
  globeGroup.add(contourGroup);

  const contourRings = [];
  for (let i = 1; i <= 4; i++) {
    const cGeo = new THREE.BufferGeometry();
    const cPts = [];
    const r = 0.5 * i;
    for (let j = 0; j <= 48; j++) {
      const a = (j / 48) * Math.PI * 2;
      cPts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    cGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPts, 3));
    const cMat = new THREE.LineBasicMaterial({
      color: i >= 3 ? 0xf6b94a : 0x55e6cd,
      transparent: true,
      opacity: 0.0,
      linewidth: 2,
    });
    const cLine = new THREE.Line(cGeo, cMat);
    cLine.position.copy(karnatakaCenter.clone().multiplyScalar(1.02));
    cLine.lookAt(karnatakaCenter.clone().multiplyScalar(2));
    contourGroup.add(cLine);
    contourRings.push(cLine);
  }

  // 7. Thirstwave 3D Holographic Threshold Bars (Scene 4)
  const barGroup = new THREE.Group();
  barGroup.position.copy(karnatakaCenter.clone().multiplyScalar(1.08));
  barGroup.lookAt(karnatakaCenter.clone().multiplyScalar(3));
  globeGroup.add(barGroup);

  const barValues = [4.8, 5.2, 6.4, 6.9, 7.2, 7.1, 5.5]; // 7 days (4 days above p90: 6.0)
  const bars = [];
  barValues.forEach((val, idx) => {
    const isAbove = val >= 6.0;
    const h = (val / 7.2) * 1.6;
    const bGeo = new THREE.BoxGeometry(0.18, h, 0.1);
    const bMat = new THREE.MeshBasicMaterial({
      color: isAbove ? 0xf6b94a : 0x55e6cd,
      transparent: true,
      opacity: 0.0,
    });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.set((idx - 3) * 0.28, h / 2, 0);
    barGroup.add(bMesh);
    bars.push(bMesh);
  });

  // 3D Dashed p90 threshold line
  const p90LineGeo = new THREE.BufferGeometry();
  const p90H = (6.0 / 7.2) * 1.6;
  const p90Pts = [-1.1, p90H, 0.06, 1.1, p90H, 0.06];
  p90LineGeo.setAttribute("position", new THREE.Float32BufferAttribute(p90Pts, 3));
  const p90LineMat = new THREE.LineDashedMaterial({
    color: 0xff6b6b,
    dashSize: 0.1,
    gapSize: 0.05,
    transparent: true,
    opacity: 0.0,
  });
  const p90Line = new THREE.Line(p90LineGeo, p90LineMat);
  p90Line.computeLineDistances();
  barGroup.add(p90Line);

  // 8. Space Background Starfield
  const starGeo = new THREE.BufferGeometry();
  const starPts = [];
  for (let i = 0; i < 900; i++) {
    starPts.push(
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 80
    );
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPts, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 0.25,
    transparent: true,
    opacity: 0.35,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // Initial Globe Orientation so India faces front-right
  // Lat 13N, Lon 77.6E
  const TARGET_ROT_Y = -((77.6 * Math.PI) / 180) - Math.PI / 2 + 0.3;
  const TARGET_ROT_X = ((13.0 * Math.PI) / 180) - 0.2;
  globeGroup.rotation.y = TARGET_ROT_Y;
  globeGroup.rotation.x = TARGET_ROT_X;

  // 9. Scroll Tracking and Interpolation
  const storyContainer = document.getElementById("story-3d");
  let scrollProgress = 0;
  let targetProgress = 0;
  let activeScene = 0;

  function updateScroll() {
    if (!storyContainer) return;
    const rect = storyContainer.getBoundingClientRect();
    const totalDist = storyContainer.offsetHeight - window.innerHeight;
    if (totalDist <= 0) return;
    const scrolled = -rect.top;
    const p = Math.max(0, Math.min(1, scrolled / totalDist));
    targetProgress = p;

    // Active scene 0..5
    const sceneIndex = Math.min(5, Math.floor(p * 6));
    if (sceneIndex !== activeScene) {
      activeScene = sceneIndex;
      updateSceneNarrative(sceneIndex);
    }
  }

  function updateSceneNarrative(idx) {
    const cards = document.querySelectorAll(".story-card");
    cards.forEach((card, i) => {
      if (i === idx) {
        card.classList.add("active");
        card.setAttribute("aria-current", "true");
      } else {
        card.classList.remove("active");
        card.removeAttribute("aria-current");
      }
    });

    const stepDots = document.querySelectorAll(".story-dot");
    stepDots.forEach((dot, i) => {
      dot.classList.toggle("active", i === idx);
    });
  }

  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();

  // Resize handler
  function onResize() {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", onResize);

  // 10. Animation Loop
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Smooth scroll interpolation (lerp)
    scrollProgress += (targetProgress - scrollProgress) * 0.08;

    // Camera and Scene progression through 6 phases:
    // P 0.00 - 0.16: Scene 1 — The Atmosphere (orbital overview)
    // P 0.17 - 0.33: Scene 2 — The Water Cycle (zoom in, evaporation arcs)
    // P 0.34 - 0.50: Scene 3 — Atmospheric Demand (contours, ET₀ glow)
    // P 0.51 - 0.67: Scene 4 — Thirstwave Detection (threshold chart)
    // P 0.68 - 0.84: Scene 5 — Atmosphere to Litres (volumetric conversion)
    // P 0.85 - 1.00: Scene 6 — Dashboard Reveal (glide into isometric card)

    const p = scrollProgress;

    // Camera distance: 22 (orbital) down to 11 (close Karnataka focus)
    const camZ = 22 - Math.sin(p * Math.PI * 0.7) * 11;
    const camY = 2 + Math.sin(p * 3) * 1.2;
    const camX = Math.sin(p * Math.PI) * 2.5;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(0, 0, 0);

    // Globe subtle ambient rotation + scroll alignment
    globeGroup.rotation.y = TARGET_ROT_Y + Math.sin(elapsed * 0.15) * 0.04 + (p - 0.5) * 0.8;
    globeGroup.rotation.x = TARGET_ROT_X + Math.cos(elapsed * 0.12) * 0.02 + (p - 0.5) * 0.3;

    // District marker pulsating rings
    markerBeacons.forEach((b, i) => {
      const s = 1 + Math.sin(elapsed * 3 + i * 1.5) * 0.35;
      b.ring.scale.set(s, s, s);
      b.ring.material.opacity = 0.5 + Math.sin(elapsed * 2 + i) * 0.3;
    });

    // Particle update for Water Cycle (Scene 2)
    const s2Weight = Math.max(0, 1 - Math.abs(p - 0.28) / 0.22);
    particleMat.opacity = s2Weight * 0.85;

    if (s2Weight > 0.01) {
      const posArr = particleGeo.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const vel = particleVelocities[i];
        vel.height = (vel.height + vel.speed) % 3.2;
        const cur = vel.basePos.clone().add(normal.clone().multiplyScalar(vel.height));
        // add slight atmospheric spiral
        cur.x += Math.sin(elapsed * 2 + vel.offset) * 0.12;
        cur.z += Math.cos(elapsed * 2 + vel.offset) * 0.12;

        posArr[i * 3] = cur.x;
        posArr[i * 3 + 1] = cur.y;
        posArr[i * 3 + 2] = cur.z;
      }
      particleGeo.attributes.position.needsUpdate = true;
    }

    // Contours for Atmospheric Demand (Scene 3)
    const s3Weight = Math.max(0, 1 - Math.abs(p - 0.48) / 0.20);
    contourRings.forEach((c, idx) => {
      c.material.opacity = s3Weight * (0.35 + idx * 0.15);
      const pulse = 1 + Math.sin(elapsed * 2 + idx) * 0.08;
      c.scale.set(pulse, pulse, 1);
    });

    // Thirstwave Threshold Chart (Scene 4)
    const s4Weight = Math.max(0, 1 - Math.abs(p - 0.65) / 0.18);
    bars.forEach((b, idx) => {
      b.material.opacity = s4Weight * 0.85;
      if (s4Weight > 0.05) {
        b.scale.y = 0.2 + s4Weight * 0.8;
      }
    });
    p90LineMat.opacity = s4Weight * 0.9;

    // Starfield slow drift
    starField.rotation.y = elapsed * 0.02;

    renderer.render(scene, camera);
  }

  animate();

  return {
    destroy: () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", onResize);
      if (renderer && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
