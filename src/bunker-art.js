/* ================= ULTIMATEDAY — ARTE ILUSTRADO DEL BÚNKER EN CANVAS Y SPRITES ================= */

function rr(g, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let _grungePat = null;
function getGrungePattern(g) {
  if (_grungePat) return g.createPattern(_grungePat, 'repeat');
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const cx = c.getContext('2d');
  const rng = seededRand(918273);
  for (let i = 0; i < 1400; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const v = rng() > 0.5 ? 255 : 0;
    const a = 0.018 + rng() * 0.045;
    cx.fillStyle = `rgba(${v},${v},${v},${a.toFixed(3)})`;
    cx.fillRect(x, y, 1 + rng() * 2.2, 1 + rng() * 2.2);
  }
  for (let i = 0; i < 28; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    cx.fillStyle = `rgba(0,0,0,${(0.03 + rng() * 0.04).toFixed(3)})`;
    cx.fillRect(x, y, 1.5, 10 + rng() * 24);
  }
  _grungePat = c;
  return g.createPattern(c, 'repeat');
}

function drawCurvedPipe(g, pts, width, colMain, colHi, colDark, lights) {
  const trace = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const cur = pts[i];
      if (i < pts.length - 1) {
        const next = pts[i + 1];
        g.arcTo(cur[0], cur[1], next[0], next[1], 16);
      } else {
        g.lineTo(cur[0], cur[1]);
      }
    }
  };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = width + 7;
  g.save();
  g.translate(3, 4);
  trace();
  g.stroke();
  g.restore();

  g.strokeStyle = colDark;
  g.lineWidth = width + 4;
  trace();
  g.stroke();

  g.strokeStyle = colMain;
  g.lineWidth = width;
  trace();
  g.stroke();

  g.strokeStyle = colHi;
  g.lineWidth = Math.max(2, width * 0.28);
  g.translate(-width * 0.14, -width * 0.14);
  trace();
  g.stroke();
  g.restore();

  // Bridas metálicas en puntos rectos
  g.save();
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    g.fillStyle = lights ? '#4c5254' : '#242728';
    g.beginPath();
    g.arc(px, py, width * 0.56, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#101213';
    g.lineWidth = 2;
    g.stroke();
  }
  g.restore();
}

function drawLadder(g, x, y1, y2, w, lights) {
  const railMain = lights ? '#6d5742' : '#2f261d';
  const railHi = lights ? '#94785d' : '#42362a';
  const darkCol = '#110e0b';
  g.save();
  g.lineCap = 'round';
  // Sombra proyectada en la pared del hueco
  g.strokeStyle = 'rgba(0,0,0,0.58)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(x + 4, y1); g.lineTo(x + 4, y2);
  g.moveTo(x + w + 4, y1); g.lineTo(x + w + 4, y2);
  g.stroke();

  // Peldaños de madera/acero desgastados
  for (let ry = y1 + 14; ry < y2 - 6; ry += 21) {
    g.strokeStyle = darkCol;
    g.lineWidth = 6.5;
    g.beginPath(); g.moveTo(x + 2, ry); g.lineTo(x + w - 2, ry); g.stroke();
    g.strokeStyle = railMain;
    g.lineWidth = 3.8;
    g.beginPath(); g.moveTo(x + 2, ry - 0.5); g.lineTo(x + w - 2, ry - 0.5); g.stroke();
    g.strokeStyle = railHi;
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x + 4, ry - 1.5); g.lineTo(x + w - 4, ry - 1.5); g.stroke();
  }
  // Largueros laterales
  g.strokeStyle = darkCol;
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(x, y1); g.lineTo(x, y2);
  g.moveTo(x + w, y1); g.lineTo(x + w, y2);
  g.stroke();

  g.strokeStyle = railMain;
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(x, y1); g.lineTo(x, y2);
  g.moveTo(x + w, y1); g.lineTo(x + w, y2);
  g.stroke();
  g.restore();
}

function drawBoulder(g, cx, cy, rx, ry, seed, colA, colB) {
  const r = seededRand(seed);
  const n = 9;
  g.save();
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 0.68 + r() * 0.38;
    const px = cx + Math.cos(a) * rx * rad;
    const py = cy + Math.sin(a) * ry * rad;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  const grd = g.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  grd.addColorStop(0, colA);
  grd.addColorStop(1, colB);
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.62)';
  g.lineWidth = 2;
  g.stroke();
  g.restore();
}

function drawWallWorkbench(g, x, floorY, lights) {
  g.save();
  // Sombra
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(x + 80, floorY + 2, 82, 8, 0, 0, Math.PI * 2); g.fill();
  // Tablero de herramientas en la pared
  g.fillStyle = lights ? '#3d3024' : '#1b1611';
  rr(g, x + 12, floorY - 128, 136, 56, 4); g.fill();
  g.strokeStyle = '#140f0a'; g.lineWidth = 2.5; g.stroke();
  // Herramientas colgadas (llaves, sierra, martillo)
  g.strokeStyle = lights ? '#8e9699' : '#3a3e40';
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const tx = x + 26 + i * 20;
    g.beginPath(); g.moveTo(tx, floorY - 118); g.lineTo(tx, floorY - 84 - (i % 2) * 8); g.stroke();
    g.beginPath(); g.arc(tx, floorY - 118, 4, 0, Math.PI * 2); g.stroke();
  }
  // Mesa de trabajo de madera
  g.fillStyle = lights ? '#59422c' : '#241b13';
  rr(g, x + 4, floorY - 62, 152, 12, 3); g.fill();
  g.strokeStyle = '#18110b'; g.lineWidth = 2; g.stroke();
  // Patas y estante inferior
  g.fillStyle = lights ? '#3f2e1f' : '#1b140d';
  g.fillRect(x + 12, floorY - 50, 10, 50);
  g.fillRect(x + 138, floorY - 50, 10, 50);
  g.fillRect(x + 22, floorY - 22, 116, 7);
  // Caja de herramientas y botella sobre la mesa
  g.fillStyle = lights ? '#2b3438' : '#15191b';
  rr(g, x + 22, floorY - 80, 44, 18, 3); g.fill();
  g.fillStyle = lights ? '#70846f' : '#2f382f';
  rr(g, x + 114, floorY - 84, 18, 22, 4); g.fill();
  g.restore();
}

function drawWallDoor(g, x, floorY, lights) {
  g.save();
  const w = 78, h = 148, y = floorY - h;
  g.fillStyle = lights ? '#222625' : '#101211';
  rr(g, x - 4, y - 4, w + 8, h + 6, 4); g.fill();
  const dg = g.createLinearGradient(x, y, x + w, y + h);
  dg.addColorStop(0, lights ? '#404542' : '#1a1d1b');
  dg.addColorStop(1, lights ? '#282c2a' : '#111312');
  g.fillStyle = dg;
  rr(g, x, y, w, h, 3); g.fill();
  g.strokeStyle = '#131615'; g.lineWidth = 3; g.stroke();
  // Mirilla superior y cerradura
  g.fillStyle = lights ? '#161b1c' : '#0b0e0f';
  rr(g, x + 22, y + 18, 34, 22, 3); g.fill();
  g.strokeStyle = '#5c635f'; g.lineWidth = 2; g.stroke();
  g.fillStyle = lights ? '#9ca49f' : '#404542';
  rr(g, x + 60, y + 78, 9, 16, 2); g.fill();
  // Franja inferior de peligro
  g.fillStyle = lights ? 'rgba(218,148,42,0.55)' : 'rgba(130,90,26,0.25)';
  g.fillRect(x + 4, floorY - 14, w - 8, 8);
  g.restore();
}

function drawWallExtinguisher(g, cx, floorY, lights) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(cx, floorY + 1, 14, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = lights ? '#a82c24' : '#441310';
  rr(g, cx - 10, floorY - 46, 20, 44, 8); g.fill();
  g.strokeStyle = '#180706'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#222628';
  g.fillRect(cx - 5, floorY - 53, 10, 8);
  g.strokeStyle = '#111314'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx + 3, floorY - 50); g.quadraticCurveTo(cx + 16, floorY - 46, cx + 13, floorY - 22); g.stroke();
  g.restore();
}

