/* ================= ULTIMATEDAY — EDITOR ADMIN PROFESIONAL DE ELEMENTOS Y SPRITES ================= */

const MAX_UNDO = 40;
let E = null; // window.UD_ENGINE
let root = null;
let initialized = false;

const activePointers = new Map();

const state = {
  active: false,
  tool: 'select', // 'select' | 'poly' | 'pan'
  selectedId: null,
  selectedVertex: -1,
  filterTab: 'all', // 'all' | 'sprite' | 'interactive' | 'visual' | 'hidden'
  search: '',
  snapGrid: true,
  gridSize: 16,
  showGrid: false,
  showGuides: true,
  keepAspect: false,
  previewDark: false,
  leftOpen: true,
  rightOpen: true,
  zoom: 0.45,
  panX: 0,
  panY: 0,
  undoStack: [],
  redoStack: [],
  smartGuides: [], // { type:'x'|'y', val }
  interact: null, // active pointer drag operation
  spaceDown: false,
  lastTouch: false,
  nudgePadOpen: false,
  nudgeStep: 1,
  nudgeMode: 'pos', // 'pos' | 'size'
  // Sprite modal state
  modalOpen: false,
  modalSpriteId: '',
  slicerEnabled: false,
  slicerCols: 4,
  slicerRows: 4,
  slicerCrop: null // { x, y, w, h }
};

function isMobileViewport() {
  return window.innerWidth <= 900;
}

function isTouchUI() {
  return (
    state.lastTouch ||
    isMobileViewport() ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  );
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cloneElements(els) {
  return JSON.parse(JSON.stringify(els));
}

function pushUndo() {
  if (!E) return;
  state.undoStack.push(cloneElements(E.LAYOUT.elements));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack.length = 0;
  updateToolbarButtons();
}

function undo() {
  if (!E || !state.undoStack.length) return;
  state.redoStack.push(cloneElements(E.LAYOUT.elements));
  E.LAYOUT.elements = state.undoStack.pop();
  E.saveLayout();
  if (state.selectedId && !E.getElement(state.selectedId)) state.selectedId = null;
  renderAllUI();
  E.toast('Acción deshecha.');
}

function redo() {
  if (!E || !state.redoStack.length) return;
  state.undoStack.push(cloneElements(E.LAYOUT.elements));
  E.LAYOUT.elements = state.redoStack.pop();
  E.saveLayout();
  if (state.selectedId && !E.getElement(state.selectedId)) state.selectedId = null;
  renderAllUI();
  E.toast('Acción rehecha.');
}

function selectedEl() {
  return state.selectedId && E ? E.getElement(state.selectedId) : null;
}

function snapVal(v) {
  if (!state.snapGrid) return Math.round(v);
  const g = state.gridSize || 16;
  return Math.round(v / g) * g;
}

/* ---------- Geometry Helpers (World <-> Local Rotated) ---------- */
function toLocal(el, px, py) {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const r = -((el.rot || 0) * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r)
  };
}

function toWorld(el, lx, ly) {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const r = ((el.rot || 0) * Math.PI) / 180;
  const dx = lx - cx;
  const dy = ly - cy;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r)
  };
}

function getHandlesWorld(el) {
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const localPts = [
    { key: 'nw', lx: x, ly: y },
    { key: 'n', lx: cx, ly: y },
    { key: 'ne', lx: x + w, ly: y },
    { key: 'e', lx: x + w, ly: cy },
    { key: 'se', lx: x + w, ly: y + h },
    { key: 's', lx: cx, ly: y + h },
    { key: 'sw', lx: x, ly: y + h },
    { key: 'w', lx: x, ly: cy }
  ];
  const rotDist = (isTouchUI() ? 42 : 34) / Math.max(0.2, E.view.s);
  localPts.push({ key: 'rot', lx: cx, ly: y - rotDist });
  if (el.shape === 'roundrect') {
    const r = Math.min(el.radius || 0, w / 2, h / 2);
    localPts.push({ key: 'rad', lx: x + Math.max(10, r), ly: y + Math.max(10, r) });
  }
  return localPts.map(pt => {
    const wp = toWorld(el, pt.lx, pt.ly);
    return { key: pt.key, x: wp.x, y: wp.y };
  });
}

function getPolyVerticesWorld(el) {
  const pts = Array.isArray(el.points) && el.points.length >= 3 ? el.points : [[0, 0], [1, 0], [1, 1], [0, 1]];
  return pts.map((p, idx) => {
    const lx = el.x + p[0] * el.w;
    const ly = el.y + p[1] * el.h;
    const wp = toWorld(el, lx, ly);
    return { idx, x: wp.x, y: wp.y, nx: p[0], ny: p[1] };
  });
}

