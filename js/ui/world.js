// 等角 2.5D 城市地圖（大富翁8 風格）：道路、六角踩鈕、會長高的房子、紙片人立牌、鏡頭跟隨
// 效能：地面/道路預先畫在離屏畫布，emoji 與角色立牌都快取成小圖，每幀只畫會變動的東西
var RG = (globalThis.RG = globalThis.RG || {});

RG.World = (function () {
  const TW = 128, TH = 64, HW = TW / 2, HH = TH / 2;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const FONT = '"Huninn","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const ROUTE = 'R6 D3 R4 D5 L4 D2 L6 U10';
  const ISLAND_DEPTH = 52;
  const PAD_COLORS = {
    bank: '#f3b53f', suit: '#ffffff', chance: '#ff8a3d', shop: '#b06cf0', points: '#3cc6c0', monster: '#7a5646',
    hospital: '#ff6b6b', temple: '#e0493f', broker: '#3aa0ff', news: '#5b7cfa', magic: '#9b59ff',
  };

  const W = {
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
    cam: { x: 0, y: 0, zoom: 1 }, camTarget: { x: 0, y: 0 }, free: false,
    road: [], lots: [], cellMap: new Map(), deco: [], pond: new Set(), clouds: [],
    disp: {}, tweens: {}, floats: [], puffs: [], coins: [], t: 0,
    pickTiles: null, focusTile: null, bounds: null,
    ground: null, sprites: new Map(),
  };

  const iso = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });
  const key = (x, y) => x + ',' + y;
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
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---------- 版面 ----------
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
    this.roadSet = new Set(path.map(([a, b]) => key(a, b)));
    const taken = new Set();
    this.lots = path.map(([gx, gy], i) => {
      const o = moves[i], n = moves[(i + 39) % 40];
      const cands = [[o[1], -o[0]], [n[1], -n[0]], [-o[1], o[0]], [-n[1], n[0]]];
      for (const [dx, dy] of cands) {
        const k = key(gx + dx, gy + dy);
        if (!this.roadSet.has(k) && !taken.has(k)) {
          taken.add(k);
          return { gx: gx + dx, gy: gy + dy };
        }
      }
      return { gx, gy };
    });
    this.cellMap.clear();
    this.road.forEach((c, i) => this.cellMap.set(key(c.gx, c.gy), i));
    this.lots.forEach((c, i) => this.cellMap.set(key(c.gx, c.gy), i));
    this.bounds = { x0: -4, y0: -4, x1: 14, y1: 14 };
    this.pond = new Set(['2,4', '3,4', '2,5', '3,5', '3,6', '4,5', '2,6']);
    const rnd = seeded(20260101);
    this.deco = [];
    for (let gy = this.bounds.y0; gy <= this.bounds.y1; gy++) {
      for (let gx = this.bounds.x0; gx <= this.bounds.x1; gx++) {
        const k = key(gx, gy);
        const r = rnd(), a = rnd(), b = rnd(), v = rnd();
        if (this.cellMap.has(k) || this.pond.has(k)) continue;
        if (r < 0.24) this.deco.push({ gx: gx + (a - 0.5) * 0.4, gy: gy + (b - 0.5) * 0.4, kind: v < 0.25 ? 'pine' : 'tree', v });
        else if (r < 0.31) this.deco.push({ gx, gy, kind: 'bush', v });
        else if (r < 0.36) this.deco.push({ gx, gy, kind: 'flower', v });
      }
    }
    // 睡蓮
    this.lilies = [[2.2, 4.6], [3.4, 5.4], [2.6, 6.1]];
    // 雲
    this.clouds = Array.from({ length: 7 }, (_, i) => ({ x: rnd() * 1.4 - 0.2, y: 0.05 + rnd() * 0.35, s: 0.6 + rnd() * 0.8, v: 0.004 + rnd() * 0.006, i }));
  };

  W.mount = function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout();
    this.disp = {};
    this.tweens = {};
    this.floats = [];
    this.puffs = [];
    this.coins = [];
    this.free = false;
    const g = RG.UI.game;
    g.players.forEach((p) => {
      const c = this.road[p.pos];
      this.disp[p.id] = { gx: c.gx, gy: c.gy, hop: 0 };
    });
    const tp = g.players[g.turnIndex || 0] || g.players[0];
    const c0 = iso(this.road[tp.pos].gx, this.road[tp.pos].gy);
    this.cam.x = this.camTarget.x = c0.x;
    this.cam.y = this.camTarget.y = c0.y;
    this.resize();
    if (!this.ground) this.buildGround();
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
    const f = this.focusTile != null ? 0.3 : this.w < 700 ? 0.42 : 0.46;
    return { x: this.w / 2, y: this.h * f };
  };
  W.toWorld = function (sx, sy) {
    const c = this.center();
    return { x: (sx - c.x) / this.cam.zoom + this.cam.x, y: (sy - c.y) / this.cam.zoom + this.cam.y };
  };
  W.cellAt = function (sx, sy) {
    const w = this.toWorld(sx, sy);
    return { gx: Math.round((w.x / HW + w.y / HH) / 2), gy: Math.round((w.y / HH - w.x / HW) / 2) };
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
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    }, { passive: false });
  };

  // ---------- 動畫 API ----------
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
  W.floatText = function (p, text, color, gain) {
    const d = this.disp[p.id];
    if (!d) return;
    const now = performance.now();
    const n = this.floats.filter((f) => f.pid === p.id && now - f.t0 < 600).length;
    this.floats.push({ pid: p.id, text, color, t0: now + n * 250 });
    if (gain) {
      for (let k = 0; k < 7; k++) {
        this.coins.push({ pid: p.id, t0: now + n * 250 + k * 40, vx: (Math.random() - 0.5) * 120, vy: -160 - Math.random() * 90 });
      }
    }
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
  function diamondPath(ctx, cx, cy, f) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - HH * f);
    ctx.lineTo(cx + HW * f, cy);
    ctx.lineTo(cx, cy + HH * f);
    ctx.lineTo(cx - HW * f, cy);
    ctx.closePath();
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = lw || 1.2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
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
  // emoji 快取成小圖（白色描邊＝紙片剪影風）
  const SPR = 3;
  function emojiSprite(ch, size, outline) {
    const k = `${ch}|${size}|${outline ? 1 : 0}`;
    let c = W.sprites.get(k);
    if (c) return c;
    const pad = outline ? size * 0.22 : size * 0.1;
    const dim = (size * 1.25 + pad * 2) * SPR;
    c = mkCanvas(dim, dim);
    const x = c.getContext('2d');
    x.scale(SPR, SPR);
    x.font = `${size}px ${EMOJI}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const m = dim / SPR / 2;
    if (outline) {
      x.lineJoin = 'round';
      x.lineWidth = Math.max(4, size * 0.18);
      x.strokeStyle = '#fff';
      x.shadowColor = 'rgba(0,0,0,0.25)';
      x.shadowBlur = 3;
      x.shadowOffsetY = 1.5;
      x.strokeText(ch, m, m);
      x.shadowColor = 'transparent';
    }
    x.fillText(ch, m, m);
    W.sprites.set(k, c);
    return c;
  }
  function emoji(ctx, ch, x, y, size, outline) {
    const c = emojiSprite(ch, size, outline);
    const d = c.width / SPR;
    ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
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

  // 等角方塊建築（帶漸層光影與投影）
  function box(ctx, cx, cy, f, h, wall, roof, opts = {}) {
    const L = [cx - HW * f, cy], B = [cx, cy + HH * f], R = [cx + HW * f, cy], T = [cx, cy - HH * f];
    const up = (p, d) => [p[0], p[1] - d];
    const edge = 'rgba(50,30,10,0.55)';
    if (!opts.noShadow) {
      const o = [h * 0.55, h * 0.18];
      poly(ctx, [T, R, [R[0] + o[0], R[1] + o[1]], [B[0] + o[0], B[1] + o[1]], B], 'rgba(20,40,10,0.16)');
    }
    // 左面（受光）
    let gr = ctx.createLinearGradient(L[0], cy - h, L[0], cy + HH * f);
    gr.addColorStop(0, shade(wall, 0.12));
    gr.addColorStop(1, shade(wall, -0.08));
    poly(ctx, [L, B, up(B, h), up(L, h)], gr, edge);
    // 右面（背光）
    gr = ctx.createLinearGradient(B[0], cy - h, R[0], cy + HH * f);
    gr.addColorStop(0, shade(wall, -0.18));
    gr.addColorStop(1, shade(wall, -0.32));
    poly(ctx, [B, R, up(R, h), up(B, h)], gr, edge);
    if (opts.rows) {
      const win = opts.glass || '#9fd8ff';
      const face = (P0, P1, dark) => {
        const cols = opts.cols || 2;
        for (let r = 0; r < opts.rows; r++) {
          const v0 = 7 + (r * (h - 12)) / opts.rows, v1 = v0 + Math.max(4, (h - 12) / opts.rows - 5);
          for (let c = 0; c < cols; c++) {
            const u0 = 0.14 + (c * 0.76) / cols, u1 = u0 + 0.76 / cols - 0.1;
            const P = (u, v) => [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u - v];
            poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], dark ? shade(win, -0.3) : win, 'rgba(255,255,255,0.55)', 1);
            if (!dark) poly(ctx, [P(u0, v1), P(u0 + (u1 - u0) * 0.45, v1), P(u0, v1 - (v1 - v0) * 0.5)], 'rgba(255,255,255,0.55)');
          }
        }
      };
      face(L, B, false);
      face(B, R, true);
    }
    if (opts.door) {
      const P = (u, v) => [B[0] + (R[0] - B[0]) * u, B[1] + (R[1] - B[1]) * u - v];
      poly(ctx, [P(0.35, 0), P(0.62, 0), P(0.62, 14), P(0.35, 14)], '#8a5a2b', 'rgba(0,0,0,0.3)');
      if (opts.awning) poly(ctx, [P(0.25, 16), P(0.72, 16), P(0.78, 21), P(0.2, 21)], opts.awning, 'rgba(0,0,0,0.25)');
    }
    const top = [up(T, h), up(R, h), up(B, h), up(L, h)];
    if (opts.pyramid) {
      const apex = [cx, cy - h - opts.pyramid];
      const ov = 1.14;
      const Lr = [cx - HW * f * ov, cy - h], Br = [cx, cy + HH * f * ov - h], Rr = [cx + HW * f * ov, cy - h], Tr = [cx, cy - HH * f * ov - h];
      poly(ctx, [Tr, Lr, apex], shade(roof, 0.1), edge);
      poly(ctx, [Tr, Rr, apex], shade(roof, -0.1), edge);
      poly(ctx, [Lr, Br, apex], shade(roof, 0.05), edge);
      poly(ctx, [Br, Rr, apex], shade(roof, -0.25), edge);
      // 屋脊高光
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Lr[0] + 4, Lr[1]);
      ctx.lineTo(apex[0], apex[1] + 2);
      ctx.stroke();
      return cy - h - opts.pyramid;
    }
    const tg = ctx.createLinearGradient(L[0], cy - h, R[0], cy - h);
    tg.addColorStop(0, shade(roof, 0.12));
    tg.addColorStop(1, shade(roof, -0.1));
    poly(ctx, top, tg, edge);
    if (opts.rim) {
      const k = 0.82;
      poly(ctx, [
        [cx, cy - h - HH * f * k], [cx + HW * f * k, cy - h], [cx, cy - h + HH * f * k], [cx - HW * f * k, cy - h],
      ], shade(roof, -0.18));
    }
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
    poly(ctx, [pts[0], pts[1], pts[2], pts[3], down[3], down[2], down[1], down[0]], shade(color, -0.38));
    const gr = ctx.createRadialGradient(cx - 12, cy - 8, 2, cx, cy, rx);
    gr.addColorStop(0, shade(color, 0.45));
    gr.addColorStop(0.6, color);
    gr.addColorStop(1, shade(color, -0.12));
    poly(ctx, pts, gr);
    ctx.lineWidth = ring ? 4 : 2.5;
    ctx.strokeStyle = ring || 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 10, cy - 7, 14, 4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }

  // ---------- 靜態地面（只畫一次）----------
  W.buildGround = function () {
    const b = this.bounds;
    const minX = iso(b.x0, b.y1).x - HW - 4, maxX = iso(b.x1, b.y0).x + HW + 4;
    const minY = iso(b.x0, b.y0).y - HH - 4, maxY = iso(b.x1, b.y1).y + HH + ISLAND_DEPTH + 8;
    const S = window.innerWidth < 700 ? 1 : 1.35;
    const c = mkCanvas((maxX - minX) * S, (maxY - minY) * S);
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.translate(-minX, -minY);
    const rnd = seeded(7);
    // 浮島側面
    const top = iso(b.x0, b.y0), right = iso(b.x1, b.y0), bot = iso(b.x1, b.y1), left = iso(b.x0, b.y1);
    const T = [top.x, top.y - HH], R = [right.x + HW, right.y], B = [bot.x, bot.y + HH], L = [left.x - HW, left.y];
    const D = ISLAND_DEPTH;
    let gr = ctx.createLinearGradient(0, B[1], 0, B[1] + D);
    gr.addColorStop(0, '#c08c58');
    gr.addColorStop(1, '#8e5f35');
    poly(ctx, [L, B, [B[0], B[1] + D], [L[0], L[1] + D]], gr);
    gr = ctx.createLinearGradient(0, B[1], 0, B[1] + D);
    gr.addColorStop(0, '#a06d40');
    gr.addColorStop(1, '#6f4524');
    poly(ctx, [B, R, [R[0], R[1] + D], [B[0], B[1] + D]], gr);
    // 地層紋路
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (let k = 1; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(L[0], L[1] + k * 17);
      ctx.lineTo(B[0], B[1] + k * 17);
      ctx.lineTo(R[0], R[1] + k * 17);
      ctx.stroke();
    }
    poly(ctx, [L, B, [B[0], B[1] + 9], [L[0], L[1] + 9]], '#5fae43');
    poly(ctx, [B, R, [R[0], R[1] + 9], [B[0], B[1] + 9]], '#4f9a37');
    // 草地
    for (let gy = b.y0; gy <= b.y1; gy++) {
      for (let gx = b.x0; gx <= b.x1; gx++) {
        const p = iso(gx, gy);
        const k = key(gx, gy);
        diamondPath(ctx, p.x, p.y, 1.02);
        if (this.pond.has(k)) {
          ctx.fillStyle = (gx + gy) % 2 ? '#5cc4f2' : '#55bbea';
          ctx.fill();
          continue;
        }
        ctx.fillStyle = (gx + gy) % 2 ? '#8fd66a' : '#87cf63';
        ctx.fill();
        for (let n = 0; n < 5; n++) {
          const ox = (rnd() - 0.5) * HW * 1.2, oy = (rnd() - 0.5) * HH * 0.9;
          ctx.strokeStyle = rnd() < 0.5 ? 'rgba(60,130,40,0.35)' : 'rgba(210,255,170,0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x + ox, p.y + oy);
          ctx.lineTo(p.x + ox + 2, p.y + oy - 5);
          ctx.stroke();
        }
      }
    }
    // 池塘岸邊
    this.pond.forEach((k) => {
      const [gx, gy] = k.split(',').map(Number);
      const p = iso(gx, gy);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      [[1, 0, [p.x, p.y - HH], [p.x + HW, p.y]], [0, -1, [p.x - HW, p.y], [p.x, p.y - HH]]].forEach(([dx, dy, a, bb]) => {
        if (!this.pond.has(key(gx + dx, gy + dy))) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(bb[0], bb[1]);
          ctx.stroke();
        }
      });
    });
    // 道路：人行道＋柏油
    this.road.forEach((cc) => {
      const p = iso(cc.gx, cc.gy);
      diamondPath(ctx, p.x, p.y, 1.02);
      ctx.fillStyle = '#e4dccb';
      ctx.fill();
    });
    this.road.forEach((cc) => {
      const p = iso(cc.gx, cc.gy);
      diamondPath(ctx, p.x, p.y, 0.84);
      ctx.fillStyle = '#8f8b84';
      ctx.fill();
    });
    // 道路之間接起來（避免人行道把柏油切斷）
    ctx.strokeStyle = '#8f8b84';
    ctx.lineWidth = HH * 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.road.forEach((cc, i) => {
      const p = iso(cc.gx, cc.gy);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    this.ground = { canvas: c, minX, minY, S };
  };

  // ---------- 各種物件 ----------
  function drawPads(ctx, g) {
    g.board.forEach((t, i) => {
      const c = W.road[i];
      const p = iso(c.gx, c.gy);
      const owner = g.ownerOf(t);
      const color = t.type === 'land' ? RG.DISTRICTS.find((d) => d.id === t.district).color : PAD_COLORS[t.type] || '#ccc';
      hexPad(ctx, p.x, p.y, color, owner ? owner.color : null);
      if (t.type === 'suit') label(ctx, RG.SUITS[t.suit].icon, p.x, p.y - 2, 24, ['heart', 'diamond'].includes(t.suit) ? '#e33' : '#222', '#fff');
      else if (t.type !== 'land') emoji(ctx, RG.TILE_TYPES[t.type].icon, p.x, p.y - 3, 20, false);
      else if (owner) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 11, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = owner.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const picking = W.pickTiles && W.pickTiles.includes(i);
      if (picking || W.focusTile === i) {
        const a = picking ? 0.55 + 0.4 * Math.sin(W.t * 6) : 1;
        diamondPath(ctx, p.x, p.y, 1.0);
        ctx.strokeStyle = `rgba(255,214,0,${a})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    });
  }

  function drawLotBase(ctx, g, t, i) {
    const c = W.lots[i];
    const p = iso(c.gx, c.gy);
    const owner = g.ownerOf(t);
    diamondPath(ctx, p.x, p.y, 0.94);
    if (t.type === 'land') {
      const dc = RG.DISTRICTS.find((d) => d.id === t.district).color;
      ctx.fillStyle = owner ? (t.level >= 3 ? '#dcd6c8' : '#efe6cf') : '#a8de84';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = owner ? owner.color : dc;
      ctx.stroke();
      if (owner && t.level >= 1 && t.level <= 2) {
        // 小庭院
        diamondPath(ctx, p.x - HW * 0.42, p.y + HH * 0.18, 0.28);
        ctx.fillStyle = '#9ad67a';
        ctx.fill();
      }
      emoji(ctx, RG.ELEMENTS[t.element].icon, p.x - HW * 0.6, p.y + 2, 13, false);
    } else {
      ctx.fillStyle = '#ece4cf';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,90,40,0.45)';
      ctx.stroke();
    }
    const picking = W.pickTiles && W.pickTiles.includes(i);
    if (picking || W.focusTile === i) {
      const a = picking ? 0.55 + 0.4 * Math.sin(W.t * 6) : 1;
      diamondPath(ctx, p.x, p.y, 0.94);
      ctx.strokeStyle = `rgba(255,214,0,${a})`;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  const LEVEL_SPEC = [
    null,
    { f: 0.42, h: 22, pyramid: 20, rows: 1, cols: 1, door: true, awning: true },
    { f: 0.5, h: 38, pyramid: 22, rows: 2, cols: 2, door: true, awning: true },
    { f: 0.56, h: 60, rows: 3, cols: 2, rim: true, tank: true },
    { f: 0.6, h: 90, rows: 5, cols: 3, rim: true, ac: true },
    { f: 0.62, h: 118, rows: 7, cols: 3, rim: true, crown: true },
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
        ctx.fillRect(p.x - 2, p.y - 26, 4, 28);
        roundRect(ctx, p.x - 26, p.y - 48, 52, 24, 6);
        ctx.fillStyle = '#fffaf0';
        ctx.fill();
        ctx.strokeStyle = '#7a4a1c';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.font = `900 13px ${FONT}`;
        ctx.fillStyle = '#c0392b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$' + t.price, p.x, p.y - 36);
        topY = p.y - 48;
      } else if (t.level === 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        diamondPath(ctx, p.x, p.y, 0.6);
        ctx.stroke();
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(p.x - 1.5, p.y - 40, 3, 40);
        const wave = Math.sin(W.t * 4 + i) * 2;
        poly(ctx, [[p.x + 1, p.y - 40], [p.x + 26, p.y - 33 + wave], [p.x + 1, p.y - 25]], owner.color, '#fff', 2);
        topY = p.y - 42;
      } else {
        const s = LEVEL_SPEC[t.level];
        const wall = t.level >= 3 ? shade(owner.color, 0.72) : '#fff4dc';
        const roof = t.level >= 3 ? shade(owner.color, -0.15) : owner.color;
        topY = box(ctx, p.x, p.y + 4, s.f, s.h, wall, roof, {
          pyramid: s.pyramid, rows: s.rows, cols: s.cols, door: s.door, awning: s.awning ? shade(owner.color, 0.2) : null,
          rim: s.rim, glass: t.level >= 4 ? '#7cc6ff' : '#a8dcff',
        });
        if (s.tank) {
          box(ctx, p.x + 8, topY + 2, 0.12, 12, '#d9d4c7', '#bdb6a6', { noShadow: true });
        }
        if (s.ac) {
          box(ctx, p.x - 10, topY + 3, 0.1, 6, '#eeeeee', '#cfcfcf', { noShadow: true });
          box(ctx, p.x + 10, topY + 3, 0.1, 6, '#eeeeee', '#cfcfcf', { noShadow: true });
        }
        if (s.crown) {
          const t2 = box(ctx, p.x, topY + 2, 0.36, 22, shade(owner.color, 0.6), shade(owner.color, -0.25), { rows: 1, cols: 2, noShadow: true, glass: '#7cc6ff' });
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, t2);
          ctx.lineTo(p.x, t2 - 24);
          ctx.stroke();
          ctx.fillStyle = Math.sin(W.t * 4) > 0 ? '#ff4040' : '#ffb0b0';
          ctx.beginPath();
          ctx.arc(p.x, t2 - 25, 3.2, 0, Math.PI * 2);
          ctx.fill();
          // 地主旗
          const wave = Math.sin(W.t * 4 + i) * 2;
          poly(ctx, [[p.x, t2 - 20], [p.x + 18, t2 - 15 + wave], [p.x, t2 - 10]], owner.color, '#fff', 1.5);
          topY = t2 - 28;
        }
      }
      if (t.guardian) {
        const gc = RG.card(t.guardian.id);
        const gx = p.x + HW * 0.52, gy = p.y + 6;
        ctx.beginPath();
        ctx.ellipse(gx, gy + 2, 15, 6.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = RG.ELEMENTS[gc.element].color;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        emoji(ctx, gc.icon, gx, gy - 15 + Math.sin(W.t * 3 + i) * 1.5, 28, true);
        const pct = t.guardian.hp / t.guardian.maxHp;
        roundRect(ctx, gx - 15, gy + 7, 30, 6, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        roundRect(ctx, gx - 15, gy + 7, Math.max(3, 30 * pct), 6, 3);
        ctx.fillStyle = pct < 0.4 ? '#ff5a5a' : '#48d17a';
        ctx.fill();
      }
      return topY;
    }
    const icon = t.type === 'suit' ? null : RG.TILE_TYPES[t.type].icon;
    switch (t.type) {
      case 'bank':
        topY = box(ctx, p.x, p.y + 4, 0.72, 58, '#fff1c9', '#f3b53f', { rows: 2, cols: 3, door: true, rim: true });
        // 柱子
        [0.25, 0.5, 0.75].forEach((u) => {
          const x0 = p.x - HW * 0.72 + HW * 0.72 * u, y0 = p.y + 4 + HH * 0.72 * u;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(x0 - 2, y0 - 40, 4, 38);
        });
        break;
      case 'hospital':
        topY = box(ctx, p.x, p.y + 4, 0.66, 50, '#ffffff', '#ff6b6b', { rows: 2, cols: 2, door: true, rim: true });
        break;
      case 'broker':
        topY = box(ctx, p.x, p.y + 4, 0.55, 78, '#dff1ff', '#3aa0ff', { rows: 5, cols: 2, glass: '#5fb7ff', rim: true });
        break;
      case 'news':
        topY = box(ctx, p.x, p.y + 4, 0.36, 66, '#e3e8ff', '#5b7cfa', { rows: 4, cols: 1 });
        break;
      case 'shop':
        topY = box(ctx, p.x, p.y + 4, 0.52, 28, '#fff4dc', '#b06cf0', { pyramid: 16, rows: 1, cols: 2, door: true, awning: '#ffd23f' });
        break;
      case 'points':
        topY = box(ctx, p.x, p.y + 4, 0.4, 24, '#e6fffb', '#3cc6c0', { pyramid: 14, door: true, awning: '#ff7aa8' });
        break;
      case 'temple':
        topY = box(ctx, p.x, p.y + 4, 0.5, 10, '#d9cdb0', '#bfb08e', {});
        break;
      case 'monster': {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(p.x + 10, p.y + 6, 50, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        const gr = ctx.createLinearGradient(p.x, p.y - 30, p.x, p.y);
        gr.addColorStop(0, '#8a6b58');
        gr.addColorStop(1, '#5b4336');
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 46, 30, 0, Math.PI, 0);
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(p.x + 6, p.y, 17, 13, 0, Math.PI, 0);
        ctx.fillStyle = '#1d1510';
        ctx.fill();
        const glow = 0.5 + 0.5 * Math.sin(W.t * 3 + i);
        ctx.fillStyle = `rgba(255,60,40,${glow})`;
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y - 6, 1.8, 0, Math.PI * 2);
        ctx.arc(p.x + 10, p.y - 6, 1.8, 0, Math.PI * 2);
        ctx.fill();
        topY = p.y - 30;
        break;
      }
      case 'magic': {
        const a = 0.35 + 0.25 * Math.sin(W.t * 3);
        diamondPath(ctx, p.x, p.y, 0.7);
        ctx.fillStyle = `rgba(155,89,255,${a})`;
        ctx.fill();
        ctx.strokeStyle = '#d7b8ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const ang = W.t * 1.5 + (k * Math.PI) / 2;
          ctx.fillStyle = '#f3e6ff';
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 15 - 10 - Math.sin(W.t * 3 + k) * 6, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        topY = p.y - 8;
        break;
      }
      default:
        topY = box(ctx, p.x, p.y + 4, 0.34, 12, '#f2ead6', '#e0d4b4', {});
    }
    const bob = Math.sin(W.t * 2 + i) * 2;
    if (t.type === 'suit') label(ctx, RG.SUITS[t.suit].icon, p.x, topY - 22 + bob, 40, ['heart', 'diamond'].includes(t.suit) ? '#ff3b3b' : '#222', '#fff');
    else emoji(ctx, icon, p.x, topY - 20 + bob, ['temple', 'chance', 'monster'].includes(t.type) ? 44 : 30, true);
    return topY - 40;
  }

  function drawTree(ctx, d) {
    const p = iso(d.gx, d.gy);
    const sway = Math.sin(W.t * 1.3 + d.gx * 2 + d.gy) * 1.2;
    if (d.kind === 'tree' || d.kind === 'pine') {
      const s = 0.8 + d.v * 0.5;
      ctx.fillStyle = 'rgba(20,60,10,0.16)';
      ctx.beginPath();
      ctx.ellipse(p.x + 6 * s, p.y + 4, 18 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(p.x - 3, p.y - 14 * s, 6, 16 * s);
      if (d.kind === 'pine') {
        [0, 1, 2].forEach((k) => {
          const w = (20 - k * 5) * s, y0 = p.y - (10 + k * 13) * s;
          poly(ctx, [[p.x - w + sway, y0], [p.x + w + sway, y0], [p.x + sway * 1.5, y0 - 20 * s]], k % 2 ? '#2f8a45' : '#379c4f');
        });
        return;
      }
      const green = d.v > 0.6 ? '#3f9e3a' : '#4bb04a';
      const gr = ctx.createRadialGradient(p.x - 6 * s + sway, p.y - 34 * s, 2, p.x + sway, p.y - 26 * s, 20 * s);
      gr.addColorStop(0, shade(green, 0.35));
      gr.addColorStop(1, shade(green, -0.12));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(p.x + sway, p.y - 26 * s, 17 * s, 0, Math.PI * 2);
      ctx.arc(p.x - 9 * s + sway, p.y - 20 * s, 11 * s, 0, Math.PI * 2);
      ctx.arc(p.x + 9 * s + sway, p.y - 20 * s, 11 * s, 0, Math.PI * 2);
      ctx.fill();
      if (d.v > 0.85) {
        ctx.fillStyle = '#ff5a4a';
        [[-6, -28], [5, -22], [2, -34]].forEach(([ox, oy]) => {
          ctx.beginPath();
          ctx.arc(p.x + ox * s + sway, p.y + oy * s, 2.4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else if (d.kind === 'bush') {
      ctx.fillStyle = '#5fb84c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, 18, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7fd466';
      ctx.beginPath();
      ctx.ellipse(p.x - 5, p.y - 8, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ['#ff7aa8', '#ffd84d', '#ffffff', '#b58cff'].forEach((c, k) => {
        ctx.fillStyle = '#4c9a3a';
        ctx.fillRect(p.x - 13 + k * 9, p.y - 3 + (k % 2) * 4, 1.5, 6);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x - 12 + k * 9, p.y - 4 + (k % 2) * 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // 紙片人立牌（快取）
  function standee(p) {
    const k = `standee|${p.icon}|${p.color}`;
    let c = W.sprites.get(k);
    if (c) return c;
    const w = 56, h = 70;
    c = mkCanvas(w * SPR, h * SPR);
    const x = c.getContext('2d');
    x.scale(SPR, SPR);
    roundRect(x, 4, 4, w - 8, h - 12, 14);
    x.fillStyle = '#fff';
    x.shadowColor = 'rgba(0,0,0,0.3)';
    x.shadowBlur = 4;
    x.shadowOffsetY = 2;
    x.fill();
    x.shadowColor = 'transparent';
    roundRect(x, 8, 8, w - 16, h - 20, 11);
    const gr = x.createLinearGradient(0, 8, 0, h - 12);
    gr.addColorStop(0, shade(p.color, 0.55));
    gr.addColorStop(1, p.color);
    x.fillStyle = gr;
    x.fill();
    x.font = `36px ${EMOJI}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(p.icon, w / 2, h / 2 - 5);
    W.sprites.set(k, c);
    return c;
  }

  function drawPlayer(ctx, g, p, offset) {
    const d = W.disp[p.id];
    const w = iso(d.gx, d.gy);
    const x = w.x + offset, y = w.y - d.hop;
    const cur = g.turnPlayer === p;
    // 影子（跳越高越小）
    const k = 1 - Math.min(0.5, d.hop / 40);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(w.x + offset, w.y + 5, 20 * k, 8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    // 底座
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 17, 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(p.color, -0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 17, 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 立牌：輕微搖擺，落地時擠壓
    const sway = Math.sin(W.t * (cur ? 5 : 2) + p.id) * (cur ? 0.07 : 0.03);
    const squash = d.hop > 0 ? 1 + d.hop / 120 : 1;
    const img = standee(p);
    const sw = img.width / SPR, sh = img.height / SPR;
    ctx.save();
    ctx.translate(x, y + 2);
    ctx.rotate(sway);
    ctx.scale(1 / squash, squash);
    ctx.drawImage(img, -sw / 2, -sh + 4, sw, sh);
    ctx.restore();
    const marks = [];
    if (p.god) marks.push(RG.GODS[p.god.type].icon);
    if (p.status.sleep) marks.push('💤');
    if (p.status.turtle) marks.push('🐢');
    if (p.status.hospital) marks.push('🩹');
    marks.forEach((m, j) => emoji(ctx, m, x + 24 + j * 16, y - 58 + Math.sin(W.t * 3 + j) * 2, 17, true));
    if (cur) {
      const by = y - 78 + Math.sin(W.t * 6) * 4;
      poly(ctx, [[x - 10, by - 9], [x + 10, by - 9], [x, by + 4]], p.color, '#fff', 2.5);
    }
  }

  function drawClouds(ctx) {
    const W0 = W.canvas.width, H0 = W.canvas.height;
    W.clouds.forEach((c) => {
      const px = (((c.x + W.t * c.v) % 1.6) - 0.3) * W0 - W.cam.x * 0.05 * W.dpr;
      const py = c.y * H0 - W.cam.y * 0.03 * W.dpr;
      const s = c.s * 60 * W.dpr;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(px, py, s, s * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(px - s * 0.6, py + s * 0.1, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(px + s * 0.55, py + s * 0.08, s * 0.6, s * 0.35, 0, 0, Math.PI * 2);
      ctx.ellipse(px + s * 0.1, py - s * 0.25, s * 0.5, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---------- 每幀 ----------
  W.frame = function () {
    const g = RG.UI.game;
    const ctx = this.ctx;
    const now = performance.now();
    g.players.forEach((p) => {
      const d = this.disp[p.id];
      if (!d) return;
      const tw = this.tweens[p.id];
      if (tw) {
        const k = Math.min(1, (now - tw.t0) / tw.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        d.gx = tw.from.gx + (tw.to.gx - tw.from.gx) * e;
        d.gy = tw.from.gy + (tw.to.gy - tw.from.gy) * e;
        d.hop = Math.sin(k * Math.PI) * 20;
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
    sky.addColorStop(0, '#6cc6ff');
    sky.addColorStop(0.7, '#bfe9ff');
    sky.addColorStop(1, '#e6f7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    drawClouds(ctx);
    const c = this.center();
    const z = this.cam.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (c.x - this.cam.x * z), this.dpr * (c.y - this.cam.y * z));

    // 靜態地面
    const G = this.ground;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.canvas, G.minX, G.minY, G.canvas.width / G.S, G.canvas.height / G.S);
    // 水面波光與睡蓮
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    this.pond.forEach((k) => {
      const [gx, gy] = k.split(',').map(Number);
      const p = iso(gx, gy);
      const s = Math.sin(this.t * 2 + gx + gy) * 7;
      ctx.beginPath();
      ctx.moveTo(p.x - 16 + s, p.y + 3);
      ctx.lineTo(p.x + 2 + s, p.y + 3);
      ctx.stroke();
    });
    this.lilies.forEach(([gx, gy], k) => {
      const p = iso(gx, gy);
      ctx.fillStyle = '#4fb85a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + Math.sin(this.t + k) * 1.5, 11, 5, 0, 0.3, Math.PI * 2 - 0.1);
      ctx.lineTo(p.x, p.y);
      ctx.fill();
      if (k === 1) {
        ctx.fillStyle = '#ffb3d1';
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y - 2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    drawPads(ctx, g);
    g.board.forEach((t, i) => drawLotBase(ctx, g, t, i));

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
              const halo = ctx.createRadialGradient(p.x, p.y - 30 + b, 4, p.x, p.y - 30 + b, 34);
              halo.addColorStop(0, 'rgba(255,245,170,0.8)');
              halo.addColorStop(1, 'rgba(255,245,170,0)');
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(p.x, p.y - 30 + b, 34, 0, Math.PI * 2);
              ctx.fill();
              emoji(ctx, RG.GODS[t.god].icon, p.x, p.y - 30 + b, 36, true);
            }
          },
        });
      }
    });
    const groups = {};
    g.players.forEach((p) => {
      if (!p.bankrupt) (groups[p.pos] = groups[p.pos] || []).push(p);
    });
    Object.values(groups).forEach((arr) => {
      arr.forEach((p, k) => {
        const off = (k - (arr.length - 1) / 2) * 28;
        const d = this.disp[p.id];
        if (d) objs.push({ depth: d.gx + d.gy + 0.3 + k * 0.01, draw: () => drawPlayer(ctx, g, p, off) });
      });
    });
    objs.sort((a, b) => a.depth - b.depth);
    objs.forEach((o) => o.draw());

    // 煙塵
    this.puffs = this.puffs.filter((f) => now - f.t0 < 900);
    this.puffs.forEach((f) => {
      const k = (now - f.t0) / 900;
      const p = iso(f.gx, f.gy);
      ctx.globalAlpha = 1 - k;
      for (let n = 0; n < 8; n++) {
        const a = (Math.PI * 2 * n) / 8;
        ctx.fillStyle = n % 2 ? f.color : '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 44 * k, p.y - 20 + Math.sin(a) * 22 * k - 34 * k, 8 * (1 - k) + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 星星
      emoji(ctx, '✨', p.x, p.y - 60 - 20 * k, 24, false);
      ctx.globalAlpha = 1;
    });
    // 金幣
    this.coins = this.coins.filter((c2) => now - c2.t0 < 1100);
    this.coins.forEach((c2) => {
      const k = (now - c2.t0) / 1000;
      if (k < 0) return;
      const d = this.disp[c2.pid];
      if (!d) return;
      const p = iso(d.gx, d.gy);
      const x = p.x + c2.vx * k, y = p.y - 60 + c2.vy * k + 380 * k * k;
      ctx.globalAlpha = k > 0.8 ? (1.1 - k) / 0.3 : 1;
      const spin = Math.abs(Math.cos(k * 14 + c2.vx));
      ctx.fillStyle = '#f5b800';
      ctx.beginPath();
      ctx.ellipse(x, y, 7 * spin + 1, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a86f00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.ellipse(x - 1, y - 1, 3 * spin + 0.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    // 金錢飄字
    this.floats = this.floats.filter((f) => now - f.t0 < 1600);
    this.floats.forEach((f) => {
      const k = (now - f.t0) / 1600;
      if (k < 0) return;
      const d = this.disp[f.pid];
      if (!d) return;
      const p = iso(d.gx, d.gy);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const pop = k < 0.12 ? 0.7 + (k / 0.12) * 0.3 : 1;
      label(ctx, f.text, p.x, p.y - 96 - k * 46, 24 * pop, f.color, '#2a1a08');
      ctx.globalAlpha = 1;
    });
  };

  return W;
})();
