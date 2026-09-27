// 等角 2.5D 城市地圖（大富翁8 風格）：道路、六角踩鈕、會長高的房子、紙片人角色、鏡頭跟隨
var RG = (globalThis.RG = globalThis.RG || {});

RG.World = (function () {
  const TW = 128, TH = 64, HW = TW / 2, HH = TH / 2;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const FONT = '"Huninn","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  // 環狀道路：從銀行出發順時針繞一圈回到銀行，共 40 格
  const ROUTE = 'R6 D3 R4 D5 L4 D2 L6 U10';
  const PAD_COLORS = {
    bank: '#f3b53f', suit: '#ffffff', chance: '#ff8a3d', shop: '#b06cf0', points: '#3cc6c0', monster: '#6b4a3a',
    hospital: '#ff6b6b', temple: '#e0493f', broker: '#3aa0ff', news: '#5b7cfa', magic: '#9b59ff',
  };

  const W = {
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
    cam: { x: 0, y: 0, zoom: 1 }, camTarget: { x: 0, y: 0 }, free: false,
    road: [], lots: [], cellMap: new Map(), deco: [], pond: new Set(),
    disp: {}, tweens: {}, floats: [], puffs: [], t: 0,
    pickTiles: null, focusTile: null, bounds: null,
  };

  const iso = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });
  const key = (x, y) => x + ',' + y;

  // 簡單的可重現亂數（讓樹木位置固定）
  function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((f - r) * p + r);
    g = Math.round((f - g) * p + g);
    b = Math.round((f - b) * p + b);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  W.layout = function () {
    const dirs = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
    let x = 0, y = 0;
    const path = [[0, 0]], moves = [];
    ROUTE.split(' ').forEach((m) => {
      const [dx, dy] = dirs[m[0]];
      for (let k = 0; k < +m.slice(1); k++) {
        x += dx;
        y += dy;
        path.push([x, y]);
        moves.push([dx, dy]);
      }
    });
    path.pop();
    this.road = path.map(([gx, gy]) => ({ gx, gy }));
    const roadSet = new Set(path.map(([a, b]) => key(a, b)));
    const taken = new Set();
    this.lots = path.map(([gx, gy], i) => {
      const o = moves[i], n = moves[(i + 39) % 40];
      const cands = [[o[1], -o[0]], [n[1], -n[0]], [-o[1], o[0]], [-n[1], n[0]]];
      for (const [dx, dy] of cands) {
        const k = key(gx + dx, gy + dy);
        if (!roadSet.has(k) && !taken.has(k)) {
          taken.add(k);
          return { gx: gx + dx, gy: gy + dy };
        }
      }
      return { gx, gy };
    });
    this.cellMap.clear();
    this.road.forEach((c, i) => this.cellMap.set(key(c.gx, c.gy), i));
    this.lots.forEach((c, i) => this.cellMap.set(key(c.gx, c.gy), i));
    // 裝飾：池塘、樹木、花叢
    this.bounds = { x0: -4, y0: -4, x1: 14, y1: 14 };
    ['2,4', '3,4', '2,5', '3,5', '3,6', '4,5', '2,6'].forEach((k) => this.pond.add(k));
    const rnd = seeded(20260101);
    this.deco = [];
    for (let gy = this.bounds.y0; gy <= this.bounds.y1; gy++) {
      for (let gx = this.bounds.x0; gx <= this.bounds.x1; gx++) {
        const k = key(gx, gy);
        if (this.cellMap.has(k) || this.pond.has(k)) {
          rnd();
          continue;
        }
        const r = rnd();
        if (r < 0.26) this.deco.push({ gx: gx + (rnd() - 0.5) * 0.4, gy: gy + (rnd() - 0.5) * 0.4, kind: 'tree', v: rnd() });
        else if (r < 0.33) this.deco.push({ gx, gy, kind: 'bush', v: rnd() });
        else if (r < 0.37) this.deco.push({ gx, gy, kind: 'flower', v: rnd() });
      }
    }
  };

  W.mount = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout();
    this.disp = {};
    this.tweens = {};
    this.floats = [];
    this.puffs = [];
    this.free = false;
    const g = RG.UI.game;
    g.players.forEach((p) => {
      const c = this.road[p.pos];
      this.disp[p.id] = { gx: c.gx, gy: c.gy, hop: 0 };
    });
    const c0 = iso(this.road[0].gx, this.road[0].gy);
    this.cam.x = this.camTarget.x = c0.x;
    this.cam.y = this.camTarget.y = c0.y;
    this.resize();
    if (!this._bound) {
      this._bound = true;
      window.addEventListener('resize', () => this.resize());
      this.bindInput();
      const loop = (ts) => {
        this.t = ts / 1000;
        if (this.canvas && this.canvas.isConnected && RG.UI.game) this.frame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  };

  W.resize = function () {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (!this._zoomSet) this.cam.zoom = this.w < 700 ? 0.55 : this.w < 1100 ? 0.8 : 1;
  };

  W.setZoom = function (z) {
    this._zoomSet = true;
    this.cam.zoom = Math.max(0.35, Math.min(1.8, z));
  };

  W.center = function () {
    // 對話框顯示在下方時，把焦點格子放到畫面上半部
    const f = this.focusTile != null ? 0.3 : this.w < 700 ? 0.42 : 0.46;
    return { x: this.w / 2, y: this.h * f };
  };
  W.toScreen = function (wx, wy) {
    const c = this.center();
    return { x: (wx - this.cam.x) * this.cam.zoom + c.x, y: (wy - this.cam.y) * this.cam.zoom + c.y };
  };
  W.toWorld = function (sx, sy) {
    const c = this.center();
    return { x: (sx - c.x) / this.cam.zoom + this.cam.x, y: (sy - c.y) / this.cam.zoom + this.cam.y };
  };
  W.cellAt = function (sx, sy) {
    const w = this.toWorld(sx, sy);
    const gx = Math.round((w.x / HW + w.y / HH) / 2);
    const gy = Math.round((w.y / HH - w.x / HW) / 2);
    return { gx, gy };
  };

  W.bindInput = function () {
    const cv = this.canvas;
    let down = null;
    const pinch = new Map();
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (pinch.has(e.pointerId) && pinch.size === 2) {
        const pts = [...pinch.values()];
        const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p2 = [...pinch.values()];
        const d1 = Math.hypot(p2[0].x - p2[1].x, p2[0].y - p2[1].y);
        if (d0 > 0) this.setZoom(this.cam.zoom * (d1 / d0));
        if (down) down.moved = true;
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
      if (down.moved) {
        this.free = true;
        this.cam.x = this.camTarget.x = down.cx - dx / this.cam.zoom;
        this.cam.y = this.camTarget.y = down.cy - dy / this.cam.zoom;
      }
    });
    const up = (e) => {
      pinch.delete(e.pointerId);
      if (down && !down.moved) {
        const r = cv.getBoundingClientRect();
        const c = this.cellAt(e.clientX - r.left, e.clientY - r.top);
        const idx = this.cellMap.get(key(c.gx, c.gy));
        if (idx != null) RG.UI.onTileClick(idx);
      }
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      pinch.delete(e.pointerId);
      down = null;
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setZoom(this.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
      },
      { passive: false }
    );
  };

  // ---------- 動畫 ----------
  W.walk = function (p, ms) {
    const from = Object.assign({}, this.disp[p.id]);
    const c = this.road[p.pos];
    const dist = Math.hypot(c.gx - from.gx, c.gy - from.gy);
    const dur = Math.min(700, ms * Math.max(1, dist * 0.6));
    this.free = false;
    return new Promise((resolve) => {
      this.tweens[p.id] = { from, to: { gx: c.gx, gy: c.gy }, t0: performance.now(), dur, resolve };
    });
  };
  W.floatText = function (p, text, color) {
    const d = this.disp[p.id];
    if (!d) return;
    const n = this.floats.filter((f) => f.pid === p.id && performance.now() - f.t0 < 600).length;
    this.floats.push({ pid: p.id, gx: d.gx, gy: d.gy, text, color, t0: performance.now() + n * 250 });
  };
  W.puff = function (idx, color) {
    const c = this.lots[idx];
    this.puffs.push({ gx: c.gx, gy: c.gy, color: color || '#fff6c2', t0: performance.now() });
  };
  W.lookAt = function (idx) {
    const c = this.road[idx];
    const w = iso(c.gx, c.gy);
    this.camTarget.x = w.x;
    this.camTarget.y = w.y;
  };

  // ---------- 繪圖工具 ----------
  function diamond(ctx, cx, cy, f) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - HH * f);
    ctx.lineTo(cx + HW * f, cy);
    ctx.lineTo(cx, cy + HH * f);
    ctx.lineTo(cx - HW * f, cy);
    ctx.closePath();
  }
  function poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function emoji(ctx, ch, x, y, size, outline) {
    ctx.font = `${size}px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, size * 0.16);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(ch, x, y);
    }
    ctx.fillText(ch, x, y);
  }
  function label(ctx, text, x, y, size, fill, stroke) {
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = stroke || '#3b2a14';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || '#fff';
    ctx.fillText(text, x, y);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 等角方塊建築
  function box(ctx, cx, cy, f, h, wall, roof, opts = {}) {
    const L = [cx - HW * f, cy], B = [cx, cy + HH * f], R = [cx + HW * f, cy], T = [cx, cy - HH * f];
    const up = (p, d) => [p[0], p[1] - d];
    ctx.lineWidth = 1.2;
    const edge = 'rgba(40,25,10,0.55)';
    poly(ctx, [L, B, up(B, h), up(L, h)], shade(wall, -0.06), edge);
    poly(ctx, [B, R, up(R, h), up(B, h)], shade(wall, -0.22), edge);
    // 窗戶
    if (opts.rows) {
      const win = opts.glass || '#9fd8ff';
      const face = (P0, P1, dark) => {
        const cols = opts.cols || 2;
        for (let r = 0; r < opts.rows; r++) {
          const v0 = 6 + (r * (h - 10)) / opts.rows, v1 = v0 + Math.max(4, (h - 10) / opts.rows - 5);
          for (let c = 0; c < cols; c++) {
            const u0 = 0.14 + (c * 0.76) / cols, u1 = u0 + 0.76 / cols - 0.1;
            const P = (u, v) => [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u - v];
            poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], dark ? shade(win, -0.25) : win);
          }
        }
      };
      face(L, B, false);
      face(B, R, true);
    }
    if (opts.door) {
      const P = (u, v) => [B[0] + (R[0] - B[0]) * u, B[1] + (R[1] - B[1]) * u - v];
      poly(ctx, [P(0.35, 0), P(0.6, 0), P(0.6, 13), P(0.35, 13)], '#8a5a2b');
    }
    const top = [up(T, h), up(R, h), up(B, h), up(L, h)];
    if (opts.pyramid) {
      const apex = [cx, cy - h - opts.pyramid];
      const ov = 1.12;
      const Lr = [cx - HW * f * ov, cy - h], Br = [cx, cy + HH * f * ov - h], Rr = [cx + HW * f * ov, cy - h], Tr = [cx, cy - HH * f * ov - h];
      poly(ctx, [Tr, Lr, apex], shade(roof, 0.1), edge);
      poly(ctx, [Tr, Rr, apex], shade(roof, -0.1), edge);
      poly(ctx, [Lr, Br, apex], roof, edge);
      poly(ctx, [Br, Rr, apex], shade(roof, -0.25), edge);
      return cy - h - opts.pyramid;
    }
    poly(ctx, top, roof, edge);
    return cy - h;
  }

  function hexPad(ctx, cx, cy, color, ring) {
    const rx = 42, ry = 21, depth = 6;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    const down = pts.map((p) => [p[0], p[1] + depth]);
    // 側面
    poly(ctx, [pts[0], pts[1], pts[2], pts[3], down[3], down[2], down[1], down[0]], shade(color, -0.35));
    poly(ctx, pts, color, 'rgba(255,255,255,0.9)');
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ring || 'rgba(255,255,255,0.85)';
    ctx.stroke();
    const inner = pts.map((p) => [cx + (p[0] - cx) * 0.72, cy + (p[1] - cy) * 0.72]);
    poly(ctx, inner, shade(color, 0.18));
  }

  // ---------- 每一格 ----------
  function drawGround(ctx) {
    const b = W.bounds;
    // 浮島側面
    const top = iso(b.x0, b.y0), right = iso(b.x1, b.y0), bot = iso(b.x1, b.y1), left = iso(b.x0, b.y1);
    const T = [top.x, top.y - HH], R = [right.x + HW, right.y], B = [bot.x, bot.y + HH], L = [left.x - HW, left.y];
    const D = 46;
    poly(ctx, [L, B, [B[0], B[1] + D], [L[0], L[1] + D]], '#b98755');
    poly(ctx, [B, R, [R[0], R[1] + D], [B[0], B[1] + D]], '#98663b');
    poly(ctx, [L, B, [B[0], B[1] + 8], [L[0], L[1] + 8]], '#5fae43');
    poly(ctx, [B, R, [R[0], R[1] + 8], [B[0], B[1] + 8]], '#4f9a37');
    for (let gy = b.y0; gy <= b.y1; gy++) {
      for (let gx = b.x0; gx <= b.x1; gx++) {
        const p = iso(gx, gy);
        const k = key(gx, gy);
        if (W.pond.has(k)) {
          diamond(ctx, p.x, p.y, 1.01);
          ctx.fillStyle = (gx + gy) % 2 ? '#5cc4f2' : '#56bbe9';
          ctx.fill();
          continue;
        }
        diamond(ctx, p.x, p.y, 1.01);
        ctx.fillStyle = (gx + gy) % 2 ? '#8fd66a' : '#86ce62';
        ctx.fill();
      }
    }
    // 池塘波光
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    W.pond.forEach((k) => {
      const [gx, gy] = k.split(',').map(Number);
      const p = iso(gx, gy);
      const s = Math.sin(W.t * 2 + gx + gy) * 6;
      ctx.beginPath();
      ctx.moveTo(p.x - 14 + s, p.y);
      ctx.lineTo(p.x + 4 + s, p.y);
      ctx.stroke();
    });
  }

  function drawRoad(ctx, g) {
    g.board.forEach((t, i) => {
      const c = W.road[i];
      const p = iso(c.gx, c.gy);
      diamond(ctx, p.x, p.y, 1.0);
      ctx.fillStyle = '#b3aea4';
      ctx.fill();
      diamond(ctx, p.x, p.y, 0.9);
      ctx.fillStyle = '#9c978d';
      ctx.fill();
    });
    // 連接道路的中線
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    W.road.forEach((c, i) => {
      const p = iso(c.gx, c.gy);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    g.board.forEach((t, i) => {
      const c = W.road[i];
      const p = iso(c.gx, c.gy);
      const owner = g.ownerOf(t);
      let color;
      if (t.type === 'land') color = RG.DISTRICTS.find((d) => d.id === t.district).color;
      else color = PAD_COLORS[t.type] || '#ccc';
      hexPad(ctx, p.x, p.y, color, owner ? owner.color : null);
      if (t.type === 'suit') {
        label(ctx, RG.SUITS[t.suit].icon, p.x, p.y - 2, 24, ['heart', 'diamond'].includes(t.suit) ? '#e33' : '#222', '#fff');
      } else if (t.type !== 'land') {
        emoji(ctx, RG.TILE_TYPES[t.type].icon, p.x, p.y - 3, 20, false);
      } else if (owner) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 11, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = owner.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (W.pickTiles && W.pickTiles.includes(i)) {
        const a = 0.45 + 0.35 * Math.sin(W.t * 6);
        diamond(ctx, p.x, p.y, 1.0);
        ctx.strokeStyle = `rgba(255,214,0,${a + 0.3})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      if (W.focusTile === i) {
        diamond(ctx, p.x, p.y, 1.0);
        ctx.strokeStyle = '#ffd400';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    });
  }

  function drawLotBase(ctx, g, t, i) {
    const c = W.lots[i];
    const p = iso(c.gx, c.gy);
    const owner = g.ownerOf(t);
    if (t.type === 'land') {
      const dc = RG.DISTRICTS.find((d) => d.id === t.district).color;
      diamond(ctx, p.x, p.y, 0.94);
      ctx.fillStyle = owner ? '#efe6cf' : '#a5dc80';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = owner ? owner.color : dc;
      ctx.stroke();
      // 屬性標記
      emoji(ctx, RG.ELEMENTS[t.element].icon, p.x - HW * 0.55, p.y + 2, 13, false);
    } else {
      diamond(ctx, p.x, p.y, 0.94);
      ctx.fillStyle = '#e9e1cb';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,90,40,0.5)';
      ctx.stroke();
    }
    const picking = W.pickTiles && W.pickTiles.includes(i);
    if (picking || W.focusTile === i) {
      const a = picking ? 0.5 + 0.4 * Math.sin(W.t * 6) : 1;
      diamond(ctx, p.x, p.y, 0.94);
      ctx.strokeStyle = `rgba(255,214,0,${a})`;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  const LEVEL_SPEC = [
    null,
    { f: 0.42, h: 20, pyramid: 18, rows: 1, cols: 1 },
    { f: 0.5, h: 34, pyramid: 20, rows: 2, cols: 2 },
    { f: 0.56, h: 58, rows: 3, cols: 2 },
    { f: 0.6, h: 88, rows: 5, cols: 3 },
    { f: 0.62, h: 120, rows: 7, cols: 3 },
  ];

  function drawLotObject(ctx, g, t, i) {
    const c = W.lots[i];
    const p = iso(c.gx, c.gy);
    const owner = g.ownerOf(t);
    let topY = p.y;
    if (t.type === 'land') {
      if (!owner) {
        // 出售告示牌
        ctx.fillStyle = '#7a4a1c';
        ctx.fillRect(p.x - 2, p.y - 26, 4, 26);
        roundRect(ctx, p.x - 24, p.y - 46, 48, 22, 5);
        ctx.fillStyle = '#fffaf0';
        ctx.fill();
        ctx.strokeStyle = '#7a4a1c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `900 12px ${FONT}`;
        ctx.fillStyle = '#c0392b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$' + t.price, p.x, p.y - 35);
        topY = p.y - 46;
      } else if (t.level === 0) {
        // 圍籬 + 旗子
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        diamond(ctx, p.x, p.y, 0.6);
        ctx.stroke();
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(p.x - 1.5, p.y - 38, 3, 38);
        poly(ctx, [[p.x + 1, p.y - 38], [p.x + 24, p.y - 31], [p.x + 1, p.y - 24]], owner.color, '#fff');
        topY = p.y - 40;
      } else {
        const s = LEVEL_SPEC[t.level];
        const wall = t.level >= 3 ? shade(owner.color, 0.72) : '#fff4dc';
        topY = box(ctx, p.x, p.y + 4, s.f, s.h, wall, t.level >= 3 ? shade(owner.color, -0.15) : owner.color, {
          pyramid: s.pyramid, rows: s.rows, cols: s.cols, door: t.level <= 2,
        });
        if (t.level === 5) {
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, topY);
          ctx.lineTo(p.x, topY - 22);
          ctx.stroke();
          ctx.fillStyle = Math.sin(W.t * 4) > 0 ? '#ff4040' : '#ffb0b0';
          ctx.beginPath();
          ctx.arc(p.x, topY - 23, 3, 0, Math.PI * 2);
          ctx.fill();
          topY -= 24;
        }
      }
      if (t.guardian) {
        const gc = RG.card(t.guardian.id);
        const gx = p.x + HW * 0.5, gy = p.y + 4;
        ctx.beginPath();
        ctx.ellipse(gx, gy + 2, 14, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = RG.ELEMENTS[gc.element].color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
        emoji(ctx, gc.icon, gx, gy - 14 + Math.sin(W.t * 3 + i) * 1.5, 28, true);
        const pct = t.guardian.hp / t.guardian.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(gx - 14, gy + 6, 28, 5);
        ctx.fillStyle = pct < 0.4 ? '#ff5a5a' : '#48d17a';
        ctx.fillRect(gx - 14, gy + 6, 28 * pct, 5);
      }
      return topY;
    }
    // 特殊地標
    const icon = t.type === 'suit' ? null : RG.TILE_TYPES[t.type].icon;
    switch (t.type) {
      case 'bank':
        topY = box(ctx, p.x, p.y + 4, 0.72, 58, '#fff1c9', '#f3b53f', { rows: 2, cols: 3, door: true });
        break;
      case 'hospital':
        topY = box(ctx, p.x, p.y + 4, 0.66, 50, '#ffffff', '#ff6b6b', { rows: 2, cols: 2, door: true });
        break;
      case 'broker':
        topY = box(ctx, p.x, p.y + 4, 0.55, 76, '#dff1ff', '#3aa0ff', { rows: 5, cols: 2, glass: '#5fb7ff' });
        break;
      case 'news':
        topY = box(ctx, p.x, p.y + 4, 0.36, 64, '#e3e8ff', '#5b7cfa', { rows: 4, cols: 1 });
        break;
      case 'shop':
        topY = box(ctx, p.x, p.y + 4, 0.52, 28, '#fff4dc', '#b06cf0', { pyramid: 16, rows: 1, cols: 2, door: true });
        break;
      case 'points':
        topY = box(ctx, p.x, p.y + 4, 0.4, 24, '#e6fffb', '#3cc6c0', { pyramid: 14, door: true });
        break;
      case 'monster': {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 44, 24, 0, Math.PI, 0);
        ctx.fillStyle = '#6b5446';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(p.x + 6, p.y, 16, 12, 0, Math.PI, 0);
        ctx.fillStyle = '#231a14';
        ctx.fill();
        topY = p.y - 26;
        break;
      }
      case 'magic': {
        const a = 0.35 + 0.25 * Math.sin(W.t * 3);
        diamond(ctx, p.x, p.y, 0.7);
        ctx.fillStyle = `rgba(155,89,255,${a})`;
        ctx.fill();
        ctx.strokeStyle = '#d7b8ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        topY = p.y - 8;
        break;
      }
      default: {
        // 底座
        topY = box(ctx, p.x, p.y + 4, 0.34, 12, '#f2ead6', '#e0d4b4');
      }
    }
    const bob = Math.sin(W.t * 2 + i) * 2;
    if (t.type === 'suit') label(ctx, RG.SUITS[t.suit].icon, p.x, topY - 22 + bob, 40, ['heart', 'diamond'].includes(t.suit) ? '#ff3b3b' : '#222', '#fff');
    else emoji(ctx, icon, p.x, topY - 20 + bob, t.type === 'temple' || t.type === 'chance' || t.type === 'monster' ? 42 : 30, true);
    return topY - 40;
  }

  function drawTree(ctx, d) {
    const p = iso(d.gx, d.gy);
    if (d.kind === 'tree') {
      const s = 0.8 + d.v * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, 16 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(p.x - 3, p.y - 14 * s, 6, 16 * s);
      const green = d.v > 0.5 ? '#3f9e3a' : '#4bb04a';
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 26 * s, 17 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(d.v > 0.5 ? '#3f9e3a' : '#4bb04a', 0.25);
      ctx.beginPath();
      ctx.arc(p.x - 5 * s, p.y - 31 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 'bush') {
      ctx.fillStyle = '#5fb84c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, 18, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#76c95f';
      ctx.beginPath();
      ctx.ellipse(p.x - 5, p.y - 7, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ['#ff7aa8', '#ffd84d', '#ffffff'].forEach((c, k) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x - 10 + k * 10, p.y - 2 + (k % 2) * 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function drawPlayer(ctx, g, p, offset) {
    const d = W.disp[p.id];
    const w = iso(d.gx, d.gy);
    const x = w.x + offset, y = w.y - d.hop;
    const cur = g.turnPlayer === p;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(w.x + offset, w.y + 4, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 15, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    const sway = Math.sin(W.t * (cur ? 5 : 2) + p.id) * (cur ? 0.08 : 0.03);
    ctx.save();
    ctx.translate(x, y - 24);
    ctx.rotate(sway);
    emoji(ctx, p.icon, 0, 0, 46, true);
    ctx.restore();
    // 狀態
    const marks = [];
    if (p.god) marks.push(RG.GODS[p.god.type].icon);
    if (p.status.sleep) marks.push('💤');
    if (p.status.turtle) marks.push('🐢');
    if (p.status.hospital) marks.push('🩹');
    marks.forEach((m, k) => emoji(ctx, m, x + 20 + k * 16, y - 50 + Math.sin(W.t * 3 + k) * 2, 16, true));
    if (cur) {
      const by = y - 64 + Math.sin(W.t * 6) * 4;
      poly(ctx, [[x - 9, by - 8], [x + 9, by - 8], [x, by + 4]], p.color, '#fff');
    }
  }

  // ---------- 每幀 ----------
  W.frame = function () {
    const g = RG.UI.game;
    const ctx = this.ctx;
    const now = performance.now();
    // 角色位置
    g.players.forEach((p) => {
      const d = this.disp[p.id];
      const tw = this.tweens[p.id];
      if (tw) {
        const k = Math.min(1, (now - tw.t0) / tw.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        d.gx = tw.from.gx + (tw.to.gx - tw.from.gx) * e;
        d.gy = tw.from.gy + (tw.to.gy - tw.from.gy) * e;
        d.hop = Math.sin(k * Math.PI) * 18;
        if (k >= 1) {
          d.hop = 0;
          delete this.tweens[p.id];
          tw.resolve();
        }
      } else {
        const c = this.road[p.pos];
        d.gx += (c.gx - d.gx) * 0.2;
        d.gy += (c.gy - d.gy) * 0.2;
        d.hop = 0;
      }
    });
    // 鏡頭
    const tp = g.turnPlayer;
    if (!this.free) {
      if (this.focusTile != null) {
        const c = this.road[this.focusTile], l = this.lots[this.focusTile];
        const w = iso((c.gx + l.gx) / 2, (c.gy + l.gy) / 2);
        this.camTarget.x = w.x;
        this.camTarget.y = w.y;
      } else if (tp && this.disp[tp.id]) {
        const w = iso(this.disp[tp.id].gx, this.disp[tp.id].gy);
        this.camTarget.x = w.x;
        this.camTarget.y = w.y;
      }
    }
    this.cam.x += (this.camTarget.x - this.cam.x) * 0.12;
    this.cam.y += (this.camTarget.y - this.cam.y) * 0.12;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    sky.addColorStop(0, '#7fd0ff');
    sky.addColorStop(1, '#d8f3ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const c = this.center();
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * (c.x - this.cam.x * this.cam.zoom), this.dpr * (c.y - this.cam.y * this.cam.zoom));

    drawGround(ctx);
    drawRoad(ctx, g);
    g.board.forEach((t, i) => drawLotBase(ctx, g, t, i));

    // 依深度排序的物件
    const objs = [];
    this.deco.forEach((d) => objs.push({ depth: d.gx + d.gy, draw: () => drawTree(ctx, d) }));
    g.board.forEach((t, i) => {
      const l = this.lots[i];
      objs.push({ depth: l.gx + l.gy, draw: () => drawLotObject(ctx, g, t, i) });
      const r = this.road[i];
      if (t.god || t.block) {
        objs.push({
          depth: r.gx + r.gy + 0.1,
          draw: () => {
            const p = iso(r.gx, r.gy);
            if (t.block) emoji(ctx, '🚧', p.x, p.y - 12, 30, true);
            if (t.god) {
              const b = Math.sin(this.t * 3 + i) * 4;
              ctx.fillStyle = 'rgba(255,240,150,0.45)';
              ctx.beginPath();
              ctx.ellipse(p.x, p.y, 26, 12, 0, 0, Math.PI * 2);
              ctx.fill();
              emoji(ctx, RG.GODS[t.god].icon, p.x, p.y - 30 + b, 34, true);
            }
          },
        });
      }
    });
    const groups = {};
    g.players.forEach((p) => {
      if (p.bankrupt) return;
      const k = p.pos;
      (groups[k] = groups[k] || []).push(p);
    });
    Object.values(groups).forEach((arr) => {
      arr.forEach((p, k) => {
        const off = (k - (arr.length - 1) / 2) * 26;
        const d = this.disp[p.id];
        objs.push({ depth: d.gx + d.gy + 0.3 + k * 0.01, draw: () => drawPlayer(ctx, g, p, off) });
      });
    });
    objs.sort((a, b) => a.depth - b.depth);
    objs.forEach((o) => o.draw());

    // 煙塵特效
    this.puffs = this.puffs.filter((f) => now - f.t0 < 900);
    this.puffs.forEach((f) => {
      const k = (now - f.t0) / 900;
      const p = iso(f.gx, f.gy);
      for (let n = 0; n < 6; n++) {
        const a = (Math.PI * 2 * n) / 6;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 40 * k, p.y - 20 + Math.sin(a) * 20 * k - 30 * k, 7 * (1 - k) + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    // 漂浮文字（金錢變化）
    this.floats = this.floats.filter((f) => now - f.t0 < 1600);
    this.floats.forEach((f) => {
      const k = (now - f.t0) / 1600;
      if (k < 0) return;
      const d = this.disp[f.pid];
      const p = iso(d ? d.gx : f.gx, d ? d.gy : f.gy);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      label(ctx, f.text, p.x, p.y - 80 - k * 46, 22, f.color, '#2a1a08');
      ctx.globalAlpha = 1;
    });
  };

  return W;
})();