function normalizePolygonToBounds(el) {
  if (!Array.isArray(el.points) || el.points.length < 3) return;
  const abs = el.points.map(p => ({
    x: el.x + p[0] * el.w,
    y: el.y + p[1] * el.h
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  abs.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  const nw = Math.max(12, maxX - minX);
  const nh = Math.max(12, maxY - minY);
  // Keep center aligned under rotation
  const oldCx = el.x + el.w / 2;
  const oldCy = el.y + el.h / 2;
  const newLocalCx = minX + nw / 2;
  const newLocalCy = minY + nh / 2;
  const r = ((el.rot || 0) * Math.PI) / 180;
  const dx = newLocalCx - oldCx;
  const dy = newLocalCy - oldCy;
  const worldNewCx = oldCx + dx * Math.cos(r) - dy * Math.sin(r);
  const worldNewCy = oldCy + dx * Math.sin(r) + dy * Math.cos(r);
  el.w = Math.round(nw);
  el.h = Math.round(nh);
  el.x = Math.round(worldNewCx - el.w / 2);
  el.y = Math.round(worldNewCy - el.h / 2);
  el.points = abs.map(p => [
    Number(((p.x - minX) / nw).toFixed(4)),
    Number(((p.y - minY) / nh).toFixed(4))
  ]);
}

function hitHandle(el, px, py, isTouch) {
  const touch = isTouch !== undefined ? isTouch : isTouchUI();
  const s = Math.max(0.25, E.view.s);
  const tol = (touch ? 28 : 13) / s;
  if (el.shape === 'polygon') {
    const verts = getPolyVerticesWorld(el);
    let bestV = null;
    let bestVD = tol;
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const d = Math.hypot(px - v.x, py - v.y);
      if (d <= bestVD) {
        bestVD = d;
        bestV = { type: 'vertex', idx: i };
      }
    }
    if (bestV) return bestV;

    let bestM = null;
    let bestMD = tol * 0.85;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.hypot(px - mx, py - my);
      if (d <= bestMD) {
        bestMD = d;
        bestM = { type: 'midpoint', idx: i };
      }
    }
    if (bestM) return bestM;
  }

  const handles = getHandlesWorld(el);
  // Check rotation handle first (positioned outside the top edge)
  const rotH = handles.find(h => h.key === 'rot');
  if (rotH && Math.hypot(px - rotH.x, py - rotH.y) <= tol) {
    return { type: 'box', key: 'rot' };
  }

  // Keep the interior core of the element dedicated to moving (essential for small elements on touch)
  const lp = toLocal(el, px, py);
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const innerHalfW = Math.max(4, el.w * 0.28);
  const innerHalfH = Math.max(4, el.h * 0.28);
  if (Math.abs(lp.x - cx) <= innerHalfW && Math.abs(lp.y - cy) <= innerHalfH) {
    return null;
  }

  const boxTol = (touch ? 24 : 13) / s;
  let bestH = null;
  let bestHD = boxTol;
  for (const h of handles) {
    if (h.key === 'rot') continue;
    const d = Math.hypot(px - h.x, py - h.y);
    if (d <= bestHD) {
      bestHD = d;
      bestH = { type: 'box', key: h.key };
    }
  }
  return bestH;
}

/* ---------- Overlay Rendering on Main Canvas ---------- */
function drawOverlay(c) {
  if (!state.active || !E) return;
  const invS = 1 / Math.max(0.2, E.view.s);
  const lw = Math.max(1, 1.5 * invS);

  // 1. Optional Grid
  if (state.showGrid) {
    const g = state.gridSize || 16;
    c.save();
    c.strokeStyle = 'rgba(232, 163, 61, 0.12)';
    c.lineWidth = 1 * invS;
    c.beginPath();
    for (let gx = 0; gx <= E.W; gx += g) {
      c.moveTo(gx, 0);
      c.lineTo(gx, E.H);
    }
    for (let gy = 0; gy <= E.H; gy += g) {
      c.moveTo(0, gy);
      c.lineTo(E.W, gy);
    }
    c.stroke();
    c.restore();
  }

  // 2. Bunker outer frame
  c.save();
  c.strokeStyle = 'rgba(87, 183, 163, 0.45)';
  c.lineWidth = lw;
  c.strokeRect(0, 0, E.W, E.H);
  c.restore();

  // 3. Unselected element outlines when guides enabled
  if (state.showGuides) {
    E.LAYOUT.elements.forEach(el => {
      if (!el.visible || el.id === state.selectedId) return;
      c.save();
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      if (el.rot) {
        c.translate(cx, cy);
        c.rotate((el.rot * Math.PI) / 180);
        c.translate(-cx, -cy);
      }
      E.shapePath(c, el);
      c.setLineDash([6 * invS, 5 * invS]);
      c.strokeStyle = el.action !== 'none' ? 'rgba(232, 163, 61, 0.48)' : 'rgba(87, 183, 163, 0.42)';
      c.lineWidth = 1.2 * invS;
      c.stroke();
      c.setLineDash([]);
      // Compact label pill
      const fontSize = Math.max(10, Math.round(11 * invS));
      c.font = `600 ${fontSize}px "IBM Plex Mono", monospace`;
      const txt = el.name;
      const tw = c.measureText(txt).width;
      c.fillStyle = 'rgba(12, 14, 12, 0.72)';
      c.fillRect(el.x, el.y - fontSize - 5 * invS, tw + 8 * invS, fontSize + 4 * invS);
      c.fillStyle = el.action !== 'none' ? '#e8a33d' : '#57b7a3';
      c.fillText(txt, el.x + 4 * invS, el.y - 4 * invS);
      c.restore();
    });
  }

  // 4. Smart alignment guides during drag
  if (state.smartGuides.length) {
    c.save();
    c.strokeStyle = 'rgba(87, 183, 163, 0.9)';
    c.lineWidth = 1.5 * invS;
    c.setLineDash([5 * invS, 4 * invS]);
    state.smartGuides.forEach(g => {
      c.beginPath();
      if (g.type === 'x') {
        c.moveTo(g.val, 0);
        c.lineTo(g.val, E.H);
      } else {
        c.moveTo(0, g.val);
        c.lineTo(E.W, g.val);
      }
      c.stroke();
    });
    c.restore();
  }

  // 5. Selected element Gizmo (shape + bounding box + 8 handles + rotate + polygon vertices)
  const sel = selectedEl();
  if (sel) {
    c.save();
    const cx = sel.x + sel.w / 2;
    const cy = sel.y + sel.h / 2;

    c.save();
    if (sel.rot) {
      c.translate(cx, cy);
      c.rotate((sel.rot * Math.PI) / 180);
      c.translate(-cx, -cy);
    }

    // Bounding box
    c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    c.lineWidth = 1 * invS;
    c.setLineDash([4 * invS, 4 * invS]);
    c.strokeRect(sel.x, sel.y, sel.w, sel.h);
    c.setLineDash([]);

    // Actual shape highlight
    E.shapePath(c, sel);
    c.strokeStyle = '#e8a33d';
    c.lineWidth = 2.2 * invS;
    c.stroke();

    // Rotate stem
    const rotDist = (isTouchUI() ? 42 : 34) * invS;
    c.beginPath();
    c.moveTo(cx, sel.y);
    c.lineTo(cx, sel.y - rotDist);
    c.strokeStyle = '#e8a33d';
    c.lineWidth = 1.6 * invS;
    c.stroke();
    c.restore();

    // Box handles
    const hs = (isTouchUI() ? 8.2 : 5.5) * invS;
    getHandlesWorld(sel).forEach(h => {
      c.save();
      if (h.key === 'rot') {
        c.fillStyle = '#57b7a3';
        c.strokeStyle = '#0a0c0a';
        c.lineWidth = 1.6 * invS;
        c.beginPath();
        c.arc(h.x, h.y, hs * 1.15, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else if (h.key === 'rad') {
        c.translate(h.x, h.y);
        c.rotate(Math.PI / 4);
        c.fillStyle = '#5aa9c9';
        c.strokeStyle = '#0a0c0a';
        c.lineWidth = 1.5 * invS;
        c.fillRect(-hs * 0.9, -hs * 0.9, hs * 1.8, hs * 1.8);
        c.strokeRect(-hs * 0.9, -hs * 0.9, hs * 1.8, hs * 1.8);
      } else {
        c.fillStyle = '#e8a33d';
        c.strokeStyle = '#0a0c0a';
        c.lineWidth = 1.5 * invS;
        c.fillRect(h.x - hs, h.y - hs, hs * 2, hs * 2);
        c.strokeRect(h.x - hs, h.y - hs, hs * 2, hs * 2);
      }
      c.restore();
    });

    // Polygon vertices & midpoint "+" handles
    if (sel.shape === 'polygon') {
      const verts = getPolyVerticesWorld(sel);
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        // Midpoint add vertex dot
        c.save();
        c.fillStyle = 'rgba(87, 183, 163, 0.85)';
        c.strokeStyle = '#0a0c0a';
        c.lineWidth = 1.2 * invS;
        c.beginPath();
        c.arc(mx, my, hs * 0.8, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.restore();
      }
      verts.forEach((v, i) => {
        c.save();
        const isSelV = state.selectedVertex === i;
        c.fillStyle = isSelV ? '#fff' : '#57b7a3';
        c.strokeStyle = '#0a0c0a';
        c.lineWidth = 1.8 * invS;
        c.beginPath();
        c.arc(v.x, v.y, hs * 1.15, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.restore();
      });
    }
    c.restore();
  }
}

/* ---------- Canvas Pointer, Multi-Touch & Wheel Input ---------- */
function startPinchInteract() {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return;
  const [p1, p2] = pts;
  const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  const rect = E.cv.getBoundingClientRect();
  const midX = (p1.x + p2.x) / 2 - rect.left;
  const midY = (p1.y + p2.y) / 2 - rect.top;
  state.smartGuides = [];
  state.interact = {
    mode: 'pinch',
    startDist: dist,
    startZoom: state.zoom,
    worldMidX: (midX - E.view.ox) / E.view.s,
    worldMidY: (midY - E.view.oy) / E.view.s
  };
}

function onPointerDown(e) {
  if (!state.active || !E) return;
  if (e.pointerType === 'touch') state.lastTouch = true;
  else if (e.pointerType === 'mouse') state.lastTouch = false;

  if (e.pointerId !== undefined) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  }

  // Two-finger pinch-to-zoom & pan
  if (activePointers.size >= 2) {
    if (state.interact && state.interact.mode !== 'pinch' && state.interact.mode !== 'pan' && state.interact.pushed) {
      E.saveLayout();
    }
    startPinchInteract();
    return;
  }

  if (state.interact && state.interact.mode === 'pinch-cooldown') return;

  const p = E.canvasPos(e);
  const sel = selectedEl();
  const isTouch = e.pointerType === 'touch';

  // Pan mode: pan tool, spacebar, or middle mouse button
  if (state.tool === 'pan' || state.spaceDown || e.button === 1) {
    state.interact = {
      mode: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      origPanX: state.panX,
      origPanY: state.panY
    };
    return;
  }

  // Check selected element handles first
  if (sel && !sel.locked) {
    const hit = hitHandle(sel, p.x, p.y, isTouch);
    if (hit) {
      pushUndo();
      if (hit.type === 'vertex') {
        state.selectedVertex = hit.idx;
        const verts = getPolyVerticesWorld(sel);
        state.interact = {
          mode: 'vertex',
          idx: hit.idx,
          startPts: cloneElements(sel.points),
          origV: verts[hit.idx]
        };
        renderInspector();
        return;
      }
      if (hit.type === 'midpoint') {
        const pts = cloneElements(sel.points);
        const a = pts[hit.idx];
        const b = pts[(hit.idx + 1) % pts.length];
        pts.splice(hit.idx + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        sel.points = pts;
        state.selectedVertex = hit.idx + 1;
        state.interact = {
          mode: 'vertex',
          idx: hit.idx + 1,
          startPts: cloneElements(sel.points)
        };
        E.saveLayout();
        renderInspector();
        return;
      }
      if (hit.type === 'box') {
        if (hit.key === 'rot') {
          const cx = sel.x + sel.w / 2;
          const cy = sel.y + sel.h / 2;
          state.interact = {
            mode: 'rotate',
            cx,
            cy,
            startAng: Math.atan2(p.y - cy, p.x - cx),
            origRot: sel.rot || 0
          };
          return;
        }
        if (hit.key === 'rad') {
          state.interact = {
            mode: 'radius',
            origRadius: sel.radius || 0,
            startP: p
          };
          return;
        }
        state.interact = {
          mode: 'resize',
          key: hit.key,
          orig: { x: sel.x, y: sel.y, w: sel.w, h: sel.h, rot: sel.rot || 0 },
          startLocal: toLocal(sel, p.x, p.y)
        };
        return;
      }
    }
  }

  // Hit-test elements top-to-bottom (with touch padding fallback for small elements)
  const els = E.LAYOUT.elements;
  let found = null;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (!el.visible) continue;
    if (E.elementHitTest(el, p.x, p.y)) {
      found = el;
      break;
    }
  }
  if (!found && isTouch) {
    const pad = 16 / Math.max(0.25, E.view.s);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (!el.visible) continue;
      const lp = toLocal(el, p.x, p.y);
      if (lp.x >= el.x - pad && lp.x <= el.x + el.w + pad && lp.y >= el.y - pad && lp.y <= el.y + el.h + pad) {
        found = el;
        break;
      }
    }
  }

  if (found) {
    state.selectedId = found.id;
    state.selectedVertex = -1;
    if (!found.locked && state.tool !== 'pan') {
      state.interact = {
        mode: 'move',
        pushed: false,
        sx: p.x,
        sy: p.y,
        sxScreen: e.clientX,
        syScreen: e.clientY,
        isTouch,
        origX: found.x,
        origY: found.y
      };
    }
    renderAllUI();
  } else {
    state.selectedId = null;
    state.selectedVertex = -1;
    state.nudgePadOpen = false;
    // Drag on empty background pans cleanly
    state.interact = {
      mode: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      origPanX: state.panX,
      origPanY: state.panY
    };
    renderAllUI();
  }
}

function onPointerMove(e) {
  if (!state.active || !E) return;
  if (e.pointerId !== undefined && activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  }

  const it = state.interact;
  if (it && it.mode === 'pinch') {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const dist = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const newZoom = Math.max(0.18, Math.min(4.0, it.startZoom * (dist / it.startDist)));
    const rect = E.cv.getBoundingClientRect();
    const curMidX = (p1.x + p2.x) / 2 - rect.left;
    const curMidY = (p1.y + p2.y) / 2 - rect.top;
    const baseOx = (rect.width - E.W * newZoom) / 2;
    const baseOy = (rect.height - E.H * newZoom) / 2;
    state.zoom = newZoom;
    state.panX = curMidX - baseOx - it.worldMidX * newZoom;
    state.panY = curMidY - baseOy - it.worldMidY * newZoom;
    E.computeView();
    updateZoomLabel();
    return;
  }

  if (activePointers.size > 1) return;
  if (it && it.mode === 'pinch-cooldown') return;

  const p = E.canvasPos(e);
  if (!it) {
    // Update hover cursor (mouse)
    const sel = selectedEl();
    if (state.tool === 'pan' || state.spaceDown) {
      E.cv.style.cursor = 'grab';
      return;
    }
    if (sel && !sel.locked) {
      const h = hitHandle(sel, p.x, p.y, e.pointerType === 'touch');
      if (h) {
        if (h.type === 'vertex' || h.type === 'midpoint') E.cv.style.cursor = 'crosshair';
        else if (h.key === 'rot') E.cv.style.cursor = 'grab';
        else if (h.key === 'n' || h.key === 's') E.cv.style.cursor = 'ns-resize';
        else if (h.key === 'e' || h.key === 'w') E.cv.style.cursor = 'ew-resize';
        else if (h.key === 'nw' || h.key === 'se') E.cv.style.cursor = 'nwse-resize';
        else if (h.key === 'ne' || h.key === 'sw') E.cv.style.cursor = 'nesw-resize';
        else E.cv.style.cursor = 'pointer';
        return;
      }
    }
    const els = E.LAYOUT.elements;
    let over = false;
    for (let i = els.length - 1; i >= 0; i--) {
      if (els[i].visible && E.elementHitTest(els[i], p.x, p.y)) {
        over = true;
        break;
      }
    }
    E.cv.style.cursor = over ? 'move' : 'default';
    return;
  }

  if (it.mode === 'pan') {
    state.panX = it.origPanX + (e.clientX - it.sx);
    state.panY = it.origPanY + (e.clientY - it.sy);
    E.computeView();
    return;
  }

  const sel = selectedEl();
  if (!sel) return;

  if (it.mode === 'move') {
    const dead = it.isTouch ? 7 : 3;
    if (!it.pushed && Math.hypot(e.clientX - it.sxScreen, e.clientY - it.syScreen) > dead) {
      pushUndo();
      it.pushed = true;
    }
    if (!it.pushed) return;

    const dx = p.x - it.sx;
    const dy = p.y - it.sy;
    let nx = it.origX + dx;
    let ny = it.origY + dy;

    // Smart alignment guides against bunker center & sibling elements
    state.smartGuides = [];
    const scx = nx + sel.w / 2;
    const scy = ny + sel.h / 2;
    const guideTol = 6 / Math.max(0.3, E.view.s);
    let snappedX = false;
    let snappedY = false;

    if (Math.abs(scx - E.W / 2) < guideTol) {
      nx = E.W / 2 - sel.w / 2;
      state.smartGuides.push({ type: 'x', val: E.W / 2 });
      snappedX = true;
    }
    if (Math.abs(scy - E.H / 2) < guideTol) {
      ny = E.H / 2 - sel.h / 2;
      state.smartGuides.push({ type: 'y', val: E.H / 2 });
      snappedY = true;
    }

    if (!snappedX || !snappedY) {
      for (const other of E.LAYOUT.elements) {
        if (!other.visible || other.id === sel.id) continue;
        const ocx = other.x + other.w / 2;
        const ocy = other.y + other.h / 2;
        if (!snappedX) {
          if (Math.abs(scx - ocx) < guideTol) {
            nx = ocx - sel.w / 2;
            state.smartGuides.push({ type: 'x', val: ocx });
            snappedX = true;
          } else if (Math.abs(nx - other.x) < guideTol) {
            nx = other.x;
            state.smartGuides.push({ type: 'x', val: other.x });
            snappedX = true;
          }
        }
        if (!snappedY) {
          if (Math.abs(scy - ocy) < guideTol) {
            ny = ocy - sel.h / 2;
            state.smartGuides.push({ type: 'y', val: ocy });
            snappedY = true;
          } else if (Math.abs(ny - other.y) < guideTol) {
            ny = other.y;
            state.smartGuides.push({ type: 'y', val: other.y });
            snappedY = true;
          }
        }
        if (snappedX && snappedY) break;
      }
    }

    sel.x = snappedX ? Math.round(nx) : snapVal(nx);
    sel.y = snappedY ? Math.round(ny) : snapVal(ny);
    syncInspectorCoords(sel);
    updateStatusBar();
    return;
  }

  if (it.mode === 'rotate') {
    const ang = Math.atan2(p.y - it.cy, p.x - it.cx);
    let deg = it.origRot + ((ang - it.startAng) * 180) / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    sel.rot = Math.round(deg);
    syncInspectorCoords(sel);
    updateStatusBar();
    return;
  }

  if (it.mode === 'radius') {
    const lp = toLocal(sel, p.x, p.y);
    const maxR = Math.min(sel.w / 2, sel.h / 2);
    const rx = Math.max(0, lp.x - sel.x);
    const ry = Math.max(0, lp.y - sel.y);
    sel.radius = Math.round(Math.min(maxR, Math.max(rx, ry)));
    syncInspectorCoords(sel);
    return;
  }

  if (it.mode === 'resize') {
    const o = it.orig;
    const lp = toLocal({ x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot }, p.x, p.y);
    const dx = lp.x - it.startLocal.x;
    const dy = lp.y - it.startLocal.y;
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    const k = it.key;
    if (k.includes('w')) x1 = Math.min(x2 - 12, o.x + dx);
    if (k.includes('e')) x2 = Math.max(x1 + 12, o.x + o.w + dx);
    if (k.includes('n')) y1 = Math.min(y2 - 12, o.y + dy);
    if (k.includes('s')) y2 = Math.max(y1 + 12, o.y + o.h + dy);

    if (state.snapGrid && !e.altKey) {
      if (k.includes('w')) x1 = Math.min(x2 - 12, snapVal(x1));
      if (k.includes('e')) x2 = Math.max(x1 + 12, snapVal(x2));
      if (k.includes('n')) y1 = Math.min(y2 - 12, snapVal(y1));
      if (k.includes('s')) y2 = Math.max(y1 + 12, snapVal(y2));
    }

    let nw = x2 - x1;
    let nh = y2 - y1;
    if (e.shiftKey || state.keepAspect) {
      const ratio = o.w / Math.max(1, o.h);
      if (k === 'n' || k === 's') {
        nw = nh * ratio;
        const midX = (x1 + x2) / 2;
        x1 = midX - nw / 2;
        x2 = midX + nw / 2;
      } else if (k === 'e' || k === 'w') {
        nh = nw / ratio;
        const midY = (y1 + y2) / 2;
        y1 = midY - nh / 2;
        y2 = midY + nh / 2;
      } else {
        if (nw / Math.max(1, nh) > ratio) nh = nw / ratio;
        else nw = nh * ratio;
        if (k.includes('w')) x1 = x2 - nw;
        else x2 = x1 + nw;
        if (k.includes('n')) y1 = y2 - nh;
        else y2 = y1 + nh;
      }
    }

    // Keep opposite anchor point fixed in world space when rotated
    const oldCx = o.x + o.w / 2;
    const oldCy = o.y + o.h / 2;
    const newLocalCx = x1 + nw / 2;
    const newLocalCy = y1 + nh / 2;
    const r = (o.rot * Math.PI) / 180;
    const cdx = newLocalCx - oldCx;
    const cdy = newLocalCy - oldCy;
    const wCx = oldCx + cdx * Math.cos(r) - cdy * Math.sin(r);
    const wCy = oldCy + cdx * Math.sin(r) + cdy * Math.cos(r);

    sel.w = Math.round(nw);
    sel.h = Math.round(nh);
    sel.x = Math.round(wCx - sel.w / 2);
    sel.y = Math.round(wCy - sel.h / 2);
    syncInspectorCoords(sel);
    updateStatusBar();
    return;
  }

  if (it.mode === 'vertex') {
    const lp = toLocal(sel, p.x, p.y);
    const sx = state.snapGrid && !e.altKey ? snapVal(lp.x) : lp.x;
    const sy = state.snapGrid && !e.altKey ? snapVal(lp.y) : lp.y;
    const nx = (sx - sel.x) / Math.max(1, sel.w);
    const ny = (sy - sel.y) / Math.max(1, sel.h);
    sel.points[it.idx] = [Number(nx.toFixed(4)), Number(ny.toFixed(4))];
    syncInspectorVertices(sel);
    updateStatusBar();
  }
}

function onPointerUp(e) {
  if (e && e.pointerId !== undefined) {
    if (!activePointers.has(e.pointerId) && !state.interact) return;
    activePointers.delete(e.pointerId);
  }
  if (!state.active || !E) return;
  const it = state.interact;
  state.smartGuides = [];

  if (it && (it.mode === 'pinch' || it.mode === 'pinch-cooldown')) {
    state.interact = activePointers.size > 0 ? { mode: 'pinch-cooldown' } : null;
    return;
  }

  state.interact = null;
  if (!it) return;

  if (it.mode === 'move' && !it.pushed) {
    updateStatusBar();
    return;
  }

  const sel = selectedEl();
  if (sel && it.mode === 'vertex') {
    normalizePolygonToBounds(sel);
    renderInspector();
  }
  if (it.mode !== 'pan') {
    E.saveLayout();
    renderLayers();
    updateStatusBar();
  }
}

function onWheel(e) {
  if (!state.active || !E) return;
  e.preventDefault();
  const rect = E.cv.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const wx = (sx - E.view.ox) / E.view.s;
  const wy = (sy - E.view.oy) / E.view.s;

  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const newZoom = Math.max(0.18, Math.min(4.0, state.zoom * factor));
  state.zoom = newZoom;
  // Adjust pan so world point under mouse stays pinned
  const baseOx = (rect.width - E.W * newZoom) / 2;
  const baseOy = (rect.height - E.H * newZoom) / 2;
  state.panX = sx - baseOx - wx * newZoom;
  state.panY = sy - baseOy - wy * newZoom;
  E.computeView();
  updateZoomLabel();
}

function onKeyDown(e) {
  if (!state.active || !E) return;
  const tag = (e.target && e.target.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.code === 'Space' && !typing) {
    state.spaceDown = true;
    E.cv.style.cursor = 'grab';
    e.preventDefault();
    return;
  }

  if (typing) {
    if (e.code === 'Escape') e.target.blur();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
    e.preventDefault();
    duplicateSelected();
    return;
  }

  if (e.code === 'KeyV') { setTool('select'); return; }
  if (e.code === 'KeyP') { setTool('poly'); return; }
  if (e.code === 'KeyH') { setTool('pan'); return; }
  if (e.code === 'Escape') {
    if (state.modalOpen) closeSpriteModal();
    else if (state.selectedId) { state.selectedId = null; renderAllUI(); }
    else E.closeEditor();
    return;
  }

  const sel = selectedEl();
  if (!sel) return;

  if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault();
    removeOrHideSelected();
    return;
  }

  const step = e.shiftKey ? 10 : 1;
  if (e.code === 'ArrowLeft') { e.preventDefault(); pushUndo(); sel.x -= step; commitMove(sel); }
  if (e.code === 'ArrowRight') { e.preventDefault(); pushUndo(); sel.x += step; commitMove(sel); }
  if (e.code === 'ArrowUp') { e.preventDefault(); pushUndo(); sel.y -= step; commitMove(sel); }
  if (e.code === 'ArrowDown') { e.preventDefault(); pushUndo(); sel.y += step; commitMove(sel); }
}

function onKeyUp(e) {
  if (e.code === 'Space') {
    state.spaceDown = false;
    if (state.active && E) E.cv.style.cursor = '';
  }
}

function commitMove(sel) {
  E.saveLayout();
  syncInspectorCoords(sel);
  updateStatusBar();
}

function setTool(t) {
  state.tool = t;
  if (t === 'poly') {
    const sel = selectedEl();
    if (sel && sel.shape !== 'polygon') {
      pushUndo();
      setElementShape(sel, 'polygon');
      E.saveLayout();
      renderInspector();
    }
  }
  updateToolbarButtons();
}

function fitEditorView() {
  if (!E) return;
  const r = document.getElementById('stage').getBoundingClientRect();
  const mob = r.width <= 900;
  const topPad = mob ? 56 : 58;
  const botPad = mob ? 88 : 46;
  const sidePad = (!mob && state.leftOpen ? 280 : 12) + (!mob && state.rightOpen ? 320 : 12);
  const availW = Math.max(180, r.width - sidePad);
  const availH = Math.max(180, r.height - topPad - botPad);
  state.zoom = Math.min(availW / E.W, availH / E.H);
  state.panX = !mob ? (state.leftOpen ? 140 : 0) - (state.rightOpen ? 160 : 0) : 0;
  state.panY = mob ? -16 : 20;
  E.computeView();
  updateZoomLabel();
}

/* ---------- Shape Presets & Sprite Alpha Silhouette ---------- */
function makeShapePresetPoints(kind) {
  if (kind === 'triangle') return [[0.5, 0], [1, 1], [0, 1]];
  if (kind === 'diamond') return [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
  if (kind === 'trapezoid') return [[0.15, 0], [0.85, 0], [1, 1], [0, 1]];
  if (kind === 'hexagon') {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      pts.push([Number((0.5 + 0.5 * Math.cos(a)).toFixed(4)), Number((0.5 + 0.5 * Math.sin(a)).toFixed(4))]);
    }
    return pts;
  }
  if (kind === 'octagon') {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      pts.push([Number((0.5 + 0.5 * Math.cos(a)).toFixed(4)), Number((0.5 + 0.5 * Math.sin(a)).toFixed(4))]);
    }
    return pts;
  }
  return [[0, 0], [1, 0], [1, 1], [0, 1]];
}

