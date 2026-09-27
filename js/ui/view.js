// 遊戲畫面 HUD（大富翁8 風格）：日期欄、訊息列、角色頭像、手牌、圓形按鈕；地圖由 RG.World 繪製
var RG = (globalThis.RG = globalThis.RG || {});

RG.UI = {
  game: null,
  speed: 1,
  pick: null,
  action: null,
  handOwner: null,
  focusTile: null,
  lastCash: {},
  lastLevel: [],

  h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  mount(game) {
    this.game = game;
    this.pick = null;
    this.action = null;
    this.focusTile = null;
    this.lastCash = {};
    this.lastLevel = [];
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="stage">
        <canvas id="world" aria-label="遊戲地圖：拖曳移動、滾輪縮放、點格子看資訊"></canvas>
        <div class="hud-top">
          <div class="datebox" id="datebox"></div>
          <div class="ticker" id="ticker" aria-live="polite"></div>
          <div class="minis" id="minis"></div>
        </div>
        <div class="banner" id="banner" hidden></div>
        <div class="dice-stage" id="dice" hidden></div>
        <div class="hud-bottom">
          <div class="me" id="me"></div>
          <div class="tray" id="hand-bar"></div>
          <div class="btns" id="actions"></div>
        </div>
        <div class="log-drawer" id="log-drawer" hidden>
          <div class="ld-head"><b>📜 訊息紀錄</b><button class="rbtn small" id="log-close" aria-label="關閉訊息紀錄">✕</button></div>
          <div class="log" id="log"></div>
        </div>
      </div>`;
    this.logEl = document.getElementById('log');
    document.getElementById('log-close').onclick = () => (document.getElementById('log-drawer').hidden = true);
    RG.World.mount(document.getElementById('world'));
    if (!this._keys) {
      this._keys = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.action && !document.querySelector('.overlay')) {
          e.preventDefault();
          this.resolveAction({ type: 'roll' });
        }
      });
    }
    this.render();
  },

  // ---------- 地圖互動 ----------
  renderBoard() {
    RG.World.focusTile = this.focusTile;
    RG.World.pickTiles = this.pick ? this.pick.tiles : null;
  },
  onTileClick(i) {
    if (this.pick) {
      if (this.pick.tiles.includes(i)) {
        const res = this.pick.resolve;
        this.endPick();
        res(i);
      }
      return;
    }
    RG.Dialogs.tileInfo(this.game.board[i]);
  },
  startPick(title, tiles) {
    return new Promise((resolve) => {
      this.pick = { tiles, resolve };
      const banner = this.h(`<div class="pick-banner"><span>👆 ${RG.U.esc(title)}<small>（地圖上發亮的格子，可拖曳地圖）</small></span><button class="rbtn small">取消</button></div>`);
      banner.querySelector('button').onclick = () => {
        this.endPick();
        resolve(null);
      };
      document.body.appendChild(banner);
      this.pick.banner = banner;
      if (tiles.length === 1) RG.World.lookAt(tiles[0]);
      RG.World.free = tiles.length === 1 ? false : RG.World.free;
      this.renderBoard();
    });
  },
  endPick() {
    if (this.pick && this.pick.banner) this.pick.banner.remove();
    this.pick = null;
    this.renderBoard();
  },

  // ---------- 上方：日期、訊息、玩家列表 ----------
  dateText(round) {
    const d = new Date(2026, 0, round);
    const wd = '日一二三四五六'[d.getDay()];
    return { md: `${d.getMonth() + 1}月${d.getDate()}日`, wd: `星期${wd}` };
  },
  renderTop() {
    const g = this.game;
    const dt = this.dateText(g.round);
    document.getElementById('datebox').innerHTML = `<b>${dt.md}</b><span>${dt.wd}</span><small>第 ${g.round} 天／${g.config.maxRounds} 天</small>`;
    document.getElementById('minis').innerHTML = g.players
      .map(
        (p) => `<div class="mini ${g.turnPlayer === p ? 'on' : ''} ${p.bankrupt ? 'out' : ''}" style="--c:${p.color}" title="${p.name}：資產 ${RG.U.money(g.netWorth(p))}">
          <span class="face">${p.icon}</span><span class="mini-txt"><b>${p.name}</b><span class="num">${RG.U.money(p.cash)}</span></span></div>`
      )
      .join('');
  },

  // ---------- 左下：目前角色 ----------
  renderMe() {
    const g = this.game;
    const p = g.turnPlayer || g.players[0];
    const s = g.stats(p);
    const hpPct = Math.round((p.hp / s.hp) * 100);
    const suits = Object.entries(RG.SUITS)
      .map(([k, v]) => `<span class="${p.suits[k] ? 'on' : ''} ${k === 'heart' || k === 'diamond' ? 'red' : ''}">${v.icon}</span>`)
      .join('');
    const chips = [];
    if (p.god) chips.push(`<span class="chip ${RG.GODS[p.god.type].good ? 'good' : 'bad'}">${RG.GODS[p.god.type].icon}${RG.GODS[p.god.type].name} ${p.god.turns}</span>`);
    if (p.status.hospital) chips.push(`<span class="chip bad">🏥住院 ${p.status.hospital}</span>`);
    if (p.status.sleep) chips.push('<span class="chip bad">💤冬眠</span>');
    if (p.status.turtle) chips.push(`<span class="chip bad">🐢 ${p.status.turtle}</span>`);
    if (p.dir < 0) chips.push('<span class="chip">↺逆行</span>');
    const job = RG.JOBS[p.job];
    document.getElementById('me').innerHTML = `
      <div class="portrait" style="--c:${p.color}"><span>${p.icon}</span><em>${job.icon} Lv${p.level}</em></div>
      <div class="me-info">
        <div class="me-name" style="--c:${p.color}">${p.name}<small>${job.name}${p.isCPU ? '・電腦' : ''}</small></div>
        <div class="me-row"><span class="lbl">現金</span><b class="money num">${RG.U.money(p.cash)}</b></div>
        <div class="me-row"><span class="lbl">資產</span><span class="num">${RG.U.money(g.netWorth(p))}</span><span class="lbl">點券</span><span class="num">${p.points}</span></div>
        <div class="me-row"><span class="lbl">HP</span><span class="hpbar ${hpPct < 35 ? 'low' : ''}"><i style="width:${hpPct}%"></i></span><span class="num small">${p.hp}/${s.hp}</span></div>
        <div class="me-row"><span class="suits">${suits}</span>${chips.join('')}</div>
      </div>`;
  },

  // ---------- 手牌 ----------
  cardHTML(id, cls = '') {
    const c = RG.card(id);
    const tc = RG.CARD_TYPES[c.type].color;
    let stat = '';
    if (c.type === 'creature') stat = `ST${c.st} HP${c.hp}`;
    else if (c.type === 'item') stat = c.desc;
    else if (c.type === 'tool') stat = c.target === 'passive' ? '被動' : '擲骰前';
    else stat = '擲骰前';
    const cost = c.type === 'tool' ? '' : c.cost ? `$${c.cost}` : '免費';
    const el = c.element ? `<span class="c-el">${RG.ELEMENTS[c.element].icon}</span>` : '';
    return `<button class="card ${cls}" style="--tc:${tc}" data-id="${c.id}" title="${RG.U.esc(this.cardDesc(c))}">
      <span class="c-type">${RG.CARD_TYPES[c.type].name}</span>${el}<span class="c-cost">${cost}</span>
      <span class="c-icon">${c.icon}</span><span class="c-name">${c.name}</span><span class="c-stat">${stat}</span></button>`;
  },
  cardDesc(c) {
    if (c.type === 'creature') {
      const ab = (c.abilities || []).map((a) => `${RG.ABILITIES[a].name}：${RG.ABILITIES[a].desc}`).join('；');
      return `${RG.ELEMENTS[c.element].name}屬性生物　ST ${c.st} / HP ${c.hp}　召喚 $${c.cost}${ab ? `\n${ab}` : ''}\n停在自己的地產可派駐為守護獸；停在對手有守護獸的地產可用來侵略。`;
    }
    if (c.type === 'item') return `${c.desc}（$${c.cost}）\n侵略或防守戰鬥時使用。${c.grant ? `\n${RG.ABILITIES[c.grant].name}：${RG.ABILITIES[c.grant].desc}` : ''}`;
    if (c.type === 'tool') return `${c.desc}\n卡片屋售價 🎟️${c.shop}`;
    return `${c.desc}（$${c.cost}）`;
  },
  renderHand() {
    const g = this.game;
    const bar = document.getElementById('hand-bar');
    const humans = g.players.filter((p) => !p.isCPU && !p.bankrupt);
    const p = g.turnPlayer && !g.turnPlayer.isCPU ? g.turnPlayer : this.handOwner && !this.handOwner.bankrupt && !this.handOwner.isCPU ? this.handOwner : humans[0];
    if (!p) {
      bar.innerHTML = '<div class="tray-head"><span>👀 觀戰模式：全部都是電腦玩家</span></div>';
      return;
    }
    this.handOwner = p;
    const canPlay = this.action && this.action.p === p && p.turn.cardsUsed < g.cardLimit(p);
    const cards = p.hand
      .map((id, idx) => {
        const u = g.cardUsable(p, id);
        return this.cardHTML(id, canPlay && u.ok ? 'playable' : '').replace('<button ', `<button data-idx="${idx}" `);
      })
      .join('');
    bar.innerHTML = `<div class="tray-head"><span>${p.icon} <b>${p.name}</b> 的卡片 ${p.hand.length}/${RG.HAND_LIMIT}</span><span>牌庫 ${p.deck.length}・棄牌 ${p.discard.length}</span></div>
      <div class="hand">${cards || '<span class="hand-empty">沒有卡片</span>'}</div>`;
    bar.querySelectorAll('.card').forEach((el) => (el.onclick = () => RG.Dialogs.cardDetail(p, +el.dataset.idx)));
  },

  // ---------- 右下：圓形按鈕 ----------
  renderActions() {
    const g = this.game;
    const box = document.getElementById('actions');
    const act = this.action;
    const tp = g.turnPlayer;
    let rollLabel = '擲骰';
    if (!act && tp) rollLabel = tp.isCPU ? '思考中' : '進行中';
    const left = act ? g.cardLimit(act.p) - act.p.turn.cardsUsed : 0;
    box.innerHTML = `
      <button class="rbtn roll ${act ? 'ready' : ''}" data-a="roll" ${act ? '' : 'disabled'} aria-label="擲骰子"><span class="dico">🎲</span><b>${rollLabel}</b></button>
      <div class="rgrid">
        <button class="rbtn" data-a="stocks" aria-label="股市"><span>📈</span><small>股市</small></button>
        <button class="rbtn" data-a="log" aria-label="訊息紀錄"><span>📜</span><small>訊息</small></button>
        <button class="rbtn" data-a="cam" aria-label="鏡頭回到角色"><span>🎯</span><small>視角</small></button>
        <button class="rbtn" data-a="menu" aria-label="選單"><span>☰</span><small>選單</small></button>
        <button class="rbtn" data-a="zin" aria-label="放大"><span>＋</span></button>
        <button class="rbtn" data-a="zout" aria-label="縮小"><span>－</span></button>
      </div>
      ${act ? `<div class="hint">還可用 ${Math.max(0, left)} 張卡・Enter 擲骰</div>` : ''}`;
    box.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => this.onButton(b.dataset.a);
    });
    if (act) box.querySelector('.roll').focus({ preventScroll: true });
  },
  onButton(a) {
    const W = RG.World;
    switch (a) {
      case 'roll':
        return this.resolveAction({ type: 'roll' });
      case 'stocks':
        if (this.action) return this.resolveAction({ type: 'stocks' });
        return RG.Dialogs.marketView();
      case 'log': {
        const d = document.getElementById('log-drawer');
        d.hidden = !d.hidden;
        if (!d.hidden) this.logEl.scrollTop = this.logEl.scrollHeight;
        return;
      }
      case 'cam':
        W.free = false;
        return;
      case 'zin':
        return W.setZoom(W.cam.zoom * 1.2);
      case 'zout':
        return W.setZoom(W.cam.zoom / 1.2);
      case 'menu':
        return RG.Dialogs.menu();
    }
  },

  render() {
    if (!this.game || !document.getElementById('me')) return;
    const g = this.game;
    // 金錢變化 → 地圖上的漂浮數字；建築變化 → 煙塵
    g.players.forEach((p) => {
      const prev = this.lastCash[p.id];
      if (prev != null && prev !== p.cash && !p.bankrupt) {
        const d = p.cash - prev;
        RG.World.floatText(p, `${d > 0 ? '+' : '-'}${RG.U.money(Math.abs(d))}`, d > 0 ? '#7dff9a' : '#ff8f8f');
      }
      this.lastCash[p.id] = p.cash;
    });
    g.board.forEach((t, i) => {
      if (t.type !== 'land') return;
      const sig = `${t.owner}|${t.level}|${t.guardian ? t.guardian.id : ''}`;
      if (this.lastLevel[i] != null && this.lastLevel[i] !== sig) RG.World.puff(i);
      this.lastLevel[i] = sig;
    });
    this.renderBoard();
    this.renderTop();
    this.renderMe();
    this.renderHand();
    this.renderActions();
  },

  log(msg, cls) {
    if (!this.logEl) return;
    const div = document.createElement('div');
    if (cls) div.className = 'l-' + cls;
    div.textContent = msg;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 300) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    if (cls === 'turn') return;
    const tk = document.getElementById('ticker');
    if (tk) {
      tk.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'tick ' + (cls ? 'l-' + cls : '');
      span.textContent = msg;
      tk.appendChild(span);
    }
  },

  async banner(p) {
    const el = document.getElementById('banner');
    if (!el) return;
    el.innerHTML = `<span class="b-face" style="--c:${p.color}">${p.icon}</span><span><b>${p.name}</b> 的回合</span>`;
    el.style.setProperty('--c', p.color);
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => (el.hidden = true), 1300);
  },

  // ---------- 行動階段 ----------
  actionPhase(p) {
    return new Promise((resolve) => {
      this.action = { p, resolve };
      this.handOwner = p;
      RG.World.free = false;
      this.render();
    });
  },
  resolveAction(act) {
    if (!this.action) return;
    const r = this.action.resolve;
    this.action = null;
    this.render();
    r(act);
  },

  // 大骰子
  pips(v) {
    const map = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    if (!map[v]) return `<span class="die"><b class="big">${v}</b></span>`;
    return `<span class="die ${v === 1 ? 'one' : ''}">${Array.from({ length: 9 }, (_, k) => `<i class="${map[v].includes(k) ? 'p' : ''}"></i>`).join('')}</span>`;
  },
  showDice(values, rolling) {
    const el = document.getElementById('dice');
    if (!el) return;
    clearTimeout(this._diceT);
    if (!values.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = 'dice-stage' + (rolling ? ' rolling' : ' done');
    const total = values.reduce((a, b) => a + b, 0);
    el.innerHTML = `<div class="dice-row">${values.map((v) => this.pips(v)).join('')}</div>${rolling ? '' : `<div class="dice-total">${total} 步</div>`}`;
    if (!rolling) this._diceT = setTimeout(() => (el.hidden = true), 1300);
  },

  sparkline(hist, color) {
    const w = 72, h = 22;
    if (hist.length < 2) return '';
    const min = Math.min(...hist), max = Math.max(...hist);
    const span = max - min || 1;
    const pts = hist.map((v, i) => [(i / (hist.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="${d}L${last[0].toFixed(1)},${h}L2,${h}Z" fill="${color}" fill-opacity="0.18"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/></svg>`;
  },
};
