// 畫面繪製：棋盤、手牌、玩家、股市
var RG = (globalThis.RG = globalThis.RG || {});

RG.UI = {
  game: null,
  speed: 1,
  pick: null,
  action: null,
  handOwner: null,

  h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  mount(game) {
    this.game = game;
    const app = document.getElementById('app');
    app.innerHTML = '';
    const root = this.h(`
      <div class="game">
        <div class="main-col">
          <div class="board-wrap"><div class="board" id="board"></div></div>
          <div class="hand-bar" id="hand-bar"></div>
        </div>
        <aside class="side">
          <section class="panel"><h2>玩家 <small id="round-info"></small></h2><div class="players" id="players"></div></section>
          <section class="panel"><h2>股市 <small>Fortune Street 商圈股</small></h2><div id="stocks"></div></section>
          <section class="panel"><h2>圖例</h2><div class="legend" id="legend"></div></section>
        </aside>
      </div>`);
    app.appendChild(root);
    const board = document.getElementById('board');
    this.tileEls = game.board.map((t) => {
      const el = document.createElement('div');
      const pos = RG.tileGridPos(t.idx);
      el.className = 'tile';
      el.tabIndex = 0;
      el.style.gridColumn = pos.col;
      el.style.gridRow = pos.row;
      el.addEventListener('click', () => this.onTileClick(t.idx));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.onTileClick(t.idx);
        }
      });
      board.appendChild(el);
      return el;
    });
    const center = this.h(`
      <div class="center">
        <div class="brand"><h1>群英大富翁</h1><span class="round num" id="round-label"></span></div>
        <div class="turn-bar">
          <div class="turn-who" id="turn-who"></div>
          <div class="dice" id="dice"></div>
          <div class="actions" id="actions"></div>
        </div>
        <div class="log" id="log" aria-live="polite"></div>
      </div>`);
    board.appendChild(center);
    this.logEl = document.getElementById('log');
    document.getElementById('legend').innerHTML = [
      ...Object.values(RG.ELEMENTS).slice(0, 4).map((e) => `<span>${e.icon} ${e.name}屬性地</span>`),
      '<span>🏠→🏙️ 建築 1～5 層</span>',
      '<span>🚧 路障</span>',
      ...Object.values(RG.GODS).map((g) => `<span>${g.icon} ${g.name}</span>`),
    ].join('');
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.action && !document.querySelector('.overlay')) {
        e.preventDefault();
        this.resolveAction({ type: 'roll' });
      }
    });
    this.render();
  },

  // ---------- 格子 ----------
  tileHTML(t) {
    const g = this.game;
    const tokens = g.players
      .filter((p) => !p.bankrupt && p.pos === t.idx)
      .map((p) => `<span class="token ${g.turnPlayer === p ? 'active' : ''}" style="--c:${p.color}" title="${p.name}">${p.icon}</span>`)
      .join('');
    const badges = [t.god ? RG.GODS[t.god].icon : '', t.block ? '🚧' : ''].join('');
    const badge = badges ? `<span class="t-badge">${badges}</span>` : '';
    if (t.type === 'land') {
      const d = RG.DISTRICTS.find((x) => x.id === t.district);
      const owner = g.ownerOf(t);
      const guard = t.guardian ? `<span class="t-guard">${RG.card(t.guardian.id).icon}<small>${t.guardian.hp}</small></span>` : '';
      const money = owner ? `<span class="num">${RG.U.money(g.toll(t))}</span>` : `<span class="num">${RG.U.money(t.price)}</span>`;
      return `<span class="stripe" style="background:${d.color}"></span>
        <span class="t-name">${t.name}</span>
        <span class="t-meta"><span class="t-el">${RG.ELEMENTS[t.element].icon}</span>${money}</span>
        <span class="t-build">${RG.LEVEL_ICONS[t.level]}</span>
        ${guard}${badge}<span class="t-tokens">${tokens}</span>`;
    }
    const icon = t.type === 'suit' ? `<span style="color:${['heart', 'diamond'].includes(t.suit) ? '#d63b3b' : '#1d2433'}">${RG.SUITS[t.suit].icon}</span>` : RG.TILE_TYPES[t.type].icon;
    return `<span class="t-icon">${icon}</span><span class="t-name">${t.name}</span>${badge}<span class="t-tokens">${tokens}</span>`;
  },

  renderBoard() {
    const g = this.game;
    g.board.forEach((t, i) => {
      const el = this.tileEls[i];
      const owner = g.ownerOf(t);
      const corner = [0, 10, 20, 30].includes(i);
      el.className = `tile ${t.type === 'land' ? 'land' : 'special'} ${corner ? 'corner' : ''} ${owner ? 'owned' : ''}`;
      if (owner) el.style.setProperty('--owner', owner.color);
      else el.style.removeProperty('--owner');
      if (this.pick) {
        if (this.pick.tiles.includes(i)) el.classList.add('pickable');
        else el.classList.add('dim');
      }
      if (this.focusTile === i) el.classList.add('focus');
      el.innerHTML = this.tileHTML(t);
      el.setAttribute('aria-label', this.tileLabel(t));
    });
  },
  tileLabel(t) {
    if (t.type !== 'land') return t.name;
    const o = this.game.ownerOf(t);
    return `${t.name}，${o ? `${o.name}的${RG.LEVEL_NAMES[t.level]}` : `空地 ${RG.U.money(t.price)}`}`;
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
      const banner = this.h(`<div class="pick-banner"><span>${RG.U.esc(title)}</span><button class="btn small">取消</button></div>`);
      banner.querySelector('button').onclick = () => {
        this.endPick();
        resolve(null);
      };
      document.body.appendChild(banner);
      this.pick.banner = banner;
      this.renderBoard();
    });
  },
  endPick() {
    if (this.pick && this.pick.banner) this.pick.banner.remove();
    this.pick = null;
    this.renderBoard();
  },

  // ---------- 中央 ----------
  renderCenter() {
    const g = this.game;
    const p = g.turnPlayer;
    document.getElementById('round-label').textContent = `第 ${g.round} / ${g.config.maxRounds} 回合`;
    document.getElementById('round-info').textContent = `目標資產 ${RG.U.money(g.config.target)}`;
    const who = document.getElementById('turn-who');
    who.innerHTML = p
      ? `<span class="avatar" style="--c:${p.color}">${p.icon}</span><span>${p.name}${p.isCPU ? '<small style="color:var(--muted);font-weight:400">（電腦）</small>' : ''}</span>`
      : '';
    const actions = document.getElementById('actions');
    if (this.action) {
      const p2 = this.action.p;
      const left = g.cardLimit(p2) - p2.turn.cardsUsed;
      actions.innerHTML = '';
      const roll = this.h(`<button class="btn primary">🎲 擲骰子</button>`);
      roll.onclick = () => this.resolveAction({ type: 'roll' });
      const stocks = this.h(`<button class="btn">📈 賣股票</button>`);
      stocks.onclick = () => this.resolveAction({ type: 'stocks' });
      const info = this.h(`<span style="font-size:12px;color:var(--muted)">可用卡片 ${Math.max(0, left)} 張・Enter 擲骰</span>`);
      actions.append(info, stocks, roll);
      roll.focus({ preventScroll: true });
    } else actions.innerHTML = '';
  },

  // ---------- 手牌 ----------
  cardHTML(id, cls = '') {
    const c = RG.card(id);
    const tc = RG.CARD_TYPES[c.type].color;
    let stat = '';
    if (c.type === 'creature') stat = `ST ${c.st}・HP ${c.hp}`;
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
    let p = g.turnPlayer && !g.turnPlayer.isCPU ? g.turnPlayer : this.handOwner && !this.handOwner.bankrupt ? this.handOwner : humans[0];
    if (!p) {
      bar.innerHTML = `<div class="hand-head"><span>觀戰模式：全部都是電腦玩家</span></div>`;
      return;
    }
    this.handOwner = p;
    const canPlay = this.action && this.action.p === p && p.turn.cardsUsed < g.cardLimit(p);
    const cards = p.hand
      .map((id, idx) => {
        const u = g.cardUsable(p, id);
        const cls = canPlay && u.ok ? 'playable' : '';
        return this.cardHTML(id, cls).replace('<button ', `<button data-idx="${idx}" `);
      })
      .join('');
    bar.innerHTML = `<div class="hand-head"><span><b>${p.icon} ${p.name} 的手牌</b>　${p.hand.length}/${RG.HAND_LIMIT}　牌庫 ${p.deck.length}　棄牌 ${p.discard.length}</span>
      <span>🎟️ 點券 ${p.points}　點卡片看說明／使用</span></div>
      <div class="hand">${cards || '<span class="hand-empty">沒有手牌</span>'}</div>`;
    bar.querySelectorAll('.card').forEach((el) => {
      el.onclick = () => RG.Dialogs.cardDetail(p, +el.dataset.idx);
    });
  },

  // ---------- 側欄 ----------
  renderPlayers() {
    const g = this.game;
    document.getElementById('players').innerHTML = g.players
      .map((p) => {
        const s = g.stats(p);
        const hpPct = Math.round((p.hp / s.hp) * 100);
        const suits = Object.entries(RG.SUITS)
          .map(([k, v]) => `<span class="${p.suits[k] ? 'on' : ''} ${k === 'heart' || k === 'diamond' ? 'red' : ''}">${v.icon}</span>`)
          .join('');
        const chips = [];
        if (p.god) chips.push(`<span class="chip ${RG.GODS[p.god.type].good ? 'good' : 'bad'}">${RG.GODS[p.god.type].icon}${RG.GODS[p.god.type].name} ${p.god.turns}</span>`);
        if (p.status.hospital) chips.push(`<span class="chip bad">🏥 ${p.status.hospital}</span>`);
        if (p.status.sleep) chips.push(`<span class="chip bad">💤</span>`);
        if (p.status.turtle) chips.push(`<span class="chip bad">🐢 ${p.status.turtle}</span>`);
        if (p.dir < 0) chips.push(`<span class="chip">↺ 逆行</span>`);
        const job = RG.JOBS[p.job];
        return `<div class="pcard ${g.turnPlayer === p ? 'current' : ''} ${p.bankrupt ? 'bankrupt' : ''}" style="--c:${p.color}">
          <span class="avatar">${p.icon}</span>
          <span class="p-name">${p.name}<small>${job.icon}${job.name} Lv${p.level}${p.isCPU ? '・電腦' : ''}</small></span>
          <span class="p-cash num">${RG.U.money(p.cash)}</span>
          <span class="p-row"><span class="hpbar ${hpPct < 35 ? 'low' : ''}" title="HP ${p.hp}/${s.hp}"><i style="width:${hpPct}%"></i></span><span class="num">${p.hp}/${s.hp}</span></span>
          <span class="p-worth num">資產 ${RG.U.money(g.netWorth(p))}</span>
          <span class="p-row full"><span class="suits">${suits}</span><span>🃏${p.hand.length}</span><span>🎟️${p.points}</span><span>🏠${g.landsOf(p).length}</span>${chips.join('')}</span>
        </div>`;
      })
      .join('');
  },

  sparkline(hist, color) {
    const w = 64, h = 20;
    if (hist.length < 2) return '';
    const min = Math.min(...hist), max = Math.max(...hist);
    const span = max - min || 1;
    const pts = hist.map((v, i) => [(i / (hist.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="${d}L${last[0].toFixed(1)},${h}L2,${h}Z" fill="${color}" fill-opacity="0.15"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2" fill="${color}"/></svg>`;
  },

  renderStocks() {
    const g = this.game;
    const me = this.handOwner;
    const rows = RG.DISTRICTS.map((d) => {
      const price = g.stockPrice(d.id);
      const hist = g.market[d.id].history.concat([price]);
      const prev = hist.length > 1 ? hist[hist.length - 2] : price;
      const cls = price > prev ? 'up' : price < prev ? 'down' : '';
      const arrow = price > prev ? '▲' : price < prev ? '▼' : '';
      const holders = g.players.filter((p) => p.stocks[d.id] > 0).map((p) => `<span title="${p.name} ${p.stocks[d.id]} 股">${p.icon}${p.stocks[d.id]}</span>`).join(' ');
      return `<tr><td><span class="dot" style="background:${d.color}"></span>${d.stock}</td>
        <td>${this.sparkline(hist.slice(-16), d.color)}</td>
        <td class="r num ${cls}">${arrow}${price}</td><td class="r" style="font-size:11px">${holders || '<span style="color:var(--muted)">—</span>'}</td></tr>`;
    }).join('');
    document.getElementById('stocks').innerHTML = `<table class="stocks"><thead><tr><th>股票</th><th>走勢</th><th class="r">股價</th><th class="r">持股</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="font-size:11.5px;color:var(--muted);margin-top:6px">在銀行或證券所可買股票，隨時可賣。${me ? '' : ''}有人在該商圈付過路費時，股東依持股領股利。</div>`;
  },

  render() {
    if (!this.game) return;
    this.renderBoard();
    this.renderCenter();
    this.renderHand();
    this.renderPlayers();
    this.renderStocks();
  },

  log(msg, cls) {
    if (!this.logEl) return;
    const div = document.createElement('div');
    if (cls) div.className = 'l-' + cls;
    div.textContent = msg;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 250) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  },

  // ---------- 行動階段 ----------
  actionPhase(p) {
    return new Promise((resolve) => {
      this.action = { p, resolve };
      this.handOwner = p;
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

  showDice(values, rolling) {
    const el = document.getElementById('dice');
    if (!el) return;
    el.innerHTML = values.map((v) => `<span class="die ${rolling ? 'rolling' : ''}" aria-label="${v} 點">${v}</span>`).join('');
  },
};