function setElementShape(el, shape) {
  el.shape = shape;
  if (shape === 'roundrect' && !el.radius) el.radius = 12;
  if (shape === 'polygon' && (!Array.isArray(el.points) || el.points.length < 3)) {
    el.points = makeShapePresetPoints('rect');
  }
  if (shape !== 'rect' && (el.renderMode === 'sprite' || el.renderMode === 'both')) {
    el.clipToShape = true;
  }
}

function detectSpriteSilhouette(el) {
  if (!el || !el.spriteId) {
    E.toast('Asigna primero un sprite para detectar su silueta.', 'bad');
    return;
  }
  const img = E.getSpriteImage(el.spriteId);
  if (!img || !(img.naturalWidth || img.width)) {
    E.toast('El sprite aún está cargando.', 'bad');
    return;
  }
  const c = document.createElement('canvas');
  const S = 96;
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const crop = el.spriteCrop || { x: 0, y: 0, w: iw, h: ih };
  g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, S, S);
  const data = g.getImageData(0, 0, S, S).data;

  // Sample radial boundary from center in 12 sectors
  const N = 12;
  const cx = S / 2;
  const cy = S / 2;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let maxR = 0;
    for (let r = S * 0.5; r >= 2; r -= 1) {
      const px = Math.round(cx + dx * r);
      const py = Math.round(cy + dy * r);
      if (px >= 0 && px < S && py >= 0 && py < S) {
        const a = data[(py * S + px) * 4 + 3];
        if (a > 24) {
          maxR = r + 1.5;
          break;
        }
      }
    }
    if (maxR > 0) {
      const nx = Math.max(0, Math.min(1, (cx + dx * maxR) / S));
      const ny = Math.max(0, Math.min(1, (cy + dy * maxR) / S));
      pts.push([Number(nx.toFixed(3)), Number(ny.toFixed(3))]);
    }
  }
  if (pts.length < 3) {
    E.toast('No se detectó contorno transparente en el sprite.', 'bad');
    return;
  }
  pushUndo();
  el.shape = 'polygon';
  el.points = pts;
  E.saveLayout();
  renderInspector();
  E.toast('Silueta poligonal generada desde el sprite (' + pts.length + ' vértices).', 'good');
  E.sfx.ok();
}

