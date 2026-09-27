// 對話框與遊戲 IO（人類玩家的所有選擇都經過這裡）
var RG = (globalThis.RG = globalThis.RG || {});

RG.Dialogs = {
  speaker(p, suffix = '') {
    return p ? `<div class="speaker" style="--c:${p.color}"><span class="face">${p.icon}</span><b>${RG.U.esc(p.name)}</b>${suffix ? `<span>${suffix}</span>` : ''}</div>` : '';
  },

  open(inner, opts = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay' + (opts.passive ? ' passive' : '') + (opts.low ? ' low' : '');
    const dlg = document.createElement('div');
    dlg.className = 'dialog' + (opts.wide ? ' wide' : '');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    if (typeof inner === 'string') dlg.innerHTML = inner;
    else dlg.appendChild(inner);
    overlay.appendChild(dlg);
    document.getElementById('modal-root').appendChild(overlay);
    if (opts.dismiss) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    }
    const onKey = (e) => {
      if (e.key === 'Escape' && opts.dismiss) close();
    };
    document.addEventListener('keydown', onKey);
    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (opts.onClose) opts.onClose();
    }
    setTimeout(() => {
      const f = dlg.querySelector('.btn.primary, .option:not(:disabled), .btn');
      if (f) f.focus({ preventScroll: true });
    }, 30);
    return { overlay, dlg, close };
  },

  toast(html, ms = 2200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = html;
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => el.remove(), ms * Math.max(0.6, RG.UI.speed));
  },

  focusTile(idx) {
    RG.UI.focusTile = idx;
    RG.UI.renderBoard();
  },

  choose(p, o) {
    return new Promise((resolve) => {
      if (o.tile != null) this.focusTile(o.tile);
      const who = this.speaker(p);
      const html = `${who}<h3>${RG.U.esc(o.title)}</h3>${o.text ? `<p class="d-text">${RG.U.esc(o.text)}</p>` : ''}
        <div class="options">${o.options
          .map((op, i) => `<button class="option" data-i="${i}" ${op.disabled ? 'disabled' : ''}><span>${RG.U.esc(op.label)}</span>${op.sub ? `<span class="o-sub">${RG.U.esc(op.sub)}</span>` : ''}</button>`)
          .join('')}</div>
        ${o.cancelable ? '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-cancel>取消</button></div>' : ''}`;
      const d = this.open(html, { low: o.tile != null });
      const done = (v) => {
        RG.UI.focusTile = null;
        d.close();
        RG.UI.renderBoard();
        resolve(v);
      };
      d.dlg.querySelectorAll('.option').forEach((b) => (b.onclick = () => done(o.options[+b.dataset.i].id)));
      const c = d.dlg.querySelector('[data-cancel]');
      if (c) c.onclick = () => done(null);
    });
  },

  notify(title, text) {
    return new Promise((resolve) => {
      const d = this.open(`<h3>${RG.U.esc(title)}</h3><p class="d-text">${RG.U.esc(text)}</p><div class="row end"><button class="btn primary">確定</button></div>`);
      d.dlg.querySelector('button').onclick = () => {
        d.close();
        resolve();
      };
    });
  },

  pickHandCard(p, o) {
    return new Promise((resolve) => {
      if (o.tile != null) this.focusTile(o.tile);
      const cards = p.hand
        .map((id, idx) => {
          const ok = !o.filter || o.filter(id);
          return RG.UI.cardHTML(id, ok ? 'playable' : 'disabled').replace('<button ', `<button data-idx="${idx}" ${ok ? '' : 'disabled'} `);
        })
        .join('');
      const html = `${this.speaker(p)}<h3>${RG.U.esc(o.title)}</h3>
        <div class="pick-cards">${cards}</div><p class="d-sub" id="pc-desc">點選發亮的卡片。</p>
        <div class="row end">${o.allowNone ? '<button class="btn" data-none>不使用</button>' : ''}</div>`;
      const d = this.open(html, { wide: true, low: o.tile != null });
      const done = (v) => {
        RG.UI.focusTile = null;
        d.close();
        RG.UI.renderBoard();
        resolve(v);
      };
      d.dlg.querySelectorAll('.card:not([disabled])').forEach((el) => (el.onclick = () => done(+el.dataset.idx)));
      d.dlg.querySelectorAll('.card').forEach((el) => {
        el.onmouseenter = () => (d.dlg.querySelector('#pc-desc').textContent = RG.UI.cardDesc(RG.card(el.dataset.id)));
      });
      const n = d.dlg.querySelector('[data-none]');
      if (n) n.onclick = () => done(null);
    });
  },

  pickPlayer(p, o) {
    return this.choose(p, {
      title: o.title,
      options: o.players.map((q) => ({
        id: String(q.id),
        label: `${q.icon} ${q.name}${q === p ? '（自己）' : ''}`,
        sub: `現金 ${RG.U.money(q.cash)}・資產 ${RG.U.money(RG.UI.game.netWorth(q))}・手牌 ${q.hand.length}`,
      })),
      cancelable: true,
    }).then((id) => (id == null ? null : RG.UI.game.players[+id]));
  },

  cardDetail(p, idx) {
    const g = RG.UI.game;
    const id = p.hand[idx];
    if (!id) return;
    const c = RG.card(id);
    const u = g.cardUsable(p, id);
    const inAction = RG.UI.action && RG.UI.action.p === p;
    const canPlay = inAction && p.turn.cardsUsed < g.cardLimit(p);
    let reason = '';
    if (!inAction) reason = '只能在自己回合擲骰前使用。';
    else if (!canPlay) reason = `本回合已用完可使用的卡片（${g.cardLimit(p)} 張）。`;
    else if (!u.ok) reason = u.reason;
    const html = `<div class="card-flash">${RG.UI.cardHTML(id)}<div><h3>${c.name}</h3><p class="d-text">${RG.U.esc(RG.UI.cardDesc(c))}</p>
      ${reason ? `<p class="d-sub">${RG.U.esc(reason)}</p>` : ''}</div></div>
      <div class="row end"><button class="btn" data-close>關閉</button>${canPlay && u.ok ? '<button class="btn primary" data-use>使用</button>' : ''}</div>`;
    const d = this.open(html, { dismiss: true });
    d.dlg.querySelector('[data-close]').onclick = () => d.close();
    const use = d.dlg.querySelector('[data-use]');
    if (use)
      use.onclick = () => {
        d.close();
        RG.UI.resolveAction({ type: 'card', idx });
      };
  },

  tileInfo(t) {
    const g = RG.UI.game;
    this.focusTile(t.idx);
    let body = '';
    if (t.type === 'land') {
      const d = RG.DISTRICTS.find((x) => x.id === t.district);
      const o = g.ownerOf(t);
      const rows = [
        ['商圈', `${d.name}（股票：${d.stock}，現價 ${g.stockPrice(d.id)}）`],
        ['屬性', `${RG.ELEMENTS[t.element].icon} ${RG.ELEMENTS[t.element].name}`],
        ['地主', o ? `${o.icon} ${o.name}` : '無（價格 ' + RG.U.money(t.price) + '）'],
        ['建築', `${RG.LEVEL_NAMES[t.level]}（${t.level}/5 層）`],
        ['地產價值', RG.U.money(g.landValue(t))],
      ];
      if (o) {
        const bd = g.tollBreakdown(t);
        rows.push(['過路費', `<b>${RG.U.money(bd.total)}</b>`]);
        rows.push([
          '計算',
          `基本 ${RG.U.money(bd.base)} × 商圈 ${bd.district.mult.toFixed(2)}（${bd.district.owned}/${bd.district.total} 塊）× 屬性連鎖 ${bd.chain.mult.toFixed(2)}（${bd.chain.count} 塊）× 守護獸 ${bd.guardian.toFixed(1)}${bd.notes.length ? '・' + bd.notes.join('・') : ''}`,
        ]);
      }
      if (t.guardian) {
        const c = RG.card(t.guardian.id);
        const bonus = c.element === t.element && t.element !== 'neutral' ? 10 * (t.level + 1) : 0;
        rows.push(['守護獸', `${c.icon} ${c.name}　ST ${c.st}／HP ${t.guardian.hp}/${t.guardian.maxHp}${bonus ? `（地形加成 +${bonus}）` : ''}${(c.abilities || []).map((a) => `・${RG.ABILITIES[a].name}`).join('')}`]);
      } else if (o) rows.push(['守護獸', '無：可被 5 倍價值強制收購、購地卡、換地卡']);
      body = `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    } else {
      const tt = RG.TILE_TYPES[t.type];
      body = `<p class="d-text">${tt.desc}</p>`;
    }
    if (t.god) body += `<p class="d-text">${RG.GODS[t.god].icon} ${RG.GODS[t.god].name}在這裡：${RG.GODS[t.god].desc}經過或停留就會附身。</p>`;
    if (t.block) body += '<p class="d-text">🚧 這裡有路障，經過時會被擋下。</p>';
    const d = this.open(`<h3>${t.type === 'suit' ? RG.SUITS[t.suit].icon : ''}${t.name}</h3>${body}<div class="row end"><button class="btn">關閉</button></div>`, {
      dismiss: true,
      low: true,
      onClose: () => {
        RG.UI.focusTile = null;
        RG.UI.renderBoard();
      },
    });
    d.dlg.querySelector('button').onclick = () => d.close();
  },

  stockDialog(p, o) {
    const g = RG.UI.game;
    return new Promise((resolve) => {
      const d = this.open('<div></div>', { wide: true });
      const draw = () => {
        const rows = RG.DISTRICTS.map((dd) => {
          const price = g.stockPrice(dd.id);
          const own = p.stocks[dd.id];
          const maxBuy = Math.min(RG.MAX_SHARES - own, Math.floor(p.cash / price));
          const info = g.districtInfo(p.id, dd.id);
          const buy = o.canBuy
            ? [1, 10, 50].map((n) => `<button class="btn small" data-b="${dd.id}" data-n="${n}" ${maxBuy < n ? 'disabled' : ''}>買${n}</button>`).join('') +
              `<button class="btn small" data-b="${dd.id}" data-n="${maxBuy}" ${maxBuy < 1 ? 'disabled' : ''}>買滿</button>`
            : '';
          const sell = [1, 10].map((n) => `<button class="btn small" data-s="${dd.id}" data-n="${n}" ${own < n ? 'disabled' : ''}>賣${n}</button>`).join('') +
            `<button class="btn small" data-s="${dd.id}" data-n="${own}" ${own < 1 ? 'disabled' : ''}>全賣</button>`;
          return `<tr><td><span class="dot" style="background:${dd.color}"></span>${dd.stock}<div class="d-sub">你在此有 ${info.owned}/${info.total} 塊地</div></td>
            <td class="r num">${price}</td><td class="r num">${own}</td><td class="r num">${RG.U.money(own * price)}</td>
            <td><div class="row" style="gap:4px">${buy}${sell}</div></td></tr>`;
        }).join('');
        d.dlg.innerHTML = `${RG.Dialogs.speaker(p)}<h3>📈 股市${o.canBuy ? '' : '（只能賣出）'}</h3>
          <p class="d-sub">現金 <b class="num" style="color:var(--gold)">${RG.U.money(p.cash)}</b>・每個商圈最多持有 ${RG.MAX_SHARES} 股。一次買賣 10 股以上會推動股價。
          有人在該商圈付過路費時，每股可領過路費 0.5% 的股利（最多 25%）。地產加蓋會帶動股價上漲。</p>
          <div style="overflow-x:auto"><table class="stocks"><thead><tr><th>股票</th><th class="r">股價</th><th class="r">持股</th><th class="r">市值</th><th>交易</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="row end" style="margin-top:12px"><button class="btn primary" data-close>完成</button></div>`;
        d.dlg.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => {
          g.buyStock(p, b.dataset.b, +b.dataset.n);
          RG.UI.render();
          draw();
        }));
        d.dlg.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
          g.sellStock(p, b.dataset.s, +b.dataset.n);
          RG.UI.render();
          draw();
        }));
        d.dlg.querySelector('[data-close]').onclick = () => {
          d.close();
          resolve();
        };
      };
      draw();
    });
  },

  tollNotice(p, t, bd) {
    return new Promise((resolve) => {
      const g = RG.UI.game;
      const o = g.ownerOf(t);
      const html = `${this.speaker(p)}<h3>💰 支付過路費給 ${o.icon}${o.name}</h3>
        <p class="d-text">「${t.name}」${RG.LEVEL_NAMES[t.level]}</p>
        <dl class="kv"><dt>基本</dt><dd class="num">${RG.U.money(bd.base)}</dd>
        <dt>商圈加成</dt><dd>×${bd.district.mult.toFixed(2)}（持有 ${bd.district.owned}/${bd.district.total}）</dd>
        <dt>屬性連鎖</dt><dd>×${bd.chain.mult.toFixed(2)}（${RG.ELEMENTS[t.element].icon} ${bd.chain.count} 塊）</dd>
        <dt>守護獸</dt><dd>×${bd.guardian.toFixed(1)}</dd>
        ${bd.notes.length ? `<dt>神明/職業</dt><dd>${bd.notes.join('、')}</dd>` : ''}
        <dt>合計</dt><dd><b class="num" style="color:var(--gold);font-size:18px">${RG.U.money(bd.total)}</b></dd></dl>
        <div class="row end"><button class="btn primary">付款</button></div>`;
      const d = this.open(html);
      d.dlg.querySelector('button').onclick = () => {
        d.close();
        resolve();
      };
    });
  },

  invadeDialog(p, t) {
    const g = RG.UI.game;
    return new Promise((resolve) => {
      const gc = RG.card(t.guardian.id);
      let ci = null, ii = null;
      const d = this.open('<div></div>', { wide: true, low: true });
      RG.Dialogs.focusTile(t.idx);
      const draw = () => {
        const bonusFor = (a) => (gc.element === t.element && t.element !== 'neutral' && !(a && (a.abilities || []).includes('pierce')) ? 10 * (t.level + 1) : 0);
        const cards = p.hand
          .map((id, idx) => {
            const c = RG.card(id);
            let ok = false;
            if (c.type === 'creature') ok = !(c.abilities || []).includes('wall') && c.cost <= p.cash;
            if (c.type === 'item') ok = ci != null && c.cost + RG.card(p.hand[ci]).cost <= p.cash;
            const cls = (idx === ci || idx === ii ? 'selected ' : '') + (ok ? 'playable' : 'disabled');
            return RG.UI.cardHTML(id, cls).replace('<button ', `<button data-idx="${idx}" ${ok ? '' : 'disabled'} `);
          })
          .join('');
        let preview = '選擇一張生物卡（可再加一張道具卡）。';
        if (ci != null) {
          const a = RG.card(p.hand[ci]);
          const it = ii != null ? RG.card(p.hand[ii]) : null;
          const st = a.st + (it ? it.st : 0) + (p.turn.boost ? 10 : 0);
          const hp = a.hp + (it ? it.hp : 0);
          const dhp = t.guardian.hp + bonusFor(a);
          const cost = a.cost + (it ? it.cost : 0);
          const firstD = (gc.abilities || []).includes('first') && !(a.abilities || []).includes('first') && !(it && it.grant === 'first') && p.job !== 'ninja';
          preview = `你的 ${a.name}${it ? '＋' + it.name : ''}：ST ${st} / HP ${hp}　vs　${gc.name}：ST ${gc.st} / HP ${dhp}（對手可能再加道具）\n${firstD ? '⚠️ 對手有先制，會先攻擊。' : '你先攻擊。'}${st >= dhp ? '一擊就能打倒守護獸！' : '無法一擊打倒，需要承受反擊。'}　花費 ${RG.U.money(cost)}`;
        }
        d.dlg.innerHTML = `${RG.Dialogs.speaker(p)}<h3>⚔️ 侵略「${t.name}」？</h3>
          <p class="d-text">守護獸 ${gc.icon} ${gc.name}（${RG.ELEMENTS[gc.element].icon}）ST ${gc.st}／HP ${t.guardian.hp}/${t.guardian.maxHp}${bonusFor(null) ? `，屬性相同地形加成 +${bonusFor(null)} HP` : ''}
過路費 ${RG.U.money(g.toll(t, p))}。侵略成功就能奪下這塊地（含建築），失敗仍要付過路費。</p>
          <div class="pick-cards">${cards}</div><p class="d-text" style="color:var(--gold)">${RG.U.esc(preview)}</p>
          <div class="row end"><button class="btn" data-no>不侵略，付過路費</button><button class="btn primary" data-go ${ci == null ? 'disabled' : ''}>發動侵略</button></div>`;
        d.dlg.querySelectorAll('.card:not([disabled])').forEach((el) => {
          el.onclick = () => {
            const idx = +el.dataset.idx;
            const c = RG.card(p.hand[idx]);
            if (c.type === 'creature') {
              ci = ci === idx ? null : idx;
              ii = null;
            } else ii = ii === idx ? null : idx;
            draw();
          };
        });
        d.dlg.querySelector('[data-no]').onclick = () => finish(null);
        d.dlg.querySelector('[data-go]').onclick = () => finish({ creatureIdx: ci, itemIdx: ii });
      };
      const finish = (v) => {
        RG.UI.focusTile = null;
        d.close();
        RG.UI.renderBoard();
        resolve(v);
      };
      draw();
    });
  },

  invasionResult(p, t, res) {
    return new Promise((resolve) => {
      const title = res.result === 'win' ? `🚩 ${p.name} 侵略成功！` : res.result === 'lose' ? '🛡️ 侵略失敗' : '⚔️ 雙方僵持';
      const d = this.open(`<h3>${title}</h3><div class="blog">${res.lines.map((l) => `<div>${RG.U.esc(l)}</div>`).join('')}</div><div class="row end"><button class="btn primary">確定</button></div>`);
      d.dlg.querySelector('button').onclick = () => {
        d.close();
        resolve();
      };
    });
  },

  // ---------- Dokapon 戰鬥畫面 ----------
  fighterHTML(f) {
    const pct = Math.round((f.hp / f.maxHp) * 100);
    return `<div class="f-icon">${f.icon}</div><div class="f-name">${f.name}</div>
      <div class="hpbar ${pct < 35 ? 'low' : ''}" style="margin:6px 0"><i style="width:${pct}%"></i></div>
      <div class="f-stats num">HP ${f.hp}/${f.maxHp}</div>
      <div class="f-stats num">攻 ${f.atk}${f.boost ? '🔥' : ''} 防 ${f.def} 魔 ${f.mag} 速 ${f.spd}</div>
      ${f.job ? `<div class="f-stats">${RG.JOBS[f.job].icon}${RG.JOBS[f.job].name}</div>` : ''}`;
  },
  battleOpen(ctx) {
    const d = this.open(`<h3>${RG.U.esc(ctx.title)}</h3>
      <div class="battle"><div class="fighter" data-f="A"></div><div class="vs">VS</div><div class="fighter" data-f="B"></div></div>
      <div class="blog" data-log><div>速度較快的一方先攻。雙方各攻擊兩次，HP 歸零者落敗。</div></div>
      <div data-cmds></div>
      <div class="rps">⚔️攻擊 被 🛡️防禦 減半・💥重擊 會被 🔁反擊 反彈・✴️魔法 被 🔰魔防 削弱</div>`, { wide: true });
    ctx.dlg = d;
    this.battleDraw(ctx);
  },
  battleDraw(ctx) {
    const d = ctx.dlg;
    d.dlg.querySelector('[data-f="A"]').innerHTML = this.fighterHTML(ctx.A);
    d.dlg.querySelector('[data-f="B"]').innerHTML = this.fighterHTML(ctx.B);
    const log = d.dlg.querySelector('[data-log]');
    log.innerHTML = ['<div>速度較快的一方先攻。雙方各攻擊兩次，HP 歸零者落敗。</div>', ...ctx.lines.map((l) => `<div>${RG.U.esc(l)}</div>`)].join('');
    log.scrollTop = log.scrollHeight;
  },
  battleCommand(p, ctx, kind, me) {
    return new Promise((resolve) => {
      const box = ctx.dlg.dlg.querySelector('[data-cmds]');
      const other = me === ctx.A ? ctx.B : ctx.A;
      let cmds;
      if (kind === 'attack') {
        cmds = Object.entries(RG.ATTACK_CMDS).map(([id, c]) => {
          let name = c.name, desc = c.desc, dis = false;
          if (id === 'skill') {
            const j = RG.JOBS[me.job];
            name = j.skill.name;
            desc = j.skill.desc;
            dis = me.skillUsed;
          }
          return { id, icon: c.icon, name, desc, dis };
        });
      } else cmds = Object.entries(RG.DEFENSE_CMDS).map(([id, c]) => ({ id, icon: c.icon, name: c.name, desc: c.desc }));
      box.innerHTML = `<p class="d-text" style="margin-bottom:8px"><b>${me.icon}${me.name}</b>：${kind === 'attack' ? `輪到你攻擊 ${other.name}，選擇招式` : `${other.name} 要攻擊你了！猜猜對方招式，選擇應對`}（第 ${ctx.round} 輪）</p>
        <div class="cmds">${cmds.map((c) => `<button class="cmd" data-c="${c.id}" ${c.dis ? 'disabled' : ''}><b>${c.icon} ${c.name}</b><small>${c.desc}</small></button>`).join('')}</div>`;
      box.querySelectorAll('.cmd').forEach((b) => {
        b.onclick = () => {
          box.innerHTML = '';
          resolve(b.dataset.c);
        };
      });
      const first = box.querySelector('.cmd');
      if (first) first.focus({ preventScroll: true });
    });
  },
  async battleUpdate(ctx, { att, dfd, r }) {
    this.battleDraw(ctx);
    const el = ctx.dlg.dlg.querySelector(`[data-f="${(r.back ? att : dfd) === ctx.A ? 'A' : 'B'}"]`);
    if (r.dmg || r.back) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
    await RG.U.sleep(ctx.human ? 900 : 650 * RG.UI.speed);
  },
  battleClose(ctx) {
    return new Promise((resolve) => {
      this.battleDraw(ctx);
      const box = ctx.dlg.dlg.querySelector('[data-cmds]');
      box.innerHTML = `<div class="row end"><b style="margin-right:auto;font-size:17px">${RG.U.esc(ctx.result)}</b><button class="btn primary">繼續</button></div>`;
      const done = () => {
        ctx.dlg.close();
        resolve();
      };
      box.querySelector('button').onclick = done;
      if (!ctx.human) setTimeout(done, 1100 * RG.UI.speed);
    });
  },

  marketView() {
    const g = RG.UI.game;
    const rows = RG.DISTRICTS.map((d) => {
      const price = g.stockPrice(d.id);
      const hist = g.market[d.id].history.concat([price]);
      const prev = hist.length > 1 ? hist[hist.length - 2] : price;
      const cls = price > prev ? 'up' : price < prev ? 'down' : '';
      const arrow = price > prev ? '▲' : price < prev ? '▼' : '－';
      const holders = g.players.filter((p) => p.stocks[d.id] > 0).map((p) => `${p.icon}${p.stocks[d.id]}`).join(' ');
      const owners = g.board.filter((t) => t.district === d.id && t.owner != null).map((t) => g.players[t.owner].icon).join('');
      return `<tr><td><span class="dot" style="background:${d.color}"></span>${d.stock}<div class="d-sub">${d.name} 地主：${owners || '無'}</div></td>
        <td>${RG.UI.sparkline(hist.slice(-16), d.color)}</td><td class="r num ${cls}">${arrow} ${price}</td><td class="r">${holders || '—'}</td></tr>`;
    }).join('');
    const d = this.open(`<h3>📈 股市行情</h3><p class="d-sub">在銀行或證券所可買股票，自己回合擲骰前可賣。有人在商圈付過路費時，股東每股分得 0.5% 股利（最多 25%）。</p>
      <div style="overflow-x:auto"><table class="stocks"><thead><tr><th>股票</th><th>走勢</th><th class="r">股價</th><th class="r">持股</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row end" style="margin-top:12px"><button class="btn primary">關閉</button></div>`, { wide: true, dismiss: true });
    d.dlg.querySelector('.btn.primary').onclick = () => d.close();
  },

  menu() {
    const d = this.open(`<h3>☰ 選單</h3><div class="options">
      <button class="option" data-m="save"><span>💾 存檔</span><span class="o-sub">存到欄位，或匯出存檔碼</span></button>
      <button class="option" data-m="load"><span>📂 讀取存檔</span><span class="o-sub">自動存檔、欄位或匯入存檔碼</span></button>
      <button class="option" data-m="rules"><span>📜 規則說明</span><span class="o-sub">四款遊戲的系統怎麼結合</span></button>
      <button class="option" data-m="speed"><span>⏩ 電腦速度：${RG.UI.speed < 0.5 ? '快' : RG.UI.speed > 1.2 ? '慢' : '中'}</span><span class="o-sub">點一下切換 慢 / 中 / 快</span></button>
      <button class="option" data-m="title"><span>🏠 回到標題畫面</span><span class="o-sub">進度保留在自動存檔，可從標題「繼續遊戲」</span></button>
      <button class="option" data-m="close"><span>▶️ 繼續遊戲</span></button></div>`, { dismiss: true });
    d.dlg.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        const m = b.dataset.m;
        d.close();
        if (m === 'rules') RG.Setup.rules();
        if (m === 'save') this.saveMenu();
        if (m === 'load') this.loadMenu();
        if (m === 'speed') {
          RG.UI.speed = RG.UI.speed < 0.5 ? 1.6 : RG.UI.speed > 1.2 ? 1 : 0.35;
          this.menu();
        }
        if (m === 'title') {
          if (RG.UI.game) RG.UI.game.aborted = true;
          RG.Setup.show();
        }
      };
    });
  },

  gameOver(ranking, winner) {
    const g = RG.UI.game;
    const rows = ranking
      .map((p, i) => `<tr><td>${i + 1}</td><td>${p.icon} ${p.name}${p.bankrupt ? '（破產）' : ''}</td><td>${RG.JOBS[p.job].name} Lv${p.level}</td><td class="r num">${RG.U.money(g.netWorth(p))}</td></tr>`)
      .join('');
    const d = this.open(`<h3>🏆 ${winner.icon} ${winner.name} 獲勝！</h3><p class="d-text">${RG.U.esc(g.winReason || '')}・共 ${g.round} 回合</p>
      <table class="stocks"><thead><tr><th>名次</th><th>玩家</th><th>職業</th><th class="r">總資產</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row end" style="margin-top:14px"><button class="btn" data-view>查看棋盤</button><button class="btn primary" data-again>再玩一局</button></div>`);
    d.dlg.querySelector('[data-view]').onclick = () => d.close();
    d.dlg.querySelector('[data-again]').onclick = () => {
      d.close();
      RG.Setup.show();
    };
  },
};