/* ================= ARQUITECTURA PRINCIPAL DEL BÚNKER EN CANVAS ================= */
export function buildBunkerCanvas(W, H, lights) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rng = seededRand(4077);
  const pat = getGrungePattern(g);

  /* ---- 1. CIELO APOCALÍPTICO ARDIENTE Y YERMO EN SUPERFICIE (y: 0..640) ---- */
  const sky = g.createLinearGradient(0, 0, 0, 560);
  if (lights) {
    sky.addColorStop(0, '#0f0c10');
    sky.addColorStop(0.28, '#2d1510');
    sky.addColorStop(0.56, '#7a2b14');
    sky.addColorStop(0.80, '#c8581d');
    sky.addColorStop(1, '#efa141');
  } else {
    sky.addColorStop(0, '#06070b');
    sky.addColorStop(0.45, '#12141a');
    sky.addColorStop(1, '#231b17');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 620);

  // Resplandor solar abrasador detrás de las nubes y la ciudad en ruinas
  const sunGlow = g.createRadialGradient(840, 315, 20, 840, 315, 480);
  sunGlow.addColorStop(0, lights ? 'rgba(255,232,148,0.85)' : 'rgba(130,145,165,0.18)');
  sunGlow.addColorStop(0.32, lights ? 'rgba(248,136,44,0.48)' : 'rgba(70,80,95,0.12)');
  sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sunGlow;
  g.fillRect(280, 0, 888, 600);

  // Nubes dramáticas de tormenta y ceniza con bordes iluminados por el ocaso
  for (let i = 0; i < 12; i++) {
    const cx = 60 + i * 105 + (rng() - 0.5) * 55;
    const cy = 65 + (i % 4) * 55 + rng() * 35;
    g.save();
    for (let k = 0; k < 6; k++) {
      const rx = 68 + rng() * 48;
      const ry = 20 + rng() * 14;
      const px = cx + (k - 2.5) * 34;
      const py = cy + Math.sin(k * 1.4) * 11;
      g.fillStyle = lights ? 'rgba(26,15,12,0.34)' : 'rgba(10,12,16,0.45)';
      g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); g.fill();
      if (lights && cy > 150) {
        g.fillStyle = 'rgba(255,162,64,0.14)';
        g.beginPath(); g.ellipse(px, py + ry * 0.35, rx * 0.78, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }

  // Horizonte de ciudad en ruinas (rascacielos colapsados a la derecha/centro)
  g.fillStyle = lights ? '#1f120d' : '#0d0e11';
  const towers = [
    [540, 448, 28, 102], [575, 422, 34, 128], [616, 456, 26, 94],
    [658, 396, 40, 154], [705, 434, 32, 116], [744, 378, 46, 172],
    [802, 418, 36, 132], [848, 365, 44, 185], [902, 406, 38, 144],
    [950, 386, 48, 164], [1006, 426, 42, 124], [1054, 392, 52, 158],
    [1112, 438, 56, 112]
  ];
  towers.forEach(([tx, ty, tw, th], idx) => {
    g.beginPath();
    g.moveTo(tx, ty + th);
    g.lineTo(tx, ty + (idx % 3) * 14);
    g.lineTo(tx + tw * 0.35, ty);
    g.lineTo(tx + tw * 0.65, ty + 18);
    g.lineTo(tx + tw, ty + (idx % 2) * 12);
    g.lineTo(tx + tw, ty + th);
    g.closePath();
    g.fill();
    // Ventanas rotas iluminadas por el cielo ardiente detrás
    if (lights && idx % 2 === 0) {
      g.fillStyle = 'rgba(240,128,44,0.35)';
      for (let wy = ty + 24; wy < ty + th - 26; wy += 16) {
        g.fillRect(tx + 8, wy, 5, 7);
        if (tw > 34) g.fillRect(tx + 20, wy + 4, 5, 7);
      }
      g.fillStyle = '#1f120d';
    }
  });

  // Peñón rocoso y ruina en la loma izquierda
  g.fillStyle = lights ? '#231712' : '#101012';
  g.beginPath();
  g.moveTo(0, 560);
  g.lineTo(35, 490); g.lineTo(95, 468); g.lineTo(138, 420);
  g.lineTo(164, 442); g.lineTo(205, 495); g.lineTo(430, 520);
  g.lineTo(540, 540); g.lineTo(540, 600); g.lineTo(0, 600);
  g.closePath();
  g.fill();

  // Terreno del yermo calcinado (capas de polvo, ceniza y lomas bajas)
  const wasteG = g.createLinearGradient(0, 498, 0, 610);
  wasteG.addColorStop(0, lights ? '#4e3120' : '#191614');
  wasteG.addColorStop(0.45, lights ? '#312118' : '#131110');
  wasteG.addColorStop(1, lights ? '#1b1410' : '#0b0a09');
  g.fillStyle = wasteG;
  g.beginPath();
  g.moveTo(0, 535);
  g.bezierCurveTo(185, 508, 395, 536, 610, 526);
  g.bezierCurveTo(820, 516, 1005, 496, W, 522);
  g.lineTo(W, 635); g.lineTo(0, 635); g.closePath();
  g.fill();

  // Piedras y escombros dispersos sobre la superficie
  for (let i = 0; i < 24; i++) {
    const rx = 25 + rng() * (W - 50);
    const ry = 532 + rng() * 44;
    drawBoulder(g, rx, ry, 7 + rng() * 14, 4 + rng() * 7, i + 501,
      lights ? '#4b3426' : '#1e1916', lights ? '#1f1510' : '#0c0b0a');
  }

  /* ---- 2. ESTRATOS GEOLÓGICOS OSCUROS Y ROCA MADRE (y: 572..2112) ---- */
  const earth = g.createLinearGradient(0, 568, 0, H);
  earth.addColorStop(0, '#2a2018');
  earth.addColorStop(0.10, '#1c1612');
  earth.addColorStop(0.35, '#13100e');
  earth.addColorStop(0.75, '#0b0a09');
  earth.addColorStop(1, '#060606');
  g.fillStyle = earth;
  g.beginPath();
  g.moveTo(0, 576);
  g.bezierCurveTo(260, 558, 590, 578, 860, 568);
  g.bezierCurveTo(1015, 562, 1095, 576, W, 566);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  g.fill();

  // Capas de roca agrietada y sedimentos
  for (let s = 0; s < 18; s++) {
    const sy = 620 + s * 86;
    g.fillStyle = s % 2 === 0 ? 'rgba(180,145,110,0.032)' : 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.moveTo(0, sy);
    g.bezierCurveTo(320, sy + Math.sin(s * 1.3) * 20, 780, sy - Math.cos(s * 1.1) * 18, W, sy + 6);
    g.lineTo(W, sy + 36);
    g.bezierCurveTo(780, sy + 20, 340, sy + 44, 0, sy + 32);
    g.closePath();
    g.fill();
  }

  // Rocas y cantos incrustados en los márgenes izquierdo y derecho de tierra
  for (let i = 0; i < 72; i++) {
    const sideLeft = i % 2 === 0;
    const rx = sideLeft ? 8 + rng() * 68 : 1086 + rng() * 72;
    const ry = 620 + rng() * (H - 650);
    drawBoulder(g, rx, ry, 11 + rng() * 19, 7 + rng() * 12, i + 177,
      lights ? '#322921' : '#1b1714', lights ? '#171310' : '#0b0a09');
  }

  // Raíces secas bajando por la capa superficial de tierra
  g.strokeStyle = 'rgba(64,46,32,0.5)';
  g.lineWidth = 2.2;
  for (let i = 0; i < 16; i++) {
    const rx = 20 + i * 74 + rng() * 20;
    g.beginPath();
    g.moveTo(rx, 574);
    g.quadraticCurveTo(rx + (rng() - 0.5) * 28, 616, rx + (rng() - 0.5) * 40, 650 + rng() * 35);
    g.stroke();
  }

  /* ---- 3. CUBIERTA SUPERIOR DEL BÚNKER, CHIMENEAS Y SOPORTE SOLAR ---- */
  // Cimiento de hormigón superior cubierto parcialmente por tierra irregular
  g.fillStyle = lights ? '#313330' : '#171918';
  rr(g, 90, 575, 984, 110, 14);
  g.fill();
  g.strokeStyle = '#111312'; g.lineWidth = 3; g.stroke();

  // Montículos irregulares de tierra sobre la losa
  g.fillStyle = lights ? '#2b2017' : '#120f0c';
  g.beginPath();
  g.moveTo(86, 588);
  g.quadraticCurveTo(160, 558, 228, 574);
  g.quadraticCurveTo(410, 548, 545, 574);
  g.quadraticCurveTo(780, 558, 930, 576);
  g.lineTo(1082, 586);
  g.lineTo(1082, 608);
  g.lineTo(86, 608);
  g.closePath();
  g.fill();

  // Conducto de ventilación (chimenea corta en x=960, y=340) y escape del generador (x=1025, y=232)
  drawCurvedPipe(g, [[960, 580], [960, 344]], 22, lights ? '#50585b' : '#24282a', lights ? '#788488' : '#394043', '#15181a', lights);
  g.fillStyle = lights ? '#3f4649' : '#1e2224';
  g.beginPath(); g.arc(960, 344, 17, Math.PI, 0); g.closePath(); g.fill();
  g.strokeStyle = '#141719'; g.lineWidth = 2.5; g.stroke();

  drawCurvedPipe(g, [[1025, 580], [1025, 236]], 18, lights ? '#473e38' : '#221e1b', lights ? '#6b5e55' : '#37302b', '#14110f', lights);
  g.fillStyle = '#25211e';
  g.beginPath(); g.ellipse(1025, 236, 14, 5, 0, 0, Math.PI * 2); g.fill();

  // Soporte metálico en celosía para el panel solar (x: 526..1010)
  g.save();
  g.strokeStyle = lights ? '#3d4245' : '#1e2123';
  g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(645, 568); g.lineTo(685, 456);
  g.moveTo(765, 568); g.lineTo(750, 420);
  g.moveTo(860, 568); g.lineTo(820, 445);
  g.moveTo(665, 516); g.lineTo(838, 516);
  g.stroke();
  [645, 765, 860].forEach(px => {
    g.fillStyle = '#212527';
    rr(g, px - 15, 558, 30, 12, 3); g.fill();
  });
  g.restore();

  // Pozo vertical de bajada desde la caseta Quonset al Piso 1 (x: 256..332, y: 558..706)
  g.fillStyle = '#111312';
  g.fillRect(256, 558, 76, 150);
  g.strokeStyle = '#3b403d'; g.lineWidth = 4;
  g.strokeRect(256, 558, 76, 150);
  drawLadder(g, 273, 564, 712, 42, lights);

  /* ---- 4. ESTRUCTURA EXTERIOR DEL BÚNKER + HUECO DE ESCALERA DERECHO ---- */
  // Casco de hormigón armado grueso enmarcando las 4 plantas y la escalera
  const hullG = g.createLinearGradient(86, 665, 1084, 665);
  hullG.addColorStop(0, '#222220');
  hullG.addColorStop(0.04, '#343532');
  hullG.addColorStop(0.5, '#252624');
  hullG.addColorStop(0.96, '#343532');
  hullG.addColorStop(1, '#1e1f1d');
  g.fillStyle = hullG;
  rr(g, 86, 672, 990, 1412, 18);
  g.fill();
  g.strokeStyle = '#0d0e0d'; g.lineWidth = 5; g.stroke();

  // Textura de hormigón sucio sobre el casco
  if (pat) {
    g.save();
    rr(g, 86, 672, 990, 1412, 18);
    g.clip();
    g.fillStyle = pat;
    g.fillRect(86, 672, 990, 1412);
    g.restore();
  }

  /* ---- 5. LAS 4 CÁMARAS PRINCIPALES + HUECO DE ESCALERA EN LA DERECHA ---- */
  const floors = [
    { x: 102, y: 700,  w: 852, h: 316, floorY: 954,  lampX: 530, lampType: 'pendant', wallTop: '#33302b', wallBot: '#211f1c', floorA: '#292622', floorB: '#1b1916' },
    { x: 102, y: 1048, w: 852, h: 316, floorY: 1304, lampX: 530, lampType: 'tube',    wallTop: '#2e312f', wallBot: '#1d1f1e', floorA: '#262826', floorB: '#181a18' },
    { x: 102, y: 1396, w: 852, h: 316, floorY: 1652, lampX: 530, lampType: 'tube',    wallTop: '#2b322e', wallBot: '#1a201d', floorA: '#242926', floorB: '#161a18' },
    { x: 102, y: 1744, w: 852, h: 322, floorY: 2004, lampX: 530, lampType: 'tube',    wallTop: '#2d2f30', wallBot: '#1c1e1f', floorA: '#252728', floorB: '#17191a' }
  ];

  floors.forEach((fl, fi) => {
    const { x, y, w, h, floorY } = fl;

    // A) Cámara principal con pared trasera, sombras de esquina 3D y suelo en perspectiva
    g.save();
    rr(g, x, y, w, h, 8);
    g.clip();

    // Pared trasera
    const wg = g.createLinearGradient(0, y, 0, floorY);
    if (lights) {
      wg.addColorStop(0, fl.wallTop);
      wg.addColorStop(0.55, fl.wallBot);
      wg.addColorStop(1, '#141311');
    } else {
      wg.addColorStop(0, '#121211');
      wg.addColorStop(1, '#0a0a09');
    }
    g.fillStyle = wg;
    g.fillRect(x, y, w, floorY - y);

    // Franja de paneles de hormigón y manchas de humedad en la pared trasera
    g.strokeStyle = lights ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let px = x + 140; px < x + w; px += 142) {
      g.beginPath(); g.moveTo(px, y); g.lineTo(px, floorY); g.stroke();
    }
    // Cono de luz cálida desde la luminaria del techo
    if (lights) {
      const cone = g.createRadialGradient(fl.lampX, y + 48, 18, fl.lampX, y + 185, 420);
      cone.addColorStop(0, 'rgba(255,222,158,0.20)');
      cone.addColorStop(0.45, 'rgba(255,198,118,0.08)');
      cone.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cone;
      g.fillRect(x, y, w, h);
    }

    // Suelo de hormigón en perspectiva 2.5D
    const dg = g.createLinearGradient(0, floorY, 0, y + h);
    dg.addColorStop(0, lights ? '#171614' : '#0b0b0a');
    dg.addColorStop(0.22, lights ? fl.floorA : '#10100f');
    dg.addColorStop(1, lights ? fl.floorB : '#090908');
    g.fillStyle = dg;
    g.fillRect(x, floorY, w, y + h - floorY);

    // Juntas de losas en perspectiva del suelo
    g.strokeStyle = lights ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.6;
    const midX = x + w / 2;
    for (let i = -4; i <= 4; i++) {
      g.beginPath();
      g.moveTo(midX + i * 95, floorY);
      g.lineTo(midX + i * 116, y + h);
      g.stroke();
    }
    // Textura sucia/grunge sobre pared y suelo
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(x, y, w, h);
    }

    // Oclusión ambiental profunda en los cuatro bordes de la sala (efecto profundidad 3D)
    const aoTop = g.createLinearGradient(0, y, 0, y + 36);
    aoTop.addColorStop(0, 'rgba(0,0,0,0.68)'); aoTop.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = aoTop; g.fillRect(x, y, w, 36);

    const aoBot = g.createLinearGradient(0, y + h - 22, 0, y + h);
    aoBot.addColorStop(0, 'rgba(0,0,0,0)'); aoBot.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = aoBot; g.fillRect(x, y + h - 22, w, 22);

    const aoLeft = g.createLinearGradient(x, 0, x + 52, 0);
    aoLeft.addColorStop(0, 'rgba(0,0,0,0.62)'); aoLeft.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = aoLeft; g.fillRect(x, y, 52, h);

    const aoRight = g.createLinearGradient(x + w - 52, 0, x + w, 0);
    aoRight.addColorStop(0, 'rgba(0,0,0,0)'); aoRight.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = aoRight; g.fillRect(x + w - 52, y, 52, h);

    // Sombra en el zócalo pared-suelo
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(x, floorY - 3, w, 6);

    // Detalles arquitectónicos y utilitarios de fondo por piso (coherentes con el arte)
    if (fi === 0) {
      // Piso 1: Cuadro paisajístico en la pared + mesa y silla + puerta de paso a la escalera
      g.save();
      g.fillStyle = '#1b1713';
      rr(g, 636, 796, 118, 72, 3); g.fill();
      g.strokeStyle = lights ? '#4d4134' : '#221d17'; g.lineWidth = 4; g.stroke();
      const skyP = g.createLinearGradient(640, 800, 640, 864);
      skyP.addColorStop(0, lights ? '#2b3e52' : '#131b24');
      skyP.addColorStop(1, lights ? '#879cb0' : '#2d343b');
      g.fillStyle = skyP; g.fillRect(640, 800, 110, 64);
      g.fillStyle = lights ? '#28333a' : '#14191c';
      g.beginPath();
      g.moveTo(640, 864); g.lineTo(665, 834); g.lineTo(696, 850); g.lineTo(728, 828); g.lineTo(750, 854); g.lineTo(750, 864);
      g.closePath(); g.fill();
      g.restore();

      // Mesa de madera y silla bajo el cuadro
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.beginPath(); g.ellipse(696, floorY + 2, 74, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = lights ? '#5c422c' : '#251b12';
      rr(g, 630, floorY - 56, 132, 10, 3); g.fill();
      g.fillStyle = lights ? '#433020' : '#1b130d';
      g.fillRect(640, floorY - 46, 9, 46);
      g.fillRect(743, floorY - 46, 9, 46);
      // Silla
      g.fillRect(760, floorY - 62, 6, 62);
      g.fillRect(786, floorY - 32, 6, 32);
      g.fillRect(758, floorY - 34, 34, 6);
      g.restore();

      // Puerta reforzada hacia el hueco de escalera
      drawWallDoor(g, 850, floorY, lights);
    } else if (fi === 1) {
      // Piso 2: Banco de trabajo con herramientas en pared + extintor
      drawWallWorkbench(g, 388, floorY, lights);
      drawWallExtinguisher(g, 926, floorY, lights);
    } else if (fi === 2) {
      // Piso 3: Bandas sutiles en pared trasera detrás del invernadero y tanques
      g.fillStyle = lights ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.35)';
      g.fillRect(x, y + 62, w, 12);
    } else if (fi === 3) {
      // Piso 4: Franja de seguridad en suelo y tubería de desagüe
      g.fillStyle = lights ? 'rgba(218,148,42,0.18)' : 'rgba(218,148,42,0.06)';
      g.fillRect(x + 24, floorY - 4, w - 48, 4);
      drawWallExtinguisher(g, 472, floorY, lights);
    }

    // Luminaria en el techo de cada planta
    if (fl.lampType === 'pendant') {
      g.strokeStyle = '#181a19'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(fl.lampX, y); g.lineTo(fl.lampX, y + 34); g.stroke();
      g.fillStyle = lights ? '#444845' : '#1e201f';
      g.beginPath();
      g.moveTo(fl.lampX - 24, y + 42);
      g.quadraticCurveTo(fl.lampX, y + 24, fl.lampX + 24, y + 42);
      g.closePath(); g.fill();
      g.fillStyle = lights ? '#ffe7aa' : '#3a3731';
      g.beginPath(); g.ellipse(fl.lampX, y + 43, 14, 5, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#252826';
      rr(g, fl.lampX - 54, y + 8, 108, 9, 3); g.fill();
      g.fillStyle = lights ? '#fff3d1' : '#383834';
      rr(g, fl.lampX - 48, y + 14, 96, 5, 2); g.fill();
    }

    g.restore();

    // Marco biselado de la cámara
    g.strokeStyle = '#0c0d0c'; g.lineWidth = 4;
    rr(g, x, y, w, h, 8); g.stroke();

    // B) Hueco vertical de escaleras en el lado derecho (x: 966..1054)
    const sx = 966, sw = 88;
    g.save();
    rr(g, sx, y, sw, h, 6);
    g.clip();
    const swg = g.createLinearGradient(sx, y, sx + sw, y + h);
    swg.addColorStop(0, lights ? '#2b251e' : '#12100e');
    swg.addColorStop(1, lights ? '#161411' : '#090908');
    g.fillStyle = swg;
    g.fillRect(sx, y, sw, h);
    if (pat) { g.fillStyle = pat; g.fillRect(sx, y, sw, h); }
    // Halo cálido de la bombilla del hueco de escalera
    if (lights) {
      const lhg = g.createRadialGradient(sx + sw / 2, y + 30, 4, sx + sw / 2, y + 55, 130);
      lhg.addColorStop(0, 'rgba(255,214,132,0.42)');
      lhg.addColorStop(1, 'rgba(255,180,84,0)');
      g.fillStyle = lhg;
      g.fillRect(sx, y, sw, h);
    }
    drawLadder(g, sx + 22, y + 18, y + h - 8, 44, lights);
    // Bombilla enjaulada arriba de cada tramo de escalera
    g.fillStyle = '#232624';
    g.fillRect(sx + sw / 2 - 8, y + 4, 16, 10);
    g.fillStyle = lights ? '#ffe29c' : '#3a352c';
    g.beginPath(); g.arc(sx + sw / 2, y + 20, 7, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = '#0c0d0c'; g.lineWidth = 3.5;
    rr(g, sx, y, sw, h, 6); g.stroke();
  });

  /* ---- 6. TUBERÍAS DE INTERCONEXIÓN ENTRE EQUIPOS ---- */
  // Pluvial del techo al tanque de agua sucia (Piso 3, x=873)
  drawCurvedPipe(g, [[873, 580], [873, 688], [958, 688], [958, 1380], [873, 1380], [873, 1430]], 10,
    lights ? '#4b5a61' : '#22282b', lights ? '#788d96' : '#353e42', '#121618', lights);

  // Agua sucia: Tanque sucio (Piso 3, x=873, y=1672) -> Bomba azul (Piso 4, x=862, y=1960)
  drawCurvedPipe(g, [[873, 1672], [873, 1730], [944, 1730], [944, 1962], [900, 1962]], 11,
    lights ? '#616859' : '#2a2e27', lights ? '#8b9480' : '#40453b', '#141712', lights);

  // Agua purificada: Bomba azul (Piso 4, x=788, y=1960) -> Tanque azul limpio (Piso 4, x=712, y=1910)
  drawCurvedPipe(g, [[792, 1960], [748, 1960], [748, 1910], [712, 1910]], 11,
    lights ? '#247bc2' : '#123959', lights ? '#65b6f2' : '#285f8a', '#0c2133', lights);

  // Escape del generador (Piso 2, x=910, y=1242) -> Chimenea alta (x=1025)
  drawCurvedPipe(g, [[908, 1242], [944, 1205], [1025, 1205], [1025, 580]], 11,
    lights ? '#4e453e' : '#24201d', lights ? '#7a6c62' : '#3b342f', '#151210', lights);

  // Conducto curvo de ventilación desde el ventilador (Piso 4, cx=830, cy=1834) hacia chimenea corta (x=960)
  drawCurvedPipe(g, [[876, 1796], [960, 1796], [960, 580]], 16,
    lights ? '#576064' : '#272b2d', lights ? '#879399' : '#3f464a', '#16191b', lights);

  return c;
}

/* ================= GENERADOR DE SPRITES DE ALTA RESOLUCIÓN ================= */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function buildEquipmentSprites() {
  const sp = {};

  // 1. Caseta de entrada Quonset en hormigón grueso con puerta de acero y farol (hatch) 320x430
  {
    const [c, g] = makeCanvas(320, 430);
    // Sombra en el suelo
    g.fillStyle = 'rgba(0,0,0,0.58)';
    g.beginPath(); g.ellipse(160, 412, 146, 18, 0, 0, Math.PI * 2); g.fill();
    // Montículos de tierra en los laterales del arco
    g.fillStyle = '#2d2118';
    g.beginPath();
    g.moveTo(10, 412); g.quadraticCurveTo(32, 345, 62, 360); g.lineTo(62, 412); g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(310, 412); g.quadraticCurveTo(288, 345, 258, 360); g.lineTo(258, 412); g.closePath(); g.fill();

    // Arco exterior grueso de hormigón (estilo búnker de la captura)
    const domeG = g.createLinearGradient(32, 76, 288, 396);
    domeG.addColorStop(0, '#6a655d');
    domeG.addColorStop(0.5, '#46433e');
    domeG.addColorStop(1, '#262522');
    g.fillStyle = domeG;
    g.beginPath();
    g.moveTo(32, 404);
    g.lineTo(32, 205);
    g.bezierCurveTo(32, 68, 288, 68, 288, 205);
    g.lineTo(288, 404);
    g.closePath();
    g.fill();
    g.strokeStyle = '#141311'; g.lineWidth = 5; g.stroke();

    // Hueco abovedado interior en sombra
    g.fillStyle = '#1b1a18';
    g.beginPath();
    g.moveTo(64, 402);
    g.lineTo(64, 212);
    g.bezierCurveTo(64, 110, 256, 110, 256, 212);
    g.lineTo(256, 402);
    g.closePath();
    g.fill();
    g.strokeStyle = '#312e2a'; g.lineWidth = 4; g.stroke();

    // Puerta blindada rectangular dentro del túnel
    const doorG = g.createLinearGradient(104, 196, 216, 398);
    doorG.addColorStop(0, '#4c5150'); doorG.addColorStop(1, '#262a29');
    g.fillStyle = doorG;
    rr(g, 102, 198, 116, 198, 5); g.fill();
    g.strokeStyle = '#121514'; g.lineWidth = 4; g.stroke();
    // Refuerzos horizontales y remaches
    [238, 298, 356].forEach(ry => {
      g.fillStyle = '#2d3231';
      g.fillRect(108, ry, 104, 8);
    });
    // Manija/volante lateral
    g.strokeStyle = '#aeb5b0'; g.lineWidth = 4;
    g.beginPath(); g.arc(190, 304, 14, 0, Math.PI * 2); g.stroke();

    // Farol cálido encima de la puerta con halo
    const lg = g.createRadialGradient(160, 160, 4, 160, 160, 56);
    lg.addColorStop(0, 'rgba(255,226,148,0.85)');
    lg.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = lg; g.beginPath(); g.arc(160, 160, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff0be';
    g.beginPath(); g.arc(160, 160, 10, 0, Math.PI * 2); g.fill();
    sp.hatch = c;
  }

  // 2. Panel Solar inclinado (sano y roto) 484x188
  const buildSolar = (broken) => {
    const [c, g] = makeCanvas(484, 188);
    const pts = [[150, 4], [480, 4], [334, 184], [4, 182]];
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    const frm = g.createLinearGradient(0, 0, 484, 188);
    frm.addColorStop(0, '#8d969c'); frm.addColorStop(0.5, '#596166'); frm.addColorStop(1, '#32373b');
    g.fillStyle = frm; g.fill();
    g.strokeStyle = '#15191c'; g.lineWidth = 4; g.stroke();

    g.save();
    g.beginPath();
    g.moveTo(154, 12); g.lineTo(466, 12); g.lineTo(328, 176); g.lineTo(18, 174);
    g.closePath();
    g.clip();
    const cellG = g.createLinearGradient(0, 10, 460, 176);
    if (broken) {
      cellG.addColorStop(0, '#22262b'); cellG.addColorStop(1, '#121518');
    } else {
      cellG.addColorStop(0, '#193b68'); cellG.addColorStop(0.5, '#132d50'); cellG.addColorStop(1, '#0d1f38');
    }
    g.fillStyle = cellG;
    g.fillRect(0, 0, 484, 188);

    g.strokeStyle = broken ? 'rgba(130,150,165,0.20)' : 'rgba(155,205,245,0.42)';
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      g.beginPath(); g.moveTo(154 + 312 * f, 12); g.lineTo(18 + 310 * f, 176); g.stroke();
    }
    for (let j = 1; j < 4; j++) {
      const f = j / 4;
      g.beginPath(); g.moveTo(154 - 136 * f, 12 + 162 * f); g.lineTo(466 - 138 * f, 12 + 164 * f); g.stroke();
    }
    if (broken) {
      g.strokeStyle = 'rgba(225,235,242,0.72)'; g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(190, 42); g.lineTo(245, 98); g.lineTo(318, 65);
      g.moveTo(245, 98); g.lineTo(288, 148);
      g.moveTo(245, 98); g.lineTo(156, 132);
      g.stroke();
    } else {
      g.fillStyle = 'rgba(255,216,158,0.14)';
      g.beginPath(); g.moveTo(195, 12); g.lineTo(270, 12); g.lineTo(148, 176); g.lineTo(75, 176); g.closePath(); g.fill();
    }
    g.restore();
    return c;
  };
  sp.solar = buildSolar(false);
  sp.solarBroken = buildSolar(true);

  // 3. Cama de madera con manta azul pizarra arrugada (bed) 325x135
  {
    const [c, g] = makeCanvas(325, 135);
    g.fillStyle = 'rgba(0,0,0,0.48)';
    g.beginPath(); g.ellipse(162, 126, 148, 9, 0, 0, Math.PI * 2); g.fill();
    // Cabecero y patas de madera oscura
    g.fillStyle = '#4e3926';
    rr(g, 16, 22, 18, 102, 4); g.fill();
    rr(g, 290, 56, 16, 68, 4); g.fill();
    rr(g, 18, 90, 286, 16, 4); g.fill();
    g.strokeStyle = '#1b130c'; g.lineWidth = 2.5; g.stroke();
    // Colchón claro
    const matG = g.createLinearGradient(0, 62, 0, 92);
    matG.addColorStop(0, '#c7c1b0'); matG.addColorStop(1, '#858072');
    g.fillStyle = matG;
    rr(g, 30, 66, 264, 26, 7); g.fill();
    g.strokeStyle = '#292620'; g.lineWidth = 2; g.stroke();
    // Manta azul grisáceo oscuro doblada (igual a la captura)
    const blG = g.createLinearGradient(0, 58, 0, 98);
    blG.addColorStop(0, '#455761'); blG.addColorStop(0.55, '#303e46'); blG.addColorStop(1, '#1e282d');
    g.fillStyle = blG;
    g.beginPath();
    g.moveTo(92, 62);
    g.quadraticCurveTo(200, 54, 298, 66);
    g.quadraticCurveTo(302, 95, 284, 98);
    g.lineTo(92, 98);
    g.quadraticCurveTo(84, 80, 92, 62);
    g.closePath(); g.fill();
    g.strokeStyle = '#141a1e'; g.lineWidth = 2.5; g.stroke();
    // Pliegues suaves en la manta
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(115, 74); g.quadraticCurveTo(185, 79, 255, 73); g.stroke();
    // Almohada mullida
    g.fillStyle = '#d8d3c3';
    g.beginPath(); g.ellipse(62, 61, 28, 13, -0.06, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#625e52'; g.lineWidth = 2; g.stroke();
    sp.bed = c;
  }

  // 4. Radio táctica vintage sobre mesa de madera (radio) 160x160
  {
    const [c, g] = makeCanvas(160, 160);
    // Sombra bajo mesa
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(80, 152, 68, 7, 0, 0, Math.PI * 2); g.fill();
    // Mesa de madera
    g.fillStyle = '#5c422c';
    rr(g, 10, 102, 140, 13, 3); g.fill();
    g.fillStyle = '#3e2c1d';
    g.fillRect(20, 115, 10, 38);
    g.fillRect(130, 115, 10, 38);
    g.strokeStyle = '#18110b'; g.lineWidth = 2;
    g.strokeRect(10, 102, 140, 13);

    // Antena telescópica
    g.strokeStyle = '#a4aba6'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(34, 42); g.lineTo(20, 6); g.stroke();
    g.fillStyle = '#e8a33d';
    g.beginPath(); g.arc(20, 6, 3.5, 0, Math.PI * 2); g.fill();

    // Cuerpo de la radio de campaña metálica
    const rg = g.createLinearGradient(22, 42, 138, 104);
    rg.addColorStop(0, '#4a4e4b'); rg.addColorStop(1, '#262927');
    g.fillStyle = rg;
    rr(g, 20, 42, 120, 62, 6); g.fill();
    g.strokeStyle = '#121413'; g.lineWidth = 3; g.stroke();

    // Altavoz izquierdo con rejilla horizontal
    g.fillStyle = '#1b1d1c';
    rr(g, 28, 50, 40, 44, 4); g.fill();
    g.strokeStyle = '#585e5a'; g.lineWidth = 1.5;
    for (let sy = 56; sy <= 88; sy += 6) {
      g.beginPath(); g.moveTo(32, sy); g.lineTo(64, sy); g.stroke();
    }
    // Dial ámbar iluminado
    g.fillStyle = '#1b160c';
    rr(g, 74, 50, 56, 22, 3); g.fill();
    g.fillStyle = '#f2ae44';
    g.fillRect(78, 57, 48, 8);
    g.strokeStyle = '#c83e2e'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(104, 52); g.lineTo(104, 70); g.stroke();
    // Perillas circulares
    [84, 104, 122].forEach(kx => {
      g.fillStyle = '#1c1e1d';
      g.beginPath(); g.arc(kx, 88, 6.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9aa19c'; g.lineWidth = 1.5; g.stroke();
    });
    sp.radio = c;
  }

  // 5. Interruptor industrial de luces (lights) 128x128
  {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = '#3c403e';
    rr(g, 32, 20, 64, 88, 8); g.fill();
    g.strokeStyle = '#151817'; g.lineWidth = 3.5; g.stroke();
    g.fillStyle = '#222624';
    rr(g, 42, 32, 44, 62, 5); g.fill();
    g.fillStyle = '#d98a2b';
    rr(g, 56, 44, 16, 38, 4); g.fill();
    g.strokeStyle = '#1b1409'; g.lineWidth = 2; g.stroke();
    sp.lights = c;
  }

  // 6. Panel eléctrico industrial (panel) 245x170
  {
    const [c, g] = makeCanvas(245, 170);
    const pg = g.createLinearGradient(8, 8, 237, 162);
    pg.addColorStop(0, '#444845'); pg.addColorStop(1, '#242725');
    g.fillStyle = pg;
    rr(g, 8, 8, 229, 154, 10); g.fill();
    g.strokeStyle = '#111312'; g.lineWidth = 4; g.stroke();
    [60, 126].forEach((cx, idx) => {
      g.fillStyle = '#dedbd0';
      g.beginPath(); g.arc(cx, 52, 22, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1b201e'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#b6492f'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx, 52); g.lineTo(cx + (idx ? 10 : -8), 38); g.stroke();
    });
    for (let i = 0; i < 5; i++) {
      const bx = 34 + i * 36;
      g.fillStyle = '#171a18';
      rr(g, bx, 96, 26, 42, 4); g.fill();
      g.fillStyle = i % 2 === 0 ? '#7fb069' : '#e8a33d';
      g.beginPath(); g.arc(bx + 13, 108, 4.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#e8a33d';
    g.beginPath(); g.arc(194, 52, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#181408';
    g.beginPath();
    g.moveTo(197, 40); g.lineTo(187, 54); g.lineTo(195, 54); g.lineTo(191, 65); g.lineTo(203, 50); g.lineTo(195, 50);
    g.closePath(); g.fill();
    sp.panel = c;
  }

  // 7. Generador industrial AMARILLO con jaula negra y triángulo de peligro (gen) 280x190
  {
    const [c, g] = makeCanvas(280, 190);
    // Sombra pesada en el suelo
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.ellipse(140, 176, 128, 11, 0, 0, Math.PI * 2); g.fill();
    // Bastidor exterior tubular negro
    g.strokeStyle = '#1f2326'; g.lineWidth = 10; g.lineJoin = 'round';
    rr(g, 18, 22, 244, 146, 12); g.stroke();
    // Ruedas y soportes inferiores
    g.fillStyle = '#191c1e';
    g.beginPath(); g.arc(54, 168, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4e5559'; g.lineWidth = 3; g.stroke();
    rr(g, 212, 160, 22, 14, 4); g.fill();

    // Carcasa principal amarilla industrial (exactamente como el de la captura)
    const yg = g.createLinearGradient(0, 24, 0, 158);
    yg.addColorStop(0, '#f2b82e');
    yg.addColorStop(0.55, '#d6941b');
    yg.addColorStop(1, '#9c6610');
    g.fillStyle = yg;
    rr(g, 28, 28, 224, 130, 8); g.fill();
    g.strokeStyle = '#241806'; g.lineWidth = 3.5; g.stroke();

    // Tapa superior gris oscura y tapón de gasolina
    g.fillStyle = '#2e3336';
    rr(g, 38, 18, 166, 18, 6); g.fill();
    g.fillStyle = '#d94836';
    rr(g, 56, 11, 24, 9, 3); g.fill();

    // Rejilla de ventilación izquierda
    g.fillStyle = '#23272a';
    rr(g, 42, 46, 72, 92, 5); g.fill();
    g.strokeStyle = '#484f54'; g.lineWidth = 2;
    for (let ly = 58; ly < 132; ly += 11) {
      g.beginPath(); g.moveTo(48, ly); g.lineTo(108, ly); g.stroke();
    }

    // Triángulo amarillo/negro de alta tensión en la puerta central
    g.save();
    g.beginPath();
    g.moveTo(156, 56); g.lineTo(186, 108); g.lineTo(126, 108); g.closePath();
    g.fillStyle = '#ffd046'; g.fill();
    g.strokeStyle = '#181408'; g.lineWidth = 4.5; g.stroke();
    g.fillStyle = '#181408';
    g.beginPath();
    g.moveTo(159, 72); g.lineTo(149, 88); g.lineTo(156, 88); g.lineTo(152, 100); g.lineTo(164, 83); g.lineTo(156, 83);
    g.closePath(); g.fill();
    g.restore();

    // Panel de control lateral derecho (relojes y enchufes)
    g.fillStyle = '#212528';
    rr(g, 198, 44, 44, 98, 5); g.fill();
    g.fillStyle = '#e5e2d5';
    g.beginPath(); g.arc(220, 64, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d94836'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(220, 64); g.lineTo(226, 57); g.stroke();
    g.fillStyle = '#7fb069';
    g.beginPath(); g.arc(220, 92, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111314';
    rr(g, 208, 108, 24, 22, 3); g.fill();

    // Barras de refuerzo de la jaula
    g.strokeStyle = '#23282b'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(18, 86); g.lineTo(262, 86); g.stroke();
    sp.gen = c;
  }

  // 8. Rack industrial de baterías en 2 niveles con cableado (batt) 344x122
  {
    const [c, g] = makeCanvas(344, 122);
    g.fillStyle = 'rgba(0,0,0,0.48)';
    g.beginPath(); g.ellipse(172, 115, 162, 7, 0, 0, Math.PI * 2); g.fill();
    // Bastidor metálico oscuro en 2 pisos
    g.fillStyle = '#1b1f22';
    rr(g, 10, 8, 324, 106, 6); g.fill();
    g.strokeStyle = '#485056'; g.lineWidth = 3.5; g.stroke();
    g.fillStyle = '#33393d';
    g.fillRect(14, 58, 316, 6);

    // 6 módulos de baterías (3 arriba, 3 abajo o 6 columnas compactas)
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        const bx = 22 + i * 51;
        const by = row === 0 ? 16 : 67;
        const bg = g.createLinearGradient(bx, by, bx + 42, by + 38);
        bg.addColorStop(0, '#363d40'); bg.addColorStop(1, '#1d2224');
        g.fillStyle = bg;
        rr(g, bx, by, 42, 38, 4); g.fill();
        g.strokeStyle = '#0e1112'; g.lineWidth = 2; g.stroke();
        // Bornes y cables
        g.fillStyle = '#d98a2b';
        g.fillRect(bx + 7, by - 4, 8, 5);
        g.fillRect(bx + 27, by - 4, 8, 5);
      }
    }
    // Cables gruesos rojos y negros conectando las celdas
    g.strokeStyle = '#a8362a'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(34, 14); g.lineTo(310, 14); g.stroke();
    g.beginPath(); g.moveTo(34, 65); g.lineTo(310, 65); g.stroke();
    sp.batt = c;
  }

  // 9. Tanques cilíndricos (dirty sucio oxidado y clean azul cobalto) con recorte central transparente
  const buildTankFrame = (w, h, holeX, holeY, holeW, holeH, mode) => {
    const [c, g] = makeCanvas(w, h);
    const isClean = mode === 'clean';
    // Sombra bajo patas
    g.fillStyle = 'rgba(0,0,0,0.48)';
    g.beginPath(); g.ellipse(w / 2, h - 5, w * 0.44, 7, 0, 0, Math.PI * 2); g.fill();
    // Patas de apoyo
    g.strokeStyle = isClean ? '#183754' : '#2d302e'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(26, h - 28); g.lineTo(18, h - 6);
    g.moveTo(w - 26, h - 28); g.lineTo(w - 18, h - 6);
    g.stroke();
    // Cuerpo cilíndrico metálico (azul cobalto vibrante vs acero oxidado)
    const tg = g.createLinearGradient(0, 0, w, 0);
    if (isClean) {
      tg.addColorStop(0, '#0e4678');
      tg.addColorStop(0.28, '#1a7fd1');
      tg.addColorStop(0.50, '#44a9f2');
      tg.addColorStop(0.80, '#125c9e');
      tg.addColorStop(1, '#0a3359');
    } else {
      tg.addColorStop(0, '#303332');
      tg.addColorStop(0.28, '#595e5c');
      tg.addColorStop(0.52, '#737773');
      tg.addColorStop(0.82, '#414442');
      tg.addColorStop(1, '#252726');
    }
    g.fillStyle = tg;
    rr(g, 8, 12, w - 16, h - 32, Math.min(46, w * 0.34));
    g.fill();
    g.strokeStyle = isClean ? '#082642' : '#161817'; g.lineWidth = 3.5; g.stroke();

    // Manchas sutiles de óxido en el tanque sucio
    if (!isClean) {
      g.fillStyle = 'rgba(130,70,30,0.28)';
      g.beginPath(); g.ellipse(32, 54, 16, 10, 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w - 30, h - 65, 18, 12, -0.2, 0, Math.PI * 2); g.fill();
    }

    // Zunchos remachados
    [32, h - 48].forEach(sy => {
      g.fillStyle = 'rgba(0,0,0,0.30)';
      g.fillRect(10, sy, w - 20, 6);
    });
    // Escotilla/tapa superior
    g.fillStyle = isClean ? '#0f4c82' : '#3a3d3c';
    rr(g, w / 2 - 22, 4, 44, 13, 4); g.fill();
    g.strokeStyle = '#121517'; g.lineWidth = 2; g.stroke();

    // Recorte transparente central para dejar ver el agua dentro
    g.save();
    g.globalCompositeOperation = 'destination-out';
    rr(g, holeX, holeY, holeW, holeH, 12);
    g.fill();
    g.restore();
    return c;
  };
  sp.tankDirty = buildTankFrame(150, 254, 33, 58, 84, 142, 'dirty');
  sp.tankClean = buildTankFrame(212, 202, 31, 40, 150, 134, 'clean');

  // 10. Bomba hidráulica azul cobalto (pump) 180x120
  {
    const [c, g] = makeCanvas(180, 120);
    g.fillStyle = 'rgba(0,0,0,0.50)';
    g.beginPath(); g.ellipse(90, 108, 78, 9, 0, 0, Math.PI * 2); g.fill();
    const mg = g.createLinearGradient(0, 32, 0, 96);
    mg.addColorStop(0, '#3a9ce8'); mg.addColorStop(0.5, '#196fb5'); mg.addColorStop(1, '#0d416e');
    g.fillStyle = mg;
    rr(g, 24, 38, 86, 56, 12); g.fill();
    g.strokeStyle = '#09243d'; g.lineWidth = 3; g.stroke();
    for (let rx = 38; rx < 96; rx += 10) {
      g.fillStyle = 'rgba(6,24,42,0.45)';
      g.fillRect(rx, 42, 4, 48);
    }
    g.fillStyle = '#1e78c2';
    g.beginPath(); g.arc(128, 66, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#09243d'; g.lineWidth = 3; g.stroke();
    // Válvula roja arriba
    g.strokeStyle = '#d94836'; g.lineWidth = 5;
    g.beginPath(); g.arc(128, 22, 15, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(115, 22); g.lineTo(141, 22); g.moveTo(128, 22); g.lineTo(128, 38); g.stroke();
    sp.pump = c;
  }

  // 11. Carcasa circular del ventilador industrial (fanHousing) 136x136
  {
    const [c, g] = makeCanvas(136, 136);
    const hg = g.createRadialGradient(68, 68, 48, 68, 68, 68);
    hg.addColorStop(0, '#14181b');
    hg.addColorStop(0.75, '#4b5359');
    hg.addColorStop(1, '#1e2326');
    g.fillStyle = hg;
    g.beginPath(); g.arc(68, 68, 66, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#101315'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#8b9499';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath(); g.arc(68 + Math.cos(a) * 59, 68 + Math.sin(a) * 59, 3, 0, Math.PI * 2); g.fill();
    }
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(68, 68, 53, 0, Math.PI * 2); g.fill();
    g.restore();
    sp.fanHousing = c;
  }

  // 12. Bastidor hidropónico metálico de 3 NIVELES con tubos LED luminosos (hydro) 460x204
  {
    const [c, g] = makeCanvas(460, 204);
    g.fillStyle = 'rgba(0,0,0,0.48)';
    g.beginPath(); g.ellipse(230, 198, 222, 7, 0, 0, Math.PI * 2); g.fill();
    // Fondo oscuro sutil detrás de las repisas para contraste botánico
    g.fillStyle = 'rgba(12,18,14,0.62)';
    rr(g, 12, 8, 436, 186, 6); g.fill();

    // 3 niveles horizontales (bandeja + barra de luz LED superior)
    const tiers = [
      { lightY: 16, trayY: 62 },
      { lightY: 82, trayY: 126 },
      { lightY: 146, trayY: 190 }
    ];
    tiers.forEach(({ lightY, trayY }) => {
      // Halo suave de luz de cultivo
      const lg = g.createLinearGradient(0, lightY, 0, trayY);
      lg.addColorStop(0, 'rgba(205,255,215,0.20)');
      lg.addColorStop(1, 'rgba(90,220,130,0.03)');
      g.fillStyle = lg;
      g.fillRect(16, lightY, 428, trayY - lightY);
      // Luminaria superior LED blanca-verdosa
      g.fillStyle = '#2d3330';
      g.fillRect(24, lightY - 4, 412, 6);
      g.fillStyle = '#e8fff0';
      g.fillRect(28, lightY + 1, 404, 4);
      // Bandeja de cultivo metálica
      g.fillStyle = '#4b5250';
      rr(g, 14, trayY - 8, 432, 14, 3); g.fill();
      g.strokeStyle = '#181c1a'; g.lineWidth = 2; g.stroke();
      // Sustrato oscuro dentro de la bandeja
      g.fillStyle = '#261b12';
      g.fillRect(20, trayY - 6, 420, 6);
    });

    // Postes verticales de acero galvanizado
    g.strokeStyle = '#6c7472'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(12, 196); g.lineTo(12, 10); g.lineTo(448, 10); g.lineTo(448, 196);
    g.moveTo(156, 10); g.lineTo(156, 196);
    g.moveTo(304, 10); g.lineTo(304, 196);
    g.stroke();
    sp.hydro = c;
  }

  return sp;
}

/* ================= CONSTRUCTOR PARA SPRITES DEL EDITOR ADMIN ================= */
export function buildPresetSpriteCanvas(id, fanSprite) {
  const S2 = 128;
  const [c, g] = makeCanvas(S2, S2);
  const eq = buildEquipmentSprites();

  const drawFitted = (src, pad = 8) => {
    const sw = src.width, sh = src.height;
    const sc = Math.min((S2 - pad * 2) / sw, (S2 - pad * 2) / sh);
    const dw = sw * sc, dh = sh * sc;
    g.drawImage(src, (S2 - dw) / 2, (S2 - dh) / 2, dw, dh);
  };

  if (id === 'preset:hatch') { drawFitted(eq.hatch, 6); return c; }
  if (id === 'preset:solar') { drawFitted(eq.solar, 6); return c; }
  if (id === 'preset:bed') { drawFitted(eq.bed, 6); return c; }
  if (id === 'preset:radio') { drawFitted(eq.radio, 8); return c; }
  if (id === 'preset:lights') { drawFitted(eq.lights, 8); return c; }
  if (id === 'preset:panel') { drawFitted(eq.panel, 6); return c; }
  if (id === 'preset:gen') { drawFitted(eq.gen, 6); return c; }
  if (id === 'preset:batt') { drawFitted(eq.batt, 6); return c; }
  if (id === 'preset:pump') { drawFitted(eq.pump, 6); return c; }
  if (id === 'preset:hydro') { drawFitted(eq.hydro, 6); return c; }
  if (id === 'preset:tank_dirty') { drawFitted(eq.tankDirty, 6); return c; }
  if (id === 'preset:tank_clean') { drawFitted(eq.tankClean, 6); return c; }
  if (id === 'preset:fan') {
    if (fanSprite) g.drawImage(fanSprite, 8, 8, 112, 112);
    return c;
  }

  if (id === 'preset:can') {
    g.save(); g.translate(64, 108); g.scale(2.5, 2.5);
    const grd = g.createLinearGradient(-13, 0, 13, 0);
    grd.addColorStop(0, '#6d7276'); grd.addColorStop(0.25, '#c9ced1'); grd.addColorStop(0.55, '#9aa0a3'); grd.addColorStop(1, '#565b5f');
    g.fillStyle = grd; g.fillRect(-13, -32, 26, 32);
    g.fillStyle = '#b6492f'; g.fillRect(-12, -23, 24, 14);
    g.fillStyle = 'rgba(255,240,200,.85)'; g.fillRect(-7, -18, 14, 3);
    g.fillStyle = '#d7dcdf'; g.fillRect(-13, -32, 26, 3.5);
    g.strokeStyle = '#1d1a14'; g.lineWidth = 1.5; g.strokeRect(-13, -32, 26, 32);
    g.restore();
  } else if (id === 'preset:crate') {
    g.fillStyle = '#8a6844'; rr(g, 18, 30, 92, 68, 6); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(18, 54, 92, 4); g.fillRect(18, 76, 92, 4);
    g.strokeStyle = '#543e24'; g.lineWidth = 6; g.strokeRect(21, 33, 86, 62);
    g.beginPath(); g.moveTo(24, 36); g.lineTo(104, 92); g.stroke();
    g.fillStyle = 'rgba(255,240,200,.85)'; g.font = 'bold 16px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    g.fillText('RACIÓN', 64, 70);
  } else if (id === 'preset:jug') {
    g.fillStyle = '#7d8894'; g.fillRect(50, 14, 28, 12);
    g.fillStyle = '#a2b7c7'; rr(g, 28, 26, 72, 86, 12); g.fill();
    g.fillStyle = 'rgba(64,138,190,.82)'; rr(g, 35, 58, 58, 48, 8); g.fill();
    g.strokeStyle = 'rgba(228,240,246,.65)'; g.lineWidth = 4; g.beginPath(); g.moveTo(44, 38); g.lineTo(44, 98); g.stroke();
    g.strokeStyle = '#242b31'; g.lineWidth = 3; rr(g, 28, 26, 72, 86, 12); g.stroke();
  } else if (id === 'preset:bottle') {
    g.fillStyle = '#3f7fb8'; g.fillRect(54, 14, 20, 11);
    g.fillStyle = 'rgba(130,192,235,.92)';
    g.beginPath(); g.moveTo(54, 25); g.lineTo(74, 25); g.lineTo(84, 48); g.lineTo(84, 112); g.lineTo(44, 112); g.lineTo(44, 48); g.closePath(); g.fill();
    g.fillStyle = 'rgba(245,250,255,.9)'; g.fillRect(46, 60, 36, 20);
    g.strokeStyle = '#1e3040'; g.lineWidth = 3; g.stroke();
  } else if (id === 'preset:plant') {
    g.save();
    g.strokeStyle = '#4c8e38'; g.lineWidth = 6; g.lineCap = 'round';
    [[64, 110, 64, 26], [64, 110, 36, 42], [64, 110, 92, 40]].forEach(pts => {
      g.beginPath(); g.moveTo(pts[0], pts[1]); g.quadraticCurveTo((pts[0] + pts[2]) / 2, 65, pts[2], pts[3]); g.stroke();
    });
    g.fillStyle = '#6db852';
    [[46, 66, -0.7], [82, 66, 0.7], [40, 42, -0.5], [88, 42, 0.5], [64, 26, 0]].forEach(l => {
      g.save(); g.translate(l[0], l[1]); g.rotate(l[2]);
      g.beginPath(); g.ellipse(0, 0, 16, 8, 0, 0, 7); g.fill(); g.restore();
    });
    g.fillStyle = '#e8a33d';
    g.beginPath(); g.arc(40, 46, 6, 0, 7); g.arc(88, 44, 6, 0, 7); g.arc(64, 34, 6.5, 0, 7); g.fill();
    g.restore();
  } else if (id === 'preset:fuelcan') {
    g.fillStyle = '#c24136'; rr(g, 26, 28, 76, 84, 10); g.fill();
    g.fillStyle = '#8b241d'; rr(g, 56, 36, 30, 14, 5); g.fill();
    g.fillStyle = '#e8a33d'; g.fillRect(28, 18, 18, 12);
    g.strokeStyle = '#661914'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(40, 56); g.lineTo(88, 96); g.moveTo(88, 56); g.lineTo(40, 96); g.stroke();
    g.strokeStyle = '#1f0c0a'; g.lineWidth = 3; rr(g, 26, 28, 76, 84, 10); g.stroke();
  } else if (id === 'preset:medkit') {
    g.fillStyle = '#dfe4dc'; rr(g, 18, 30, 92, 74, 12); g.fill();
    g.fillStyle = '#4e564d'; rr(g, 46, 18, 36, 14, 5); g.fill();
    g.fillStyle = '#d94842'; g.fillRect(56, 46, 16, 42); g.fillRect(43, 59, 42, 16);
    g.strokeStyle = '#2b302a'; g.lineWidth = 3; rr(g, 18, 30, 92, 74, 12); g.stroke();
  } else if (id === 'preset:lamp') {
    const lg = g.createRadialGradient(64, 64, 8, 64, 64, 58);
    lg.addColorStop(0, 'rgba(255,220,120,0.95)'); lg.addColorStop(0.5, 'rgba(255,180,70,0.45)'); lg.addColorStop(1, 'rgba(255,180,70,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff5cf'; g.beginPath(); g.arc(64, 64, 18, 0, 7); g.fill();
  } else if (id === 'preset:rad') {
    g.fillStyle = '#e8a33d'; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill();
    g.fillStyle = '#141714';
    for (let i = 0; i < 3; i++) {
      const a = i * ((Math.PI * 2) / 3) - Math.PI / 2;
      g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 42, a - 0.45, a + 0.45); g.closePath(); g.fill();
    }
    g.fillStyle = '#e8a33d'; g.beginPath(); g.arc(64, 64, 13, 0, 7); g.fill();
    g.fillStyle = '#141714'; g.beginPath(); g.arc(64, 64, 8, 0, 7); g.fill();
  } else if (id === 'preset:web') {
    g.strokeStyle = 'rgba(235,232,220,.78)'; g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke();
    }
    [18, 34, 48].forEach(rad => {
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = (i * Math.PI) / 4;
        const px = 64 + Math.cos(a) * rad, py = 64 + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    });
  } else if (id === 'preset:barrel') {
    const bg = g.createLinearGradient(28, 0, 100, 0);
    bg.addColorStop(0, '#3e533e'); bg.addColorStop(0.4, '#6b8c6b'); bg.addColorStop(1, '#263626');
    g.fillStyle = bg;
    rr(g, 30, 16, 68, 96, 12); g.fill();
    g.strokeStyle = '#182218'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = '#222b22'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(30, 46); g.lineTo(98, 46); g.moveTo(30, 82); g.lineTo(98, 82); g.stroke();
  } else if (id === 'preset:extinguisher') {
    g.fillStyle = '#c83e32';
    rr(g, 44, 34, 40, 78, 16); g.fill();
    g.strokeStyle = '#220b09'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2a2e30'; g.fillRect(54, 22, 20, 14);
    g.strokeStyle = '#181a1b'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(64, 26); g.quadraticCurveTo(96, 30, 88, 76); g.stroke();
  } else if (id === 'preset:shelf') {
    g.fillStyle = '#4b3b29'; rr(g, 26, 14, 76, 100, 6); g.fill();
    g.strokeStyle = '#1d160e'; g.lineWidth = 3; g.stroke();
    [42, 70, 98].forEach(sy => {
      g.fillStyle = '#73583c'; g.fillRect(30, sy, 68, 6);
    });
  } else if (id === 'preset:batt_monitor') {
    g.fillStyle = '#283036'; rr(g, 18, 18, 92, 92, 10); g.fill();
    g.fillStyle = '#09120c'; rr(g, 28, 28, 72, 72, 6); g.fill();
    g.fillStyle = '#7fb069'; g.fillRect(36, 54, 44, 14);
    g.fillStyle = '#e8a33d'; g.fillRect(36, 74, 28, 8);
  }
  return c;
}