/* ---------- Element CRUD ---------- */
function addNewElement(kind) {
  if (!E) return;
  pushUndo();
  const id = 'el_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 999);
  const rect = E.cv.getBoundingClientRect();
  const cx = Math.round((rect.width / 2 - E.view.ox) / E.view.s);
  const cy = Math.round((rect.height / 2 - E.view.oy) / E.view.s);
  const wx = Math.max(40, Math.min(E.W - 160, cx - 64));
  const wy = Math.max(40, Math.min(E.H - 160, cy - 64));

  let el;
  if (kind === 'sprite') {
    const customs = E.SPRITE_LIB.listCustom();
    const firstSprite = customs.length ? customs[0].id : 'preset:can';
    el = {
      id,
      name: 'Sprite nuevo',
      category: 'sprite',
      builtin: false,
      visible: true,
      locked: false,
      x: wx,
      y: wy,
      w: 120,
      h: 120,
      rot: 0,
      opacity: 1,
      shape: 'rect',
      radius: 12,
      points: [[0, 0], [1, 0], [1, 1], [0, 1]],
      renderMode: 'sprite',
      spriteId: firstSprite,
      spriteCrop: null,
      spriteFit: 'contain',
      flipX: false,
      flipY: false,
      clipToShape: true,
      anim: 'none',
      animSpeed: 1,
      fillColor: 'rgba(232,163,61,0.2)',
      strokeColor: '#e8a33d',
      strokeWidth: 0,
      backdropColor: '',
      action: 'none',
      customMsg: '',
      marker: false,
      nativeKind: ''
    };
  } else if (kind === 'zone') {
    el = {
      id,
      name: 'Zona interactiva',
      category: 'interactive',
      builtin: false,
      visible: true,
      locked: false,
      x: wx,
      y: wy,
      w: 150,
      h: 120,
      rot: 0,
      opacity: 1,
      shape: 'rect',
      radius: 10,
      points: [[0, 0], [1, 0], [1, 1], [0, 1]],
      renderMode: 'none',
      spriteId: '',
      spriteCrop: null,
      spriteFit: 'contain',
      flipX: false,
      flipY: false,
      clipToShape: true,
      anim: 'none',
      animSpeed: 1,
      fillColor: 'rgba(232,163,61,0.22)',
      strokeColor: '#e8a33d',
      strokeWidth: 2,
      backdropColor: '',
      action: 'toast',
      customMsg: 'Elemento del búnker inspeccionado.',
      marker: true,
      nativeKind: ''
    };
  } else {
    el = {
      id,
      name: 'Forma / Máscara',
      category: 'visual',
      builtin: false,
      visible: true,
      locked: false,
      x: wx,
      y: wy,
      w: 130,
      h: 130,
      rot: 0,
      opacity: 0.9,
      shape: 'circle',
      radius: 16,
      points: [[0, 0], [1, 0], [1, 1], [0, 1]],
      renderMode: 'shape',
      spriteId: '',
      spriteCrop: null,
      spriteFit: 'contain',
      flipX: false,
      flipY: false,
      clipToShape: true,
      anim: 'none',
      animSpeed: 1,
      fillColor: 'rgba(87,183,163,0.28)',
      strokeColor: '#57b7a3',
      strokeWidth: 3,
      backdropColor: '',
      action: 'none',
      customMsg: '',
      marker: false,
      nativeKind: ''
    };
  }

  E.LAYOUT.elements.push(el);
  state.selectedId = el.id;
  state.selectedVertex = -1;
  if (isMobileViewport()) {
    state.leftOpen = false;
    state.rightOpen = false;
  }
  E.saveLayout();
  renderAllUI();
  E.sfx.ok();
  if (kind === 'sprite') openSpriteModal(el.id);
}

function duplicateSelected() {
  const sel = selectedEl();
  if (!sel || !E) return;
  pushUndo();
  const copy = JSON.parse(JSON.stringify(sel));
  copy.id = 'el_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 999);
  copy.name = sel.name + ' (copia)';
  copy.builtin = false;
  if (copy.renderMode === 'default') copy.renderMode = copy.spriteId ? 'sprite' : 'shape';
  copy.nativeKind = '';
  copy.x += 24;
  copy.y += 24;
  const idx = E.LAYOUT.elements.indexOf(sel);
  E.LAYOUT.elements.splice(idx + 1, 0, copy);
  state.selectedId = copy.id;
  E.saveLayout();
  renderAllUI();
  E.sfx.click();
}

function removeOrHideSelected(forceHideOnly) {
  const sel = selectedEl();
  if (!sel || !E) return;
  pushUndo();
  if (sel.builtin || forceHideOnly) {
    sel.visible = !sel.visible;
    E.toast(sel.visible ? `<b>${esc(sel.name)}</b> puesto en la escena.` : `<b>${esc(sel.name)}</b> quitado de la escena (puedes restaurarlo en "Ocultos").`);
  } else {
    const idx = E.LAYOUT.elements.indexOf(sel);
    if (idx >= 0) E.LAYOUT.elements.splice(idx, 1);
    state.selectedId = null;
    E.toast(`<b>${esc(sel.name)}</b> eliminado.`);
  }
  E.saveLayout();
  renderAllUI();
  E.sfx.click();
}

function moveLayer(el, dir) {
  if (!el || !E) return;
  const els = E.LAYOUT.elements;
  const i = els.indexOf(el);
  if (i < 0) return;
  pushUndo();
  if (dir === 'up' && i < els.length - 1) {
    [els[i], els[i + 1]] = [els[i + 1], els[i]];
  } else if (dir === 'down' && i > 0) {
    [els[i], els[i - 1]] = [els[i - 1], els[i]];
  } else if (dir === 'top') {
    els.splice(i, 1);
    els.push(el);
  } else if (dir === 'bottom') {
    els.splice(i, 1);
    els.unshift(el);
  }
  E.saveLayout();
  renderLayers();
}

/* ---------- DOM Construction ---------- */
function buildEditorDOM() {
  if (root) return;
  root = document.getElementById('admin-editor-root');
  root.innerHTML = `
    <div class="ed-top">
      <div class="ed-brand">✎<span class="ed-brand-txt"> EDITOR ADMIN</span></div>
      <div class="ed-group">
        <button type="button" class="ed-btn on" id="ed-t-select" title="Seleccionar, mover y redimensionar (V)">↖ Mover</button>
        <button type="button" class="ed-btn" id="ed-t-poly" title="Editar vértices de polígono (P)">⬠ Vértices</button>
        <button type="button" class="ed-btn" id="ed-t-pan" title="Desplazar vista (H o Espacio)">✋ Vista</button>
      </div>
      <div class="ed-group">
        <button type="button" class="ed-btn" id="ed-undo" title="Deshacer (Ctrl+Z)">↶</button>
        <button type="button" class="ed-btn" id="ed-redo" title="Rehacer (Ctrl+Y)">↷</button>
        <button type="button" class="ed-btn" id="ed-sprites-btn" title="Abrir biblioteca de sprites y recortador">📦 Sprites</button>
      </div>
      <div class="ed-group">
        <button type="button" class="ed-btn" id="ed-z-out" title="Alejar">－</button>
        <span class="ed-zoom-lbl" id="ed-z-lbl">100%</span>
        <button type="button" class="ed-btn" id="ed-z-in" title="Acercar">＋</button>
        <button type="button" class="ed-btn" id="ed-z-fit" title="Encajar todo el búnker">Encajar</button>
      </div>
      <div class="ed-group">
        <button type="button" class="ed-btn" id="ed-grid" title="Mostrar rejilla"># Rejilla</button>
        <button type="button" class="ed-btn on" id="ed-snap" title="Ajustar a rejilla">🧲 Ajuste</button>
        <button type="button" class="ed-btn teal on" id="ed-guides" title="Mostrar contornos de zonas">👁 Guías</button>
        <button type="button" class="ed-btn" id="ed-dark" title="Previsualizar búnker a oscuras">🌙 Luz</button>
      </div>
      <div class="ed-group">
        <button type="button" class="ed-btn" id="ed-export" title="Exportar diseño JSON">⤓ JSON</button>
        <button type="button" class="ed-btn" id="ed-import" title="Importar diseño JSON">⤒ Importar</button>
        <button type="button" class="ed-btn danger" id="ed-reset" title="Restaurar elementos originales">↺ Restaurar</button>
        <button type="button" class="ed-btn primary" id="ed-exit" title="Guardar y volver al juego">▶ Jugar</button>
      </div>
    </div>

    <div class="ed-sheet-backdrop" id="ed-sheet-backdrop" hidden></div>

    <button type="button" class="ed-btn ed-panel-toggle left" id="ed-open-left" hidden>☰ Capas</button>
    <button type="button" class="ed-btn ed-panel-toggle right" id="ed-open-right" hidden>⚙ Propiedades</button>

    <aside class="ed-panel left" id="ed-panel-left">
      <div class="ed-panel-head">
        <h3>ELEMENTOS / CAPAS</h3>
        <div style="display:flex;gap:5px;align-items:center">
          <button type="button" class="ed-btn" id="ed-left-to-right" hidden style="min-height:34px;padding:4px 9px">⚙ Props</button>
          <button type="button" class="ed-icon-btn" id="ed-close-left" title="Ocultar panel">◀</button>
        </div>
      </div>
      <div class="ed-panel-body">
        <div class="ed-add-row">
          <button type="button" class="ed-btn primary" id="ed-add-sprite">+ Sprite</button>
          <button type="button" class="ed-btn" id="ed-add-zone">+ Zona</button>
          <button type="button" class="ed-btn" id="ed-add-shape">+ Forma</button>
        </div>
        <input type="search" class="ed-search" id="ed-search" placeholder="Buscar elemento…" />
        <div class="ed-tabs" id="ed-tabs">
          <button type="button" class="ed-tab on" data-tab="all">Todos</button>
          <button type="button" class="ed-tab" data-tab="sprite">Sprites</button>
          <button type="button" class="ed-tab" data-tab="interactive">Zonas</button>
          <button type="button" class="ed-tab" data-tab="hidden">Quitados</button>
        </div>
        <div class="ed-layer-list" id="ed-layer-list"></div>
      </div>
    </aside>

    <aside class="ed-panel right" id="ed-panel-right">
      <div class="ed-panel-head">
        <h3>PROPIEDADES</h3>
        <div style="display:flex;gap:5px;align-items:center">
          <button type="button" class="ed-btn" id="ed-right-to-left" hidden style="min-height:34px;padding:4px 9px">☰ Capas</button>
          <button type="button" class="ed-icon-btn" id="ed-close-right" title="Ocultar panel">▶</button>
        </div>
      </div>
      <div class="ed-panel-body" id="ed-inspector"></div>
    </aside>

    <div class="ed-statusbar" id="ed-statusbar"></div>
    <div class="ed-mob-nudge" id="ed-mob-nudge" hidden></div>
    <div class="ed-mob-dock" id="ed-mob-dock"></div>

    <div class="ed-modal-bg" id="ed-modal-bg" hidden>
      <div class="ed-modal" role="dialog" aria-modal="true" aria-label="Biblioteca y recortador de sprites">
        <div class="ed-modal-head">
          <h2>BIBLIOTECA DE SPRITES Y RECORTADOR</h2>
          <button type="button" class="ed-icon-btn" id="ed-modal-close" style="font-size:16px;width:30px;height:30px">✕</button>
        </div>
        <div class="ed-modal-body">
          <div>
            <div class="ed-dropzone" id="ed-dropzone">
              <b>+ Subir sprite o spritesheet (PNG, WebP, JPG, SVG)</b><br>
              <small style="color:var(--dim)">Haz clic o arrastra imágenes aquí</small>
              <input type="file" id="ed-file-input" accept="image/*" multiple hidden />
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px">
              <input type="text" id="ed-url-input" class="ed-search" style="margin:0;flex:1" placeholder="O pega una URL / data:image..." />
              <button type="button" class="ed-btn" id="ed-url-add">Añadir URL</button>
            </div>
            <div class="ed-sec-title"><span>Tus sprites subidos</span></div>
            <div class="ed-sprite-grid" id="ed-custom-sprites" style="margin-bottom:12px"></div>
            <div class="ed-sec-title"><span>Sprites integrados del búnker</span></div>
            <div class="ed-sprite-grid" id="ed-preset-sprites"></div>
          </div>
          <div class="ed-slicer-wrap">
            <div class="ed-sec-title"><span>Vista previa y recorte (Spritesheet)</span></div>
            <div class="ed-slicer-stage">
              <canvas id="ed-slicer-cv" width="260" height="220"></canvas>
            </div>
            <label class="ed-check">
              <input type="checkbox" id="ed-slicer-on" /> Recortar frame de spritesheet
            </label>
            <div id="ed-slicer-controls" style="display:none">
              <div class="ed-grid2" style="margin-bottom:6px">
                <div class="ed-field"><label>Columnas</label><input type="number" id="ed-sl-cols" min="1" max="32" value="4" /></div>
                <div class="ed-field"><label>Filas</label><input type="number" id="ed-sl-rows" min="1" max="32" value="4" /></div>
              </div>
              <div class="ed-grid4" style="margin-bottom:6px">
                <div class="ed-field"><label>X</label><input type="number" id="ed-sl-x" min="0" value="0" /></div>
                <div class="ed-field"><label>Y</label><input type="number" id="ed-sl-y" min="0" value="0" /></div>
                <div class="ed-field"><label>W</label><input type="number" id="ed-sl-w" min="1" value="64" /></div>
                <div class="ed-field"><label>H</label><input type="number" id="ed-sl-h" min="1" value="64" /></div>
              </div>
              <small style="color:var(--dim);display:block;margin-bottom:6px">Haz clic en cualquier celda de la cuadrícula para seleccionarla.</small>
            </div>
            <div style="display:flex;gap:6px;margin-top:auto">
              <button type="button" class="ed-btn primary" id="ed-apply-sprite" style="flex:1;justify-content:center">Aplicar al elemento</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <input type="file" id="ed-import-file" accept=".json,application/json" hidden />
  `;

  bindEditorEvents();
}