// 把遊戲引擎的 IO 介面接到畫面上
RG.makeIO = function () {
  const UI = RG.UI, D = RG.Dialogs, U = RG.U;
  const human = (p) => p && !p.isCPU;
  const io = {
    log: (m, c) => UI.log(m, c),
    render: () => UI.render(),
    pause: (ms) => U.sleep(ms * UI.speed),
    toast: (m) => D.toast(U.esc(m)),
    async turnStart(p) {
      UI.showDice([]);
      UI.banner(p);
      if (human(p) && UI.game.players.filter((q) => !q.isCPU && !q.bankrupt).length > 1) {
        D.toast(`輪到 ${p.icon} ${p.name}`);
      }
      await U.sleep(p.isCPU ? 250 * UI.speed : 100);
    },
    async moveStep(p) {
      await RG.World.walk(p, p.isCPU ? Math.max(90, 200 * UI.speed) : 210);
    },
    async showDice(p, values) {
      for (let k = 0; k < 6; k++) {
        UI.showDice(values.map(() => 1 + U.rand(6)), true);
        await U.sleep(55);
      }
      UI.showDice(values, false);
      await U.sleep(p.isCPU ? 300 * UI.speed : 350);
    },
    async notify(p, title, text, global) {
      if (human(p)) return D.notify(title, text);
      if (global) D.toast(`<b>${U.esc(title)}</b><br>${U.esc(text)}`, 3200);
      else D.toast(`${p.icon} ${U.esc(p.name)}：${U.esc(text)}`, 2600);
      await U.sleep(500 * UI.speed);
    },
    async cardFlash(p, c) {
      D.toast(`<div class="card-flash">${UI.cardHTML(c.id)}<div>${p.icon} <b>${U.esc(p.name)}</b> 使用了<br><b style="font-size:17px">${c.name}</b></div></div>`, 2400);
      await U.sleep(p.isCPU ? 700 * UI.speed : 300);
    },
    async tollNotice(p, t, bd) {
      if (human(p)) return D.tollNotice(p, t, bd);
      const o = UI.game.ownerOf(t);
      D.toast(`${p.icon} ${U.esc(p.name)} 付給 ${o.icon} ${U.esc(o.name)} 過路費 <b>${U.money(bd.total)}</b>`);
    },
    choose: (p, o) => D.choose(p, o),
    pickTile: (p, o) => UI.startPick(o.title, o.tiles),
    pickPlayer: (p, o) => D.pickPlayer(p, o),
    pickHandCard: (p, o) => D.pickHandCard(p, o),
    actionPhase: (p) => UI.actionPhase(p),
    stockDialog: (p, o) => D.stockDialog(p, o),
    invadeDialog: (p, t) => D.invadeDialog(p, t),
    async battleOpen(ctx) {
      ctx.human = [ctx.A, ctx.B].some((f) => f.kind === 'player' && !f.isCPU);
      ctx.silent = !ctx.human && UI.speed < 0.5;
      if (!ctx.silent) D.battleOpen(ctx);
    },
    battleCommand: (p, ctx, kind, me) => D.battleCommand(p, ctx, kind, me),
    async battleUpdate(ctx, info) {
      if (!ctx.silent) await D.battleUpdate(ctx, info);
    },
    async battleClose(ctx) {
      if (!ctx.silent) await D.battleClose(ctx);
      UI.log(`⚔️ ${ctx.result}`);
    },
    async invasionResult(p, t, res) {
      if (human(p) || human(res.defender)) return D.invasionResult(p, t, res);
      D.toast(res.lines.map((l) => U.esc(l)).slice(-1)[0]);
      await U.sleep(600 * UI.speed);
    },
    checkpoint(cp) {
      UI.lastCheckpoint = cp;
      RG.SaveStore.write('auto', { cp, log: UI.logLines.slice(-80) });
    },
    gameOver(r, w) {
      RG.SaveStore.remove('auto');
      return D.gameOver(r, w);
    },
  };
  // 離開這局後（回到標題或開新局），舊遊戲的所有呼叫都會被凍結，不再影響畫面
  const alive = () => !io.game || (UI.game === io.game && !io.game.aborted);
  const SYNC = new Set(['log', 'render', 'toast']);
  Object.keys(io).forEach((k) => {
    const fn = io[k];
    io[k] = (...args) => {
      if (alive()) return fn(...args);
      return SYNC.has(k) ? undefined : new Promise(() => {});
    };
  });
  return io;
};