function bindEditorEvents() {
  const g = id => document.getElementById(id);

  g('ed-t-select').addEventListener('click', () => setTool('select'));
  g('ed-t-poly').addEventListener('click', () => setTool('poly'));
  g('ed-t-pan').addEventListener('click', () => setTool('pan'));

  g('ed-z-out').addEventListener('click', () => {
    state.zoom = Math.max(0.18, state.zoom / 1.2);
    E.computeView();
    updateZoomLabel();
  });
  g('ed-z-in').addEventListener('click', () => {
    state.zoom = Math.min(4.0, state.zoom * 1.2);
    E.computeView();
    updateZoomLabel();
  });
  g('ed-z-fit').addEventListener('click', fitEditorView);

  g('ed-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    updateToolbarButtons();
  });
  g('ed-snap').addEventListener('click', () => {
    state.snapGrid = !state.snapGrid;
    updateToolbarButtons();
  });
  g('ed-guides').addEventListener('click', () => {
    state.showGuides = !state.showGuides;
    updateToolbarButtons();
  });
  g('ed-dark').addEventListener('click', () => {
    state.previewDark = !state.previewDark;
    updateToolbarButtons();
  });

  g('ed-undo').addEventListener('click', undo);
  g('ed-redo').addEventListener('click', redo);
  g('ed-sprites-btn').addEventListener('click', () => openSpriteModal(state.selectedId));
  g('ed-exit').addEventListener('click', () => E.closeEditor());

  g('ed-reset').addEventListener('click', () => {
    if (!g('ed-reset').dataset.armed) {
      g('ed-reset').dataset.armed = '1';
      g('ed-reset').textContent = '¿Confirmar restaurar?';
      setTimeout(() => {
        if (g('ed-reset')) {
          delete g('ed-reset').dataset.armed;
          g('ed-reset').textContent = '↺ Restaurar';
        }
      }, 3500);
      return;
    }
    delete g('ed-reset').dataset.armed;
    g('ed-reset').textContent = '↺ Restaurar';
    pushUndo();
    E.resetLayout();
    state.selectedId = null;
    renderAllUI();
    E.toast('Elementos restaurados a su configuración original.', 'good');
  });

  g('ed-export').addEventListener('click', () => {
    const json = JSON.stringify({ version: 1, elements: E.LAYOUT.elements }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ultimateday-layout.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    E.toast('Diseño exportado en JSON.', 'good');
  });

  g('ed-import').addEventListener('click', () => g('ed-import-file').click());
  g('ed-import-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.elements)) throw new Error('Formato inválido');
        pushUndo();
        E.importLayout(parsed.elements);
        state.selectedId = null;
        renderAllUI();
        E.toast('Diseño importado correctamente.', 'good');
      } catch (err) {
        E.toast('No se pudo importar el JSON: formato incorrecto.', 'bad');
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  // Side panel collapse/expand & mobile sheet switching
  g('ed-close-left').addEventListener('click', () => { state.leftOpen = false; syncPanelVisibility(); });
  g('ed-open-left').addEventListener('click', () => {
    state.leftOpen = true;
    if (isMobileViewport()) state.rightOpen = false;
    syncPanelVisibility();
  });
  g('ed-close-right').addEventListener('click', () => { state.rightOpen = false; syncPanelVisibility(); });
  g('ed-open-right').addEventListener('click', () => {
    state.rightOpen = true;
    if (isMobileViewport()) state.leftOpen = false;
    syncPanelVisibility();
  });
  g('ed-left-to-right').addEventListener('click', () => {
    state.leftOpen = false;
    state.rightOpen = true;
    syncPanelVisibility();
  });
  g('ed-right-to-left').addEventListener('click', () => {
    state.rightOpen = false;
    state.leftOpen = true;
    syncPanelVisibility();
  });
  g('ed-sheet-backdrop').addEventListener('click', () => {
    state.leftOpen = false;
    state.rightOpen = false;
    syncPanelVisibility();
  });

  // Add elements
  g('ed-add-sprite').addEventListener('click', () => addNewElement('sprite'));
  g('ed-add-zone').addEventListener('click', () => addNewElement('zone'));
  g('ed-add-shape').addEventListener('click', () => addNewElement('shape'));

  // Search & tabs
  g('ed-search').addEventListener('input', e => {
    state.search = e.target.value.trim().toLowerCase();
    renderLayers();
  });
  g('ed-tabs').addEventListener('click', e => {
    const b = e.target.closest('.ed-tab');
    if (!b) return;
    state.filterTab = b.dataset.tab;
    g('ed-tabs').querySelectorAll('.ed-tab').forEach(t => t.classList.toggle('on', t === b));
    renderLayers();
  });

  // Sprite modal events
  g('ed-modal-close').addEventListener('click', closeSpriteModal);
  g('ed-modal-bg').addEventListener('click', e => {
    if (e.target === g('ed-modal-bg')) closeSpriteModal();
  });

  const dz = g('ed-dropzone');
  const fi = g('ed-file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('over');
    if (e.dataTransfer && e.dataTransfer.files) handleUploadedFiles(e.dataTransfer.files);
  });
  fi.addEventListener('change', e => {
    if (e.target.files) handleUploadedFiles(e.target.files);
    e.target.value = '';
  });

  g('ed-url-add').addEventListener('click', () => {
    const url = g('ed-url-input').value.trim();
    if (!url) return;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      const sp = E.SPRITE_LIB.addCustom('Sprite URL', url, im.naturalWidth || 128, im.naturalHeight || 128);
      if (sp) {
        state.modalSpriteId = sp.id;
        g('ed-url-input').value = '';
        renderSpriteModal();
        E.toast('Sprite añadido desde URL.', 'good');
      }
    };
    im.onerror = () => E.toast('No se pudo cargar esa imagen.', 'bad');
    im.src = url;
  });

  g('ed-slicer-on').addEventListener('change', e => {
    state.slicerEnabled = e.target.checked;
    g('ed-slicer-controls').style.display = state.slicerEnabled ? 'block' : 'none';
    if (state.slicerEnabled && !state.slicerCrop) {
      selectSlicerCell(0, 0);
    }
    drawSlicerPreview();
  });

  ['ed-sl-cols', 'ed-sl-rows'].forEach(id => {
    g(id).addEventListener('input', () => {
      state.slicerCols = Math.max(1, parseInt(g('ed-sl-cols').value, 10) || 1);
      state.slicerRows = Math.max(1, parseInt(g('ed-sl-rows').value, 10) || 1);
      drawSlicerPreview();
    });
  });

  ['ed-sl-x', 'ed-sl-y', 'ed-sl-w', 'ed-sl-h'].forEach(id => {
    g(id).addEventListener('input', () => {
      state.slicerCrop = {
        x: Math.max(0, parseInt(g('ed-sl-x').value, 10) || 0),
        y: Math.max(0, parseInt(g('ed-sl-y').value, 10) || 0),
        w: Math.max(1, parseInt(g('ed-sl-w').value, 10) || 1),
        h: Math.max(1, parseInt(g('ed-sl-h').value, 10) || 1)
      };
      drawSlicerPreview();
    });
  });

  g('ed-slicer-cv').addEventListener('click', e => {
    if (!state.slicerEnabled || !state.modalSpriteId) return;
    const im = E.getSpriteImage(state.modalSpriteId);
    if (!im) return;
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    if (!iw || !ih) return;
    const cv = g('ed-slicer-cv');
    const r = cv.getBoundingClientRect();
    const s = Math.min(cv.width / iw, cv.height / ih);
    const ox = (cv.width - iw * s) / 2;
    const oy = (cv.height - ih * s) / 2;
    const cx = ((e.clientX - r.left) / r.width) * cv.width;
    const cy = ((e.clientY - r.top) / r.height) * cv.height;
    const ix = (cx - ox) / s;
    const iy = (cy - oy) / s;
    if (ix < 0 || iy < 0 || ix > iw || iy > ih) return;
    const col = Math.min(state.slicerCols - 1, Math.floor((ix / iw) * state.slicerCols));
    const row = Math.min(state.slicerRows - 1, Math.floor((iy / ih) * state.slicerRows));
    selectSlicerCell(col, row);
  });

  g('ed-apply-sprite').addEventListener('click', applyModalSprite);
}

function selectSlicerCell(col, row) {
  const im = state.modalSpriteId ? E.getSpriteImage(state.modalSpriteId) : null;
  const iw = im ? (im.naturalWidth || im.width || 128) : 128;
  const ih = im ? (im.naturalHeight || im.height || 128) : 128;
  const cw = Math.max(1, Math.floor(iw / state.slicerCols));
  const ch = Math.max(1, Math.floor(ih / state.slicerRows));
  state.slicerCrop = { x: col * cw, y: row * ch, w: cw, h: ch };
  document.getElementById('ed-sl-x').value = state.slicerCrop.x;
  document.getElementById('ed-sl-y').value = state.slicerCrop.y;
  document.getElementById('ed-sl-w').value = state.slicerCrop.w;
  document.getElementById('ed-sl-h').value = state.slicerCrop.h;
  drawSlicerPreview();
}

function handleUploadedFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        let dataUrl = String(reader.result);
        const w = im.naturalWidth || 128;
        const h = im.naturalHeight || 128;
        // Downscale very large images to keep localStorage fast while preserving alpha
        if (Math.max(w, h) > 512 && !file.type.includes('svg')) {
          const sc = 512 / Math.max(w, h);
          const c = document.createElement('canvas');
          c.width = Math.round(w * sc);
          c.height = Math.round(h * sc);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          dataUrl = c.toDataURL('image/png');
        }
        const sp = E.SPRITE_LIB.addCustom(file.name.replace(/\.[^.]+$/, ''), dataUrl, w, h);
        if (sp) {
          state.modalSpriteId = sp.id;
          renderSpriteModal();
          E.toast(`Sprite <b>${esc(sp.name)}</b> cargado.`, 'good');
        }
      };
      im.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function openSpriteModal(forElementId) {
  const el = forElementId ? E.getElement(forElementId) : selectedEl();
  state.modalOpen = true;
  state.modalSpriteId = (el && el.spriteId) || 'preset:can';
  state.slicerEnabled = !!(el && el.spriteCrop);
  state.slicerCrop = el && el.spriteCrop ? { ...el.spriteCrop } : null;
  document.getElementById('ed-slicer-on').checked = state.slicerEnabled;
  document.getElementById('ed-slicer-controls').style.display = state.slicerEnabled ? 'block' : 'none';
  if (state.slicerCrop) {
    document.getElementById('ed-sl-x').value = state.slicerCrop.x;
    document.getElementById('ed-sl-y').value = state.slicerCrop.y;
    document.getElementById('ed-sl-w').value = state.slicerCrop.w;
    document.getElementById('ed-sl-h').value = state.slicerCrop.h;
  }
  document.getElementById('ed-modal-bg').hidden = false;
  renderSpriteModal();
}

function closeSpriteModal() {
  state.modalOpen = false;
  document.getElementById('ed-modal-bg').hidden = true;
}

function renderSpriteModal() {
  if (!state.modalOpen || !E) return;
  const customWrap = document.getElementById('ed-custom-sprites');
  const presetWrap = document.getElementById('ed-preset-sprites');

  const customs = E.SPRITE_LIB.listCustom();
  customWrap.innerHTML = customs.length
    ? customs.map(sp => `
      <div class="ed-sprite-card ${state.modalSpriteId === sp.id ? 'sel' : ''}" data-sp="${esc(sp.id)}">
        <div class="pic"><img src="${esc(sp.dataUrl)}" alt="${esc(sp.name)}" /></div>
        <span>${esc(sp.name)}</span>
        <button type="button" class="del" data-del-sp="${esc(sp.id)}" title="Borrar sprite">✕</button>
      </div>`).join('')
    : '<p style="grid-column:1/-1;color:var(--dim);font-size:11px;margin:2px 0">Aún no has subido sprites personalizados.</p>';

  presetWrap.innerHTML = E.PRESET_SPRITES.map(p => {
    const thumb = E.SPRITE_LIB.getThumbUrl(p.id);
    return `
      <div class="ed-sprite-card ${state.modalSpriteId === p.id ? 'sel' : ''}" data-sp="${esc(p.id)}">
        <div class="pic"><img src="${thumb}" alt="${esc(p.name)}" /></div>
        <span>${esc(p.name)}</span>
      </div>`;
  }).join('');

  [customWrap, presetWrap].forEach(wrap => {
    wrap.querySelectorAll('.ed-sprite-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-del-sp]')) return;
        state.modalSpriteId = card.dataset.sp;
        if (state.slicerEnabled) selectSlicerCell(0, 0);
        renderSpriteModal();
      });
    });
  });

  customWrap.querySelectorAll('[data-del-sp]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      E.SPRITE_LIB.removeCustom(btn.dataset.delSp);
      if (state.modalSpriteId === btn.dataset.delSp) state.modalSpriteId = 'preset:can';
      renderSpriteModal();
    });
  });

  drawSlicerPreview();
}

function drawSlicerPreview() {
  const cv = document.getElementById('ed-slicer-cv');
  if (!cv) return;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!state.modalSpriteId) return;
  const im = E.getSpriteImage(state.modalSpriteId);
  if (!im || !(im.naturalWidth || im.width)) {
    g.fillStyle = '#a5a294';
    g.font = '12px "IBM Plex Mono", monospace';
    g.fillText('Cargando sprite…', 70, 110);
    return;
  }
  const iw = im.naturalWidth || im.width;
  const ih = im.naturalHeight || im.height;
  const s = Math.min(cv.width / iw, cv.height / ih);
  const ox = (cv.width - iw * s) / 2;
  const oy = (cv.height - ih * s) / 2;
  g.drawImage(im, ox, oy, iw * s, ih * s);

  if (state.slicerEnabled) {
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1;
    for (let c = 1; c < state.slicerCols; c++) {
      const x = ox + (iw * s * c) / state.slicerCols;
      g.beginPath(); g.moveTo(x, oy); g.lineTo(x, oy + ih * s); g.stroke();
    }
    for (let r = 1; r < state.slicerRows; r++) {
      const y = oy + (ih * s * r) / state.slicerRows;
      g.beginPath(); g.moveTo(ox, y); g.lineTo(ox + iw * s, y); g.stroke();
    }
    if (state.slicerCrop) {
      const cr = state.slicerCrop;
      g.strokeStyle = '#e8a33d';
      g.lineWidth = 2;
      g.strokeRect(ox + cr.x * s, oy + cr.y * s, cr.w * s, cr.h * s);
    }
  }
}

function applyModalSprite() {
  if (!state.modalSpriteId) return;
  let sel = selectedEl();
  if (!sel) {
    addNewElement('sprite');
    sel = selectedEl();
  }
  if (!sel) return;
  pushUndo();
  sel.spriteId = state.modalSpriteId;
  sel.spriteCrop = state.slicerEnabled && state.slicerCrop ? { ...state.slicerCrop } : null;
  if (sel.renderMode === 'default' || sel.renderMode === 'none' || sel.renderMode === 'shape') {
    sel.renderMode = 'sprite';
    sel.clipToShape = true;
  }
  E.saveLayout();
  closeSpriteModal();
  renderAllUI();
  E.sfx.ok();
  E.toast(`Sprite asignado a <b>${esc(sel.name)}</b>.`, 'good');
}

/* ---------- UI Rendering ---------- */
function syncPanelVisibility() {
  const mob = isMobileViewport();
  if (mob && state.leftOpen && state.rightOpen) state.rightOpen = false;
  const pl = document.getElementById('ed-panel-left');
  const pr = document.getElementById('ed-panel-right');
  const tl = document.getElementById('ed-open-left');
  const tr = document.getElementById('ed-open-right');
  const cl = document.getElementById('ed-close-left');
  const cr = document.getElementById('ed-close-right');
  const l2r = document.getElementById('ed-left-to-right');
  const r2l = document.getElementById('ed-right-to-left');
  const bd = document.getElementById('ed-sheet-backdrop');

  if (pl) pl.classList.toggle('collapsed', !state.leftOpen);
  if (pr) pr.classList.toggle('collapsed', !state.rightOpen);
  if (tl) tl.hidden = state.leftOpen;
  if (tr) tr.hidden = state.rightOpen;
  if (cl) cl.textContent = mob ? '✕ Listo' : '◀';
  if (cr) cr.textContent = mob ? '✕ Listo' : '▶';
  if (l2r) l2r.hidden = !mob;
  if (r2l) r2l.hidden = !mob;
  if (bd) bd.hidden = !(mob && (state.leftOpen || state.rightOpen));
  renderMobileDock();
}

function updateZoomLabel() {
  const z = document.getElementById('ed-z-lbl');
  if (z) z.textContent = Math.round(state.zoom * 100) + '%';
}

function updateToolbarButtons() {
  const g = id => document.getElementById(id);
  if (!g('ed-t-select')) return;
  g('ed-t-select').classList.toggle('on', state.tool === 'select');
  g('ed-t-poly').classList.toggle('on', state.tool === 'poly');
  g('ed-t-pan').classList.toggle('on', state.tool === 'pan');
  g('ed-grid').classList.toggle('on', state.showGrid);
  g('ed-snap').classList.toggle('on', state.snapGrid);
  g('ed-guides').classList.toggle('on', state.showGuides);
  g('ed-dark').classList.toggle('on', state.previewDark);
  g('ed-undo').disabled = state.undoStack.length === 0;
  g('ed-redo').disabled = state.redoStack.length === 0;
  updateZoomLabel();
}

function shapeSymbol(shape) {
  if (shape === 'circle') return '◯';
  if (shape === 'roundrect') return '▢';
  if (shape === 'polygon') return '⬠';
  return '▭';
}

function renderLayers() {
  const list = document.getElementById('ed-layer-list');
  if (!list || !E) return;
  const els = E.LAYOUT.elements;
  // Show top-most layers first
  const items = [];
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (state.filterTab === 'hidden' && el.visible) continue;
    if (state.filterTab === 'sprite' && el.renderMode !== 'sprite' && el.renderMode !== 'both' && el.category !== 'sprite') continue;
    if (state.filterTab === 'interactive' && el.action === 'none') continue;
    if (state.search && !el.name.toLowerCase().includes(state.search) && !el.id.toLowerCase().includes(state.search)) continue;
    items.push(el);
  }

  if (!items.length) {
    list.innerHTML = '<p style="color:var(--dim);font-size:11.5px;text-align:center;padding:12px 0">No hay elementos en esta vista.</p>';
    return;
  }

  list.innerHTML = items.map(el => {
    const thumb = el.spriteId ? E.SPRITE_LIB.getThumbUrl(el.spriteId) : '';
    const meta = [
      el.shape === 'circle' ? 'Círculo' : el.shape === 'roundrect' ? 'Redond.' : el.shape === 'polygon' ? 'Polígono' : 'Rect.',
      el.renderMode === 'sprite' ? 'Sprite' : el.renderMode === 'both' ? 'Nativo+Sprite' : el.renderMode === 'shape' ? 'Forma' : el.renderMode === 'none' ? 'Zona' : 'Nativo',
      el.action !== 'none' ? '⚡ ' + el.action : ''
    ].filter(Boolean).join(' · ');

    return `
      <div class="ed-layer ${state.selectedId === el.id ? 'sel' : ''} ${el.visible ? '' : 'hidden-el'}" data-el="${esc(el.id)}">
        <div class="ed-layer-ico">${thumb ? `<img src="${thumb}" alt="" />` : shapeSymbol(el.shape)}</div>
        <div class="ed-layer-info">
          <div class="ed-layer-name">${esc(el.name)}</div>
          <div class="ed-layer-meta">${esc(meta)}</div>
        </div>
        <div class="ed-layer-acts">
          <button type="button" class="ed-icon-btn ${el.locked ? 'on' : ''}" data-lock="${esc(el.id)}" title="${el.locked ? 'Desbloquear' : 'Bloquear'}">${el.locked ? '🔒' : '🔓'}</button>
          <button type="button" class="ed-icon-btn ${el.visible ? 'on' : 'off'}" data-vis="${esc(el.id)}" title="${el.visible ? 'Quitar / ocultar' : 'Poner / mostrar'}">${el.visible ? '👁' : '✕'}</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.ed-layer').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-vis]') || e.target.closest('[data-lock]')) return;
      state.selectedId = row.dataset.el;
      state.selectedVertex = -1;
      renderAllUI();
    });
  });
  list.querySelectorAll('[data-vis]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const el = E.getElement(btn.dataset.vis);
      if (!el) return;
      pushUndo();
      el.visible = !el.visible;
      E.saveLayout();
      renderAllUI();
    });
  });
  list.querySelectorAll('[data-lock]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const el = E.getElement(btn.dataset.lock);
      if (!el) return;
      el.locked = !el.locked;
      E.saveLayout();
      renderAllUI();
    });
  });
}

function renderInspector() {
  const wrap = document.getElementById('ed-inspector');
  if (!wrap || !E) return;
  const el = selectedEl();
  if (!el) {
    wrap.innerHTML = `
      <div class="ed-sec" style="text-align:center;padding:18px 12px">
        <p style="margin:0 0 8px;color:var(--ink);font-weight:600">Ningún elemento seleccionado</p>
        <p style="margin:0 0 12px;color:var(--dim);font-size:11.5px">Toca cualquier equipo del búnker o elemento en el lienzo para moverlo, cambiar su tamaño, cambiar su forma o asignarle un sprite.</p>
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
          <button type="button" class="ed-btn primary" id="ed-empty-add">+ Añadir Sprite</button>
          <button type="button" class="ed-btn" id="ed-empty-zone">+ Añadir Zona</button>
        </div>
      </div>
    `;
    document.getElementById('ed-empty-add').addEventListener('click', () => addNewElement('sprite'));
    document.getElementById('ed-empty-zone').addEventListener('click', () => addNewElement('zone'));
    return;
  }

  const thumb = el.spriteId ? E.SPRITE_LIB.getThumbUrl(el.spriteId) : '';
  const spriteName = el.spriteId ? E.SPRITE_LIB.getName(el.spriteId) : 'Sin sprite asignado';

  const vertsHtml = el.shape === 'polygon' ? `
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
      <button type="button" class="ed-btn" data-poly-preset="rect" title="4 esquinas">▭ 4v</button>
      <button type="button" class="ed-btn" data-poly-preset="triangle" title="Triángulo">△ 3v</button>
      <button type="button" class="ed-btn" data-poly-preset="diamond" title="Rombo">◇ 4v</button>
      <button type="button" class="ed-btn" data-poly-preset="hexagon" title="Hexágono">⬡ 6v</button>
      <button type="button" class="ed-btn" data-poly-preset="trapezoid" title="Trapecio">⏢ Persp.</button>
      ${el.spriteId ? '<button type="button" class="ed-btn teal on" id="ed-poly-alpha" title="Detectar silueta automáticamente desde la transparencia del sprite">✨ Silueta Sprite</button>' : ''}
    </div>
    <div class="ed-vlist" id="ed-vlist">
      ${(el.points || []).map((pt, i) => `
        <div class="ed-vrow">
          <span style="color:var(--teal)">V${i + 1}</span>
          <input type="number" step="0.01" data-vx="${i}" value="${pt[0]}" />
          <input type="number" step="0.01" data-vy="${i}" value="${pt[1]}" />
          <button type="button" class="ed-icon-btn off" data-vdel="${i}" ${(el.points.length <= 3) ? 'disabled' : ''} title="Eliminar vértice">✕</button>
        </div>
      `).join('')}
    </div>
  ` : '';

  wrap.innerHTML = `
    <div class="ed-sec">
      <div class="ed-sec-title">
        <span>Identidad y Capa</span>
        <span style="color:var(--dim);font-size:10px">${el.builtin ? 'NATIVO' : 'CUSTOM'}</span>
      </div>
      <div class="ed-field">
        <label>Nombre</label>
        <input type="text" id="in-name" value="${esc(el.name)}" />
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
        <button type="button" class="ed-btn" id="in-up" title="Subir capa">▲ Subir</button>
        <button type="button" class="ed-btn" id="in-down" title="Bajar capa">▼ Bajar</button>
        <button type="button" class="ed-btn ${el.visible ? 'on' : ''}" id="in-vis">${el.visible ? '👁 Puesto' : '✕ Quitado'}</button>
        <button type="button" class="ed-btn ${el.locked ? 'on' : ''}" id="in-lock">${el.locked ? '🔒 Bloq.' : '🔓 Libre'}</button>
      </div>
    </div>

    <div class="ed-sec">
      <div class="ed-sec-title">
        <span>Posición y Tamaño</span>
        <label class="ed-check" style="margin:0;font-size:10px;color:var(--dim)"><input type="checkbox" id="in-aspect" ${state.keepAspect ? 'checked' : ''} /> Proporción</label>
      </div>
      <div class="ed-grid4">
        <div class="ed-field"><label>X</label><input type="number" id="in-x" value="${Math.round(el.x)}" /></div>
        <div class="ed-field"><label>Y</label><input type="number" id="in-y" value="${Math.round(el.y)}" /></div>
        <div class="ed-field"><label>Ancho</label><input type="number" id="in-w" min="8" value="${Math.round(el.w)}" /></div>
        <div class="ed-field"><label>Alto</label><input type="number" id="in-h" min="8" value="${Math.round(el.h)}" /></div>
      </div>
      <div class="ed-nudge-wrap">
        <button type="button" class="ed-btn ${state.nudgeStep === 10 ? 'on' : ''}" id="in-nudge-step" title="Cambiar paso entre 1px y 10px">±${state.nudgeStep}px</button>
        <div class="ed-nudge-pad">
          <button type="button" class="ed-btn" data-nudge="-1,0" title="Mover izquierda">←</button>
          <button type="button" class="ed-btn" data-nudge="0,-1" title="Mover arriba">↑</button>
          <button type="button" class="ed-btn" data-nudge="0,1" title="Mover abajo">↓</button>
          <button type="button" class="ed-btn" data-nudge="1,0" title="Mover derecha">→</button>
        </div>
      </div>
      <div class="ed-grid2" style="margin-top:6px">
        <div class="ed-field">
          <label>Rotación <span id="lbl-rot">${Math.round(el.rot || 0)}°</span></label>
          <input type="range" id="in-rot" min="-180" max="180" value="${Math.round(el.rot || 0)}" />
        </div>
        <div class="ed-field">
          <label>Opacidad <span id="lbl-opa">${Math.round((el.opacity ?? 1) * 100)}%</span></label>
          <input type="range" id="in-opa" min="0" max="100" value="${Math.round((el.opacity ?? 1) * 100)}" />
        </div>
      </div>
    </div>

    <div class="ed-sec">
      <div class="ed-sec-title"><span>Forma (Máscara y Hitbox)</span></div>
      <div class="ed-shape-grid">
        <button type="button" class="ed-shape-btn ${el.shape === 'rect' ? 'on' : ''}" data-shape="rect">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="14"/></svg>
          Rect.
        </button>
        <button type="button" class="ed-shape-btn ${el.shape === 'roundrect' ? 'on' : ''}" data-shape="roundrect">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="14" rx="4"/></svg>
          Redond.
        </button>
        <button type="button" class="ed-shape-btn ${el.shape === 'circle' ? 'on' : ''}" data-shape="circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>
          Círculo
        </button>
        <button type="button" class="ed-shape-btn ${el.shape === 'polygon' ? 'on' : ''}" data-shape="polygon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,3 21,9 18,20 6,20 3,9"/></svg>
          Polígono
        </button>
      </div>
      ${el.shape === 'roundrect' ? `
        <div class="ed-field">
          <label>Radio esquinas <span id="lbl-rad">${Math.round(el.radius || 0)}px</span></label>
          <input type="range" id="in-rad" min="0" max="${Math.round(Math.min(el.w, el.h) / 2)}" value="${Math.round(el.radius || 0)}" />
        </div>
      ` : ''}
      ${vertsHtml}
      <label class="ed-check" style="margin-top:6px">
        <input type="checkbox" id="in-clip" ${el.clipToShape !== false ? 'checked' : ''} /> Recortar sprite dentro de la forma
      </label>
    </div>

    <div class="ed-sec">
      <div class="ed-sec-title"><span>Sprite y Visualización</span></div>
      <div class="ed-field">
        <label>Modo de dibujo</label>
        <select id="in-mode">
          ${el.builtin ? '<option value="default" ' + (el.renderMode === 'default' ? 'selected' : '') + '>Nativo del búnker</option>' : ''}
          <option value="sprite" ${el.renderMode === 'sprite' ? 'selected' : ''}>Usar Sprite</option>
          ${el.builtin ? '<option value="both" ' + (el.renderMode === 'both' ? 'selected' : '') + '>Nativo + Sprite encima</option>' : ''}
          <option value="shape" ${el.renderMode === 'shape' ? 'selected' : ''}>Forma vectorial / Color</option>
          <option value="none" ${el.renderMode === 'none' ? 'selected' : ''}>Solo zona táctil (invisible)</option>
        </select>
      </div>
      <div class="ed-sprite-box">
        <div class="ed-sprite-thumb">${thumb ? `<img src="${thumb}" alt="" />` : '<span style="color:var(--faint);font-size:10px">—</span>'}</div>
        <div class="ed-sprite-meta">
          <b>${esc(spriteName)}</b>
          <small>${el.spriteCrop ? `Recorte ${el.spriteCrop.w}×${el.spriteCrop.h}px` : 'Imagen completa'}</small>
        </div>
        <button type="button" class="ed-btn primary" id="in-pick-sprite">Elegir / Subir</button>
      </div>
      <div class="ed-grid2">
        <div class="ed-field">
          <label>Ajuste sprite</label>
          <select id="in-fit">
            <option value="contain" ${el.spriteFit === 'contain' ? 'selected' : ''}>Contener</option>
            <option value="cover" ${el.spriteFit === 'cover' ? 'selected' : ''}>Cubrir</option>
            <option value="fill" ${el.spriteFit === 'fill' ? 'selected' : ''}>Estirar</option>
          </select>
        </div>
        <div class="ed-field">
          <label>Animación</label>
          <select id="in-anim">
            <option value="none" ${el.anim === 'none' ? 'selected' : ''}>Ninguna</option>
            <option value="spin" ${el.anim === 'spin' ? 'selected' : ''}>Girar</option>
            <option value="bob" ${el.anim === 'bob' ? 'selected' : ''}>Flotar</option>
            <option value="pulse" ${el.anim === 'pulse' ? 'selected' : ''}>Pulsar</option>
            <option value="shake" ${el.anim === 'shake' ? 'selected' : ''}>Vibrar</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:5px">
        <label class="ed-check"><input type="checkbox" id="in-flipx" ${el.flipX ? 'checked' : ''} /> Voltear H</label>
        <label class="ed-check"><input type="checkbox" id="in-flipy" ${el.flipY ? 'checked' : ''} /> Voltear V</label>
      </div>
      ${el.renderMode === 'shape' ? `
        <div class="ed-grid2" style="margin-top:6px">
          <div class="ed-field"><label>Relleno</label><input type="text" id="in-fill" value="${esc(el.fillColor || 'rgba(87,183,163,0.28)')}" /></div>
          <div class="ed-field"><label>Borde</label><input type="text" id="in-stroke" value="${esc(el.strokeColor || '#57b7a3')}" /></div>
        </div>
      ` : ''}
    </div>

    <div class="ed-sec">
      <div class="ed-sec-title"><span>Interacción al Tocar</span></div>
      <div class="ed-field">
        <label>Acción en partida</label>
        <select id="in-action">
          ${E.ACTION_LIST.map(a => `<option value="${esc(a.id)}" ${el.action === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
      </div>
      ${el.action === 'toast' ? `
        <div class="ed-field">
          <label>Mensaje al tocar</label>
          <input type="text" id="in-msg" value="${esc(el.customMsg || '')}" />
        </div>
      ` : ''}
      <label class="ed-check">
        <input type="checkbox" id="in-marker" ${el.marker !== false ? 'checked' : ''} /> Mostrar punto indicador ámbar
      </label>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="ed-btn" id="in-dup" style="flex:1;justify-content:center">⧉ Duplicar</button>
      <button type="button" class="ed-btn danger" id="in-del" style="flex:1;justify-content:center">${el.builtin ? (el.visible ? '✕ Quitar' : '👁 Poner') : '🗑 Eliminar'}</button>
    </div>
  `;

  bindInspectorEvents(el);
}

function bindInspectorEvents(el) {
  const g = id => document.getElementById(id);

  g('in-name').addEventListener('change', e => {
    pushUndo();
    el.name = e.target.value.trim() || el.id;
    E.saveLayout();
    renderLayers();
    updateStatusBar();
  });

  g('in-up').addEventListener('click', () => moveLayer(el, 'up'));
  g('in-down').addEventListener('click', () => moveLayer(el, 'down'));
  g('in-vis').addEventListener('click', () => {
    pushUndo();
    el.visible = !el.visible;
    E.saveLayout();
    renderAllUI();
  });
  g('in-lock').addEventListener('click', () => {
    el.locked = !el.locked;
    E.saveLayout();
    renderAllUI();
  });
  g('in-aspect').addEventListener('change', e => { state.keepAspect = e.target.checked; });

  ['x', 'y', 'w', 'h'].forEach(k => {
    g('in-' + k).addEventListener('change', e => {
      pushUndo();
      let val = parseFloat(e.target.value);
      if (!Number.isFinite(val)) return;
      if (k === 'w' || k === 'h') val = Math.max(8, val);
      el[k] = Math.round(val);
      E.saveLayout();
      updateStatusBar();
    });
  });

  if (g('in-nudge-step')) {
    g('in-nudge-step').addEventListener('click', () => {
      state.nudgeStep = state.nudgeStep === 1 ? 10 : 1;
      g('in-nudge-step').textContent = '±' + state.nudgeStep + 'px';
      g('in-nudge-step').classList.toggle('on', state.nudgeStep === 10);
      renderMobileNudge();
    });
  }
  document.querySelectorAll('#ed-inspector [data-nudge]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (el.locked) return;
      const [dx, dy] = btn.dataset.nudge.split(',').map(Number);
      pushUndo();
      el.x += dx * state.nudgeStep;
      el.y += dy * state.nudgeStep;
      commitMove(el);
    });
  });

  g('in-rot').addEventListener('input', e => {
    el.rot = parseInt(e.target.value, 10) || 0;
    g('lbl-rot').textContent = el.rot + '°';
    updateStatusBar();
  });
  g('in-rot').addEventListener('change', () => { E.saveLayout(); });

  g('in-opa').addEventListener('input', e => {
    el.opacity = Math.max(0, Math.min(1, (parseInt(e.target.value, 10) || 0) / 100));
    g('lbl-opa').textContent = Math.round(el.opacity * 100) + '%';
  });
  g('in-opa').addEventListener('change', () => { E.saveLayout(); });

  // Shape buttons
  document.querySelectorAll('#ed-inspector [data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      pushUndo();
      setElementShape(el, btn.dataset.shape);
      E.saveLayout();
      renderAllUI();
    });
  });

  if (g('in-rad')) {
    g('in-rad').addEventListener('input', e => {
      el.radius = parseInt(e.target.value, 10) || 0;
      g('lbl-rad').textContent = el.radius + 'px';
    });
    g('in-rad').addEventListener('change', () => E.saveLayout());
  }

  document.querySelectorAll('#ed-inspector [data-poly-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      pushUndo();
      el.shape = 'polygon';
      el.points = makeShapePresetPoints(btn.dataset.polyPreset);
      E.saveLayout();
      renderAllUI();
    });
  });

  if (g('ed-poly-alpha')) {
    g('ed-poly-alpha').addEventListener('click', () => detectSpriteSilhouette(el));
  }

  document.querySelectorAll('#ed-inspector [data-vx]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.vx, 10);
      const val = parseFloat(inp.value);
      if (!Number.isFinite(val)) return;
      pushUndo();
      el.points[i][0] = Number(val.toFixed(4));
      E.saveLayout();
    });
  });
  document.querySelectorAll('#ed-inspector [data-vy]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.vy, 10);
      const val = parseFloat(inp.value);
      if (!Number.isFinite(val)) return;
      pushUndo();
      el.points[i][1] = Number(val.toFixed(4));
      E.saveLayout();
    });
  });
  document.querySelectorAll('#ed-inspector [data-vdel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.vdel, 10);
      if (!el.points || el.points.length <= 3) return;
      pushUndo();
      el.points.splice(i, 1);
      E.saveLayout();
      renderInspector();
    });
  });

  g('in-clip').addEventListener('change', e => {
    pushUndo();
    el.clipToShape = e.target.checked;
    E.saveLayout();
  });

  g('in-mode').addEventListener('change', e => {
    pushUndo();
    el.renderMode = e.target.value;
    if ((el.renderMode === 'sprite' || el.renderMode === 'both') && !el.spriteId) {
      el.spriteId = 'preset:can';
    }
    if (el.renderMode === 'sprite') {
      el.clipToShape = true;
    }
    E.saveLayout();
    renderAllUI();
  });

  g('in-pick-sprite').addEventListener('click', () => openSpriteModal(el.id));

  g('in-fit').addEventListener('change', e => {
    pushUndo();
    el.spriteFit = e.target.value;
    E.saveLayout();
  });
  g('in-anim').addEventListener('change', e => {
    pushUndo();
    el.anim = e.target.value;
    E.saveLayout();
  });
  g('in-flipx').addEventListener('change', e => {
    pushUndo();
    el.flipX = e.target.checked;
    E.saveLayout();
  });
  g('in-flipy').addEventListener('change', e => {
    pushUndo();
    el.flipY = e.target.checked;
    E.saveLayout();
  });

  if (g('in-fill')) {
    g('in-fill').addEventListener('change', e => { pushUndo(); el.fillColor = e.target.value; E.saveLayout(); });
    g('in-stroke').addEventListener('change', e => { pushUndo(); el.strokeColor = e.target.value; E.saveLayout(); });
  }

  g('in-action').addEventListener('change', e => {
    pushUndo();
    el.action = e.target.value;
    E.saveLayout();
    renderAllUI();
  });
  if (g('in-msg')) {
    g('in-msg').addEventListener('change', e => {
      pushUndo();
      el.customMsg = e.target.value;
      E.saveLayout();
    });
  }
  g('in-marker').addEventListener('change', e => {
    pushUndo();
    el.marker = e.target.checked;
    E.saveLayout();
  });

  g('in-dup').addEventListener('click', duplicateSelected);
  g('in-del').addEventListener('click', () => removeOrHideSelected(false));
}

function syncInspectorCoords(el) {
  const gx = document.getElementById('in-x');
  if (!gx) return;
  gx.value = Math.round(el.x);
  document.getElementById('in-y').value = Math.round(el.y);
  document.getElementById('in-w').value = Math.round(el.w);
  document.getElementById('in-h').value = Math.round(el.h);
  document.getElementById('in-rot').value = Math.round(el.rot || 0);
  document.getElementById('lbl-rot').textContent = Math.round(el.rot || 0) + '°';
  if (document.getElementById('in-rad') && el.shape === 'roundrect') {
    document.getElementById('in-rad').value = Math.round(el.radius || 0);
    document.getElementById('lbl-rad').textContent = Math.round(el.radius || 0) + 'px';
  }
}

function syncInspectorVertices(el) {
  const list = document.getElementById('ed-vlist');
  if (!list || !el.points) return;
  el.points.forEach((pt, i) => {
    const ix = list.querySelector(`[data-vx="${i}"]`);
    const iy = list.querySelector(`[data-vy="${i}"]`);
    if (ix) ix.value = pt[0];
    if (iy) iy.value = pt[1];
  });
}

function nudgeSelected(dx, dy) {
  const sel = selectedEl();
  if (!sel || sel.locked || !E) return;
  pushUndo();
  const delta = state.nudgeStep;
  if (state.nudgeMode === 'size') {
    sel.w = Math.max(12, Math.round(sel.w + dx * delta));
    sel.h = Math.max(12, Math.round(sel.h - dy * delta));
  } else {
    sel.x += dx * delta;
    sel.y += dy * delta;
  }
  commitMove(sel);
  renderMobileNudge();
}

function renderMobileNudge() {
  const pad = document.getElementById('ed-mob-nudge');
  if (!pad) return;
  const sel = selectedEl();
  if (!isMobileViewport() || !state.nudgePadOpen || !sel || state.leftOpen || state.rightOpen) {
    pad.hidden = true;
    return;
  }
  const isSize = state.nudgeMode === 'size';
  pad.hidden = false;
  pad.innerHTML = `
    <button type="button" class="ed-btn ${state.nudgeStep === 10 ? 'on' : ''}" id="ed-mn-step" style="font-size:11px">±${state.nudgeStep}</button>
    <button type="button" class="ed-btn" data-mn="0,-1" title="${isSize ? 'Más alto' : 'Arriba'}">${isSize ? '↕+' : '↑'}</button>
    <button type="button" class="ed-btn" id="ed-mn-close" style="font-size:12px">✕</button>
    <button type="button" class="ed-btn" data-mn="-1,0" title="${isSize ? 'Menos ancho' : 'Izquierda'}">${isSize ? '↔-' : '←'}</button>
    <button type="button" class="ed-btn ${isSize ? 'teal on' : 'on'}" id="ed-mn-mode" style="font-size:11px" title="Cambiar entre Mover y Tamaño">${isSize ? '⤢Tam' : '✥Pos'}</button>
    <button type="button" class="ed-btn" data-mn="1,0" title="${isSize ? 'Más ancho' : 'Derecha'}">${isSize ? '↔+' : '→'}</button>
    <button type="button" class="ed-btn" data-mn="0,1" style="grid-column:2" title="${isSize ? 'Menos alto' : 'Abajo'}">${isSize ? '↕-' : '↓'}</button>
    <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dim)">
      ${isSize ? `${Math.round(sel.w)}×${Math.round(sel.h)}px` : `X:${Math.round(sel.x)} · Y:${Math.round(sel.y)}`}
    </div>
  `;
  pad.querySelector('#ed-mn-step').addEventListener('click', () => {
    state.nudgeStep = state.nudgeStep === 1 ? 10 : 1;
    renderMobileNudge();
  });
  pad.querySelector('#ed-mn-mode').addEventListener('click', () => {
    state.nudgeMode = state.nudgeMode === 'pos' ? 'size' : 'pos';
    renderMobileNudge();
  });
  pad.querySelector('#ed-mn-close').addEventListener('click', () => {
    state.nudgePadOpen = false;
    renderMobileDock();
  });
  pad.querySelectorAll('[data-mn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [dx, dy] = btn.dataset.mn.split(',').map(Number);
      nudgeSelected(dx, dy);
    });
  });
}

function renderMobileDock() {
  const dock = document.getElementById('ed-mob-dock');
  if (!dock || !E) return;
  if (!isMobileViewport()) {
    dock.innerHTML = '';
    renderMobileNudge();
    return;
  }
  const sel = selectedEl();
  const selRow = sel ? `
    <div class="ed-mob-selrow">
      <div class="ed-mob-seltag"><b>${esc(sel.name)}</b> · ${Math.round(sel.x)},${Math.round(sel.y)} · ${Math.round(sel.w)}×${Math.round(sel.h)}</div>
      <button type="button" class="ed-btn ${state.nudgePadOpen ? 'on' : ''}" id="ed-md-nudge" title="Mover o cambiar tamaño">✥/⤢</button>
      <button type="button" class="ed-btn" id="ed-md-sprite" title="Cambiar sprite">📦</button>
      <button type="button" class="ed-btn" id="ed-md-dup" title="Duplicar">⧉</button>
      <button type="button" class="ed-btn danger" id="ed-md-del" title="Quitar o eliminar">${sel.builtin ? (sel.visible ? '✕' : '👁') : '🗑'}</button>
    </div>
  ` : `
    <div class="ed-mob-selrow">
      <div class="ed-mob-seltag">1 dedo: <b>tocar / mover / esquinas</b> · 2 dedos: <b>zoom</b></div>
    </div>
  `;

  dock.innerHTML = `
    ${selRow}
    <div class="ed-mob-nav">
      <button type="button" class="ed-btn ${state.leftOpen ? 'on' : ''}" id="ed-md-layers">☰ Capas</button>
      <button type="button" class="ed-btn ${state.rightOpen ? 'on' : ''} ${sel ? 'teal' : ''}" id="ed-md-props">⚙ Props</button>
      <button type="button" class="ed-btn primary" id="ed-md-add">+ Sprite</button>
      <button type="button" class="ed-btn" id="ed-md-fit">⛶ Encajar</button>
    </div>
  `;

  dock.querySelector('#ed-md-layers').addEventListener('click', () => {
    state.leftOpen = !state.leftOpen;
    if (state.leftOpen) state.rightOpen = false;
    syncPanelVisibility();
  });
  dock.querySelector('#ed-md-props').addEventListener('click', () => {
    state.rightOpen = !state.rightOpen;
    if (state.rightOpen) state.leftOpen = false;
    syncPanelVisibility();
  });
  dock.querySelector('#ed-md-add').addEventListener('click', () => addNewElement('sprite'));
  dock.querySelector('#ed-md-fit').addEventListener('click', fitEditorView);

  if (sel) {
    dock.querySelector('#ed-md-nudge').addEventListener('click', () => {
      state.nudgePadOpen = !state.nudgePadOpen;
      renderMobileDock();
    });
    dock.querySelector('#ed-md-sprite').addEventListener('click', () => openSpriteModal(sel.id));
    dock.querySelector('#ed-md-dup').addEventListener('click', duplicateSelected);
    dock.querySelector('#ed-md-del').addEventListener('click', () => removeOrHideSelected(false));
  }
  renderMobileNudge();
}

function updateStatusBar() {
  const sb = document.getElementById('ed-statusbar');
  if (sb && E) {
    const sel = selectedEl();
    if (!sel) {
      sb.innerHTML = isTouchUI()
        ? `Lienzo <b>${E.W}×${E.H}</b> · ${E.LAYOUT.elements.filter(e => e.visible).length}/${E.LAYOUT.elements.length} activos · 1 dedo: tocar/mover · 2 dedos: zoom/vista`
        : `Lienzo <b>${E.W}×${E.H}</b> · ${E.LAYOUT.elements.filter(e => e.visible).length}/${E.LAYOUT.elements.length} elementos activos · Rueda: zoom · Espacio+Arrastrar: mover vista`;
    } else {
      sb.innerHTML = `<b>${esc(sel.name)}</b> · X:${Math.round(sel.x)} Y:${Math.round(sel.y)} · ${Math.round(sel.w)}×${Math.round(sel.h)} · ${Math.round(sel.rot || 0)}° · Forma: <b>${sel.shape}</b>`;
    }
  }
  renderMobileDock();
}

function renderAllUI() {
  updateToolbarButtons();
  syncPanelVisibility();
  renderLayers();
  renderInspector();
  updateStatusBar();
}

/* ---------- Lifecycle Integration ---------- */
function bootAdminEditor() {
  E = window.UD_ENGINE;
  if (!E || initialized) return;
  initialized = true;
  buildEditorDOM();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', () => {
    if (state.active) {
      E.computeView();
      syncPanelVisibility();
    }
  });

  E.editor.onOpen = (selectId) => {
    state.active = true;
    activePointers.clear();
    state.nudgePadOpen = false;
    if (selectId && E.getElement(selectId)) {
      state.selectedId = selectId;
      state.selectedVertex = -1;
    }
    if (isMobileViewport()) {
      state.leftOpen = false;
      state.rightOpen = false;
    }
    root.hidden = false;
    fitEditorView();
    renderAllUI();
  };

  E.editor.onClose = () => {
    state.active = false;
    activePointers.clear();
    state.interact = null;
    state.smartGuides = [];
    state.nudgePadOpen = false;
    closeSpriteModal();
    root.hidden = true;
    E.cv.style.cursor = '';
  };

  E.editor.getState = () => state;
  E.editor.drawOverlay = drawOverlay;
  E.editor.onPointerDown = onPointerDown;
  E.editor.onPointerMove = onPointerMove;
  E.editor.onPointerUp = onPointerUp;
  E.editor.onWheel = onWheel;
}

if (window.UD_ENGINE) {
  bootAdminEditor();
} else {
  window.addEventListener('ud-engine-ready', bootAdminEditor, { once: true });
}
