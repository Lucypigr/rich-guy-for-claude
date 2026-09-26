// 卡片效果、命運、新聞、卡片屋、轉職神殿
var RG = (globalThis.RG = globalThis.RG || {});

Object.assign(RG.Game.prototype, {
  cardCost(p, c) {
    if (c.type === 'spell' && p.job === 'magician') return Math.round((c.cost || 0) * 0.8);
    return c.cost || 0;
  },

  // 各種目標的候選清單
  cardTargets(p, c) {
    const lands = this.board.filter((t) => t.type === 'land');
    const near = (t) => Math.min(this.distance(p.pos, t.idx, 1), this.distance(p.pos, t.idx, -1)) <= 3;
    switch (c.target) {
      case 'anyPlayer':
        return this.active();
      case 'otherPlayer':
        return this.others(p);
      case 'guardedLand':
        return lands.filter((t) => t.guardian && t.owner != null);
      case 'ownLand':
        return lands.filter((t) => t.owner === p.id && (c.id !== 'fortify' || t.level < 3));
      case 'nearLand':
        return lands.filter((t) => t.level > 0 && near(t));
      case 'builtLand':
        return lands.filter((t) => t.level > 0);
      case 'hereLand':
      case 'swapLand': {
        const t = this.tile(p.pos);
        const ok = t.type === 'land' && t.owner != null && t.owner !== p.id && !t.guardian;
        if (c.target === 'swapLand' && !this.landsOf(p).length) return [];
        return ok ? [t] : [];
      }
      case 'district':
        return RG.DISTRICTS;
      case 'aheadTile': {
        const res = [];
        for (let k = 1; k <= 8; k++) {
          const t = this.tile(p.pos + k * p.dir);
          if (t.type !== 'bank' && !t.block) res.push(t);
        }
        return res;
      }
      case 'passive':
        return [];
      default:
        return [true];
    }
  },

  cardUsable(p, id) {
    const c = RG.card(id);
    if (c.type === 'creature' || c.type === 'item') return { ok: false, reason: c.type === 'creature' ? '停在地產時召喚或侵略' : '侵略戰鬥時使用' };
    if (c.target === 'passive') return { ok: false, reason: '付過路費時自動生效' };
    if (this.cardCost(p, c) > p.cash) return { ok: false, reason: '現金不足' };
    if (!this.cardTargets(p, c).length) return { ok: false, reason: '沒有可用目標' };
    if (id === 'summongod' && !this.board.some((t) => t.god)) return { ok: false, reason: '地圖上沒有神明' };
    if ((id === 'dismissgod' || id === 'framegod') && !p.god) return { ok: false, reason: '身上沒有神明' };
    if (id === 'stay' && p.turn.stay) return { ok: false, reason: '已使用' };
    return { ok: true };
  },

  async resolveTarget(p, c, plan) {
    const cands = this.cardTargets(p, c);
    const out = {};
    const pickT = async (title, list) =>
      plan && plan.tile != null ? this.board[plan.tile] : this.board[await this.io.pickTile(p, { title, tiles: list.map((t) => t.idx) })];
    switch (c.target) {
      case 'none':
        break;
      case 'anyPlayer':
      case 'otherPlayer':
        out.player = plan ? this.players[plan.player] : await this.io.pickPlayer(p, { title: `${c.name}：選擇目標玩家`, players: cands });
        if (!out.player) return null;
        break;
      case 'district': {
        if (plan) out.district = plan.district;
        else {
          out.district = await this.io.choose(p, {
            title: `${c.name}：選擇商圈`,
            options: RG.DISTRICTS.map((d) => ({ id: d.id, label: `${d.name}（${d.stock}）`, sub: `股價 ${this.stockPrice(d.id)}` })),
            cancelable: true,
          });
        }
        if (!out.district) return null;
        break;
      }
      case 'swapLand': {
        out.tile2 = cands[0];
        if (plan) out.tile = this.board[plan.tile];
        else {
          const mine = await this.io.pickTile(p, { title: `換地卡：選擇要拿來交換「${cands[0].name}」的自己地產`, tiles: this.landsOf(p).map((t) => t.idx) });
          if (mine == null) return null;
          out.tile = this.board[mine];
        }
        break;
      }
      case 'hereLand':
        out.tile = cands[0];
        break;
      default:
        out.tile = await pickT(`${c.name}：選擇目標格子`, cands);
        if (!out.tile) return null;
    }
    if (c.id === 'terraform') {
      out.element = plan
        ? plan.element
        : await this.io.choose(p, {
            title: '地變術：選擇新屬性',
            options: ['fire', 'water', 'earth', 'wind'].map((e) => ({ id: e, label: `${RG.ELEMENTS[e].icon} ${RG.ELEMENTS[e].name}` })),
            cancelable: true,
          });
      if (!out.element) return null;
    }
    if (c.id === 'remote') {
      out.dice = plan
        ? plan.dice
        : +(await this.io.choose(p, {
            title: '遙控骰子：要擲出幾點？',
            options: Array.from({ length: 6 * this.config.dice }, (_, k) => k + 1).map((n) => ({ id: String(n), label: `${n} 點`, sub: this.tile(p.pos + n * p.dir).name })),
            cancelable: true,
          }));
      if (!out.dice) return null;
    }
    return out;
  },

  async playCard(p, idx, plan) {
    const id = p.hand[idx];
    if (!id) return false;
    const c = RG.card(id);
    const u = this.cardUsable(p, id);
    if (!u.ok) {
      if (!p.isCPU) this.io.toast(`無法使用「${c.name}」：${u.reason}`);
      return false;
    }
    const tgt = await this.resolveTarget(p, c, plan);
    if (!tgt) return false;
    // 移除卡片、扣費
    p.hand.splice(p.hand.indexOf(id), 1);
    p.discard.push(id);
    const cost = this.cardCost(p, c);
    p.cash -= cost;
    p.turn.cardsUsed++;
    this.log(`${c.icon} ${p.name} 使用「${c.name}」${cost ? `（${RG.U.money(cost)}）` : ''}。`, 'card');
    await this.io.cardFlash(p, c);
    await this.applyCard(p, c, tgt);
    this.io.render();
    return true;
  },

  async applyCard(p, c, tgt) {
    const q = tgt.player, t = tgt.tile;
    const U = RG.U;
    switch (c.id) {
      // --- 法術 ---
      case 'fireball': {
        const g = t.guardian;
        g.hp -= 40;
        const gc = RG.card(g.id);
        if (g.hp <= 0) {
          this.ownerOf(t).discard.push(g.id);
          t.guardian = null;
          this.log(`☄️ 「${t.name}」的${gc.name}被燒成灰燼！`, 'bad');
        } else this.log(`☄️ 「${t.name}」的${gc.name}受到 40 傷害（剩 ${g.hp}）。`);
        break;
      }
      case 'terraform':
        t.element = tgt.element;
        this.log(`🌋 「${t.name}」變成${RG.ELEMENTS[t.element].icon}${RG.ELEMENTS[t.element].name}屬性。`);
        break;
      case 'fortify':
        t.level++;
        this.log(`🏯 「${t.name}」加蓋成${RG.LEVEL_NAMES[t.level]}。`);
        break;
      case 'manaspring': {
        const n = 200 + this.round * 15;
        p.cash += n;
        this.log(`⛲ ${p.name} 獲得 ${U.money(n)}。`, 'good');
        break;
      }
      case 'wisdom':
        this.drawCard(p);
        this.drawCard(p);
        break;
      case 'holylight':
        p.hp = this.maxHp(p);
        this.landsOf(p).forEach((l) => l.guardian && (l.guardian.hp = l.guardian.maxHp));
        break;
      case 'gale':
        p.turn.bonus += 3;
        break;
      case 'soulsteal': {
        const id = this.removeRandomCard(q);
        if (id) {
          p.hand.push(id);
          this.log(`👻 ${p.name} 奪走了 ${q.name} 的「${RG.card(id).name}」。`);
        } else this.log(`${q.name} 沒有手牌可奪。`);
        break;
      }
      // --- 大富翁8 機會卡 ---
      case 'turn':
        q.dir *= -1;
        this.log(`🔄 ${q.name} 掉頭了，現在${q.dir > 0 ? '順' : '逆'}時針前進。`);
        break;
      case 'stay':
        p.turn.stay = true;
        break;
      case 'remote':
        p.turn.fixedDice = tgt.dice;
        break;
      case 'motor':
        p.turn.motor = true;
        break;
      case 'turtle':
        q.status.turtle = 3;
        this.log(`🐢 ${q.name} 變成烏龜，接下來 3 回合只能走 1 步。`, 'bad');
        break;
      case 'poor': {
        const avg = Math.round((p.cash + q.cash) / 2);
        this.log(`⚖️ ${p.name}（${U.money(p.cash)}）與 ${q.name}（${U.money(q.cash)}）平分現金，各得 ${U.money(avg)}。`, 'bad');
        p.cash = avg;
        q.cash = avg;
        break;
      }
      case 'rich': {
        const act = this.active();
        const avg = Math.round(act.reduce((s, x) => s + x.cash, 0) / act.length);
        act.forEach((x) => (x.cash = avg));
        this.log(`🤝 所有玩家的現金平均為 ${U.money(avg)}。`, 'bad');
        break;
      }
      case 'tax': {
        const n = Math.round(q.cash * 0.2);
        q.cash -= n;
        p.cash += n;
        this.log(`🧾 ${p.name} 向 ${q.name} 查稅，收取 ${U.money(n)}。`, 'bad');
        break;
      }
      case 'monster':
        this.log(`🦖 怪獸大鬧「${t.name}」，${RG.LEVEL_NAMES[t.level]}被夷為平地！`, 'bad');
        t.level = 0;
        break;
      case 'demolish':
        t.level--;
        this.log(`🔨 「${t.name}」被拆掉一層，剩${RG.LEVEL_NAMES[t.level]}。`, 'bad');
        break;
      case 'buyland': {
        const owner = this.ownerOf(t);
        const v = Math.round(this.landValue(t) * 1.5);
        if (p.cash < v) {
          this.log(`${p.name} 的現金不足以收購「${t.name}」（需 ${U.money(v)}），卡片作廢。`);
          break;
        }
        p.cash -= v;
        owner.cash += v;
        t.owner = p.id;
        this.log(`📜 ${p.name} 以 ${U.money(v)} 強制收購了 ${owner.name} 的「${t.name}」！`, 'bad');
        break;
      }
      case 'swapland': {
        const a = tgt.tile, b = tgt.tile2;
        const other = b.owner;
        b.owner = p.id;
        a.owner = other;
        this.log(`🔁 ${p.name} 用「${a.name}」換走了 ${this.players[other].name} 的「${b.name}」。`, 'bad');
        break;
      }
      case 'hibernate':
        this.others(p).forEach((x) => (x.status.sleep = Math.max(x.status.sleep, 1)));
        this.log('💤 所有對手進入冬眠，下回合無法行動。', 'bad');
        break;
      case 'summongod': {
        const gt = this.board
          .filter((x) => x.god)
          .sort((a, b) => Math.min(this.distance(p.pos, a.idx, 1), this.distance(p.pos, a.idx, -1)) - Math.min(this.distance(p.pos, b.idx, 1), this.distance(p.pos, b.idx, -1)))[0];
        const g = gt.god;
        gt.god = null;
        this.attachGod(p, g);
        break;
      }
      case 'dismissgod':
        this.log(`🎐 ${p.name} 送走了${RG.GODS[p.god.type].name}。`);
        p.god = null;
        break;
      case 'framegod':
        q.god = p.god;
        p.god = null;
        this.log(`🫵 ${p.name} 把${RG.GODS[q.god.type].name}嫁禍給 ${q.name}！`, 'bad');
        break;
      case 'redcard':
        this.adjustFactor(tgt.district, 1.5);
        this.log(`🟥 ${RG.DISTRICTS.find((d) => d.id === tgt.district).stock} 股價漲停！現價 ${this.stockPrice(tgt.district)}。`, 'good');
        break;
      case 'blackcard':
        this.adjustFactor(tgt.district, 0.6);
        this.log(`⬛ ${RG.DISTRICTS.find((d) => d.id === tgt.district).stock} 股價跌停！現價 ${this.stockPrice(tgt.district)}。`, 'bad');
        break;
      case 'frame':
        q.status.hospital = Math.max(q.status.hospital, 2);
        q.pos = this.board.findIndex((x) => x.type === 'hospital');
        this.log(`🚑 ${q.name} 被陷害，送進醫院休養 2 回合。`, 'bad');
        break;
      case 'roadblock':
        t.block = true;
        this.log(`🚧 ${p.name} 在「${t.name}」放置了路障。`);
        break;
      case 'robot': {
        let n = 0;
        for (let k = 1; k <= 10; k++) {
          const x = this.tile(p.pos + k * p.dir);
          if (x.block) {
            x.block = false;
            n++;
          }
        }
        this.log(`🤖 機器娃娃清除了 ${n} 個路障。`);
        break;
      }
    }
  },

  // ---------- 命運 ----------
  async chanceEvent(p) {
    const ev = RG.U.pick(RG.CHANCE_EVENTS);
    let text = ev.text;
    const U = RG.U;
    switch (ev.id) {
      case 'wallet':
        p.cash += 250;
        break;
      case 'ticket':
        await this.io.notify(p, '❓ 命運', text);
        await this.pay(p, 150, null, '罰單');
        this.log(`❓ ${p.name}：${text}`);
        return;
      case 'dividend': {
        const n = Math.round(this.stockValue(p) * 0.08);
        p.cash += n;
        text += `（${U.money(n)}）`;
        break;
      }
      case 'repair': {
        const n = this.landsOf(p).reduce((s, t) => s + t.level, 0) * 30;
        text += `（共 ${U.money(n)}）`;
        await this.io.notify(p, '❓ 命運', text);
        this.log(`❓ ${p.name}：${text}`);
        await this.pay(p, n, null, '修繕費');
        return;
      }
      case 'lottery': {
        const win = U.chance(0.25);
        if (win) p.cash += 1000;
        text += win ? '中了頭獎 $1,000！' : '可惜沒中。';
        break;
      }
      case 'points':
        p.points += 40;
        break;
      case 'tobank':
        await this.io.notify(p, '❓ 命運', text);
        this.log(`❓ ${p.name}：${text}`);
        await this.moveTo(p, 0);
        await this.passBank(p, true);
        return;
      case 'back3': {
        await this.io.notify(p, '❓ 命運', text);
        this.log(`❓ ${p.name}：${text}`);
        await this.moveTo(p, (p.pos - 3 * p.dir + 40) % 40);
        const t = this.tile(p.pos);
        if (t.type !== 'chance') await this.landOn(p);
        return;
      }
      case 'card': {
        const c = U.pick(RG.CARDS.filter((x) => x.type === 'tool'));
        p.hand.push(c.id);
        text += `（${c.name}）`;
        break;
      }
      case 'suit': {
        const missing = Object.keys(RG.SUITS).filter((s) => !p.suits[s]);
        if (missing.length) {
          const s = U.pick(missing);
          p.suits[s] = true;
          text += `（${RG.SUITS[s].icon}）`;
        } else {
          p.cash += 200;
          text += '花色已集滿，改領 $200。';
        }
        break;
      }
      case 'ambush':
        p.hp = Math.max(1, Math.round(p.hp * 0.7));
        break;
      case 'god':
        this.attachGod(p, U.pick(Object.keys(RG.GODS)));
        break;
      case 'upgrade': {
        const cands = this.landsOf(p).filter((t) => t.level < 5);
        if (cands.length) {
          const t = U.pick(cands);
          t.level++;
          text += `（${t.name} → ${RG.LEVEL_NAMES[t.level]}）`;
        } else text += '可惜你沒有可加蓋的地產。';
        break;
      }
      case 'charity': {
        const poorest = this.others(p).sort((a, b) => a.cash - b.cash)[0];
        const n = Math.round(p.cash * 0.1);
        if (poorest) {
          p.cash -= n;
          poorest.cash += n;
          text += `（${U.money(n)} 給 ${poorest.name}）`;
        }
        break;
      }
      case 'birthday': {
        let total = 0;
        for (const q of this.others(p)) total += await this.pay(q, 100, p, '生日禮金');
        text += `（共 ${U.money(total)}）`;
        break;
      }
      case 'insider': {
        const d = await this.decide(p, 'insiderDistrict', {}, () =>
          this.io.choose(p, {
            title: '❓ 內線消息',
            text: '選擇一個商圈，股價上漲 20%。',
            options: RG.DISTRICTS.map((d) => ({ id: d.id, label: `${d.name}（${d.stock}）`, sub: `股價 ${this.stockPrice(d.id)}，持有 ${p.stocks[d.id]} 股` })),
          })
        );
        if (d) {
          this.adjustFactor(d, 1.2);
          text += `（${RG.DISTRICTS.find((x) => x.id === d).stock}）`;
        }
        break;
      }
      case 'hospital':
        p.status.hospital = 1;
        p.pos = this.board.findIndex((t) => t.type === 'hospital');
        break;
      case 'exp':
        this.gainExp(p, 20);
        break;
    }
    this.log(`❓ ${p.name}：${text}`);
    await this.io.notify(p, '❓ 命運', text);
    this.io.render();
  },

  // ---------- 新聞 ----------
  async newsEvent(p) {
    const ev = RG.U.pick(RG.NEWS_EVENTS);
    let text = ev.text;
    const act = this.active();
    switch (ev.id) {
      case 'bull':
        RG.DISTRICTS.forEach((d) => this.adjustFactor(d.id, 1.2));
        break;
      case 'bear':
        RG.DISTRICTS.forEach((d) => this.adjustFactor(d.id, 0.8));
        break;
      case 'typhoon': {
        const d = RG.U.pick(RG.DISTRICTS);
        this.board.filter((t) => t.district === d.id && t.level > 0).forEach((t) => t.level--);
        text += `（${d.name}）`;
        break;
      }
      case 'redenvelope':
        act.forEach((q) => (q.cash += 300));
        break;
      case 'taxall':
        act.forEach((q) => (q.cash -= Math.round(q.cash * 0.1)));
        break;
      case 'gods':
        this.spawnGod();
        this.spawnGod();
        break;
      case 'riot':
        act.forEach((q) => (q.hp = Math.max(1, Math.round(q.hp * 0.75))));
        break;
      case 'manatide':
        act.forEach((q) => {
          this.drawCard(q, true);
          this.drawCard(q, true);
        });
        break;
      case 'renewal': {
        const d = RG.U.pick(RG.DISTRICTS);
        this.board.filter((t) => t.district === d.id && t.owner != null && t.level < 5).forEach((t) => t.level++);
        text += `（${d.name}）`;
        break;
      }
      case 'health':
        act.forEach((q) => {
          q.hp = this.maxHp(q);
          q.status.hospital = 0;
        });
        break;
    }
    this.log(`📰 新聞：${text}`, 'sys');
    await this.io.notify(p, '📰 新聞快報', text, true);
    this.io.render();
  },

  // ---------- 卡片屋（大富翁8）----------
  shopPrice(p, c) {
    return p.job === 'alchemist' ? Math.round(c.shop * 0.8) : c.shop;
  },
  async cardShop(p) {
    const stock = RG.U.shuffle(RG.CARDS.filter((c) => c.type === 'tool')).slice(0, 5);
    if (p.isCPU) {
      RG.AI.shop(this, p, stock);
      return;
    }
    for (;;) {
      const ans = await this.io.choose(p, {
        title: `🃏 卡片屋（點券 ${p.points}）`,
        text: '用點券購買機會卡，直接加入手牌。',
        options: [
          ...stock.map((c) => ({
            id: c.id,
            label: `${c.icon} ${c.name}　🎟️${this.shopPrice(p, c)}`,
            sub: c.desc,
            disabled: this.shopPrice(p, c) > p.points,
          })),
          { id: 'leave', label: '離開' },
        ],
      });
      if (!ans || ans === 'leave') return;
      const c = RG.card(ans);
      p.points -= this.shopPrice(p, c);
      p.hand.push(c.id);
      stock.splice(stock.indexOf(c), 1);
      this.log(`🃏 ${p.name} 在卡片屋買了「${c.name}」。`);
      this.io.render();
    }
  },

  // ---------- 轉職神殿（Dokapon）----------
  async templeVisit(p) {
    p.hp = this.maxHp(p);
    const jobs = Object.keys(RG.JOBS).filter((j) => j !== p.job && (!RG.JOBS[j].advanced || this.heroUnlocked(p)));
    const fee = 200;
    const pick = await this.decide(p, 'changeJob', { jobs, fee }, () =>
      this.io.choose(p, {
        title: '⛩️ 轉職神殿',
        text: `HP 已回滿。轉職費用 ${RG.U.money(fee)}（等級保留，能力依新職業重新計算）。\n目前：${RG.JOBS[p.job].name}　已精通：${p.mastered.map((j) => RG.JOBS[j].name).join('、') || '無'}`,
        options: [
          ...jobs.map((j) => ({
            id: j,
            label: `${RG.JOBS[j].icon} ${RG.JOBS[j].name}`,
            sub: `技能：${RG.JOBS[j].skill.name}｜被動：${RG.JOBS[j].field.name}`,
            disabled: p.cash < fee,
          })),
          { id: 'stay', label: '維持現職' },
        ],
      })
    );
    if (!pick || pick === 'stay') {
      this.log(`⛩️ ${p.name} 在神殿回滿了 HP。`);
      return;
    }
    p.cash -= fee;
    p.job = pick;
    p.hp = this.maxHp(p);
    this.log(`⛩️ ${p.name} 轉職為「${RG.JOBS[pick].name}」！`, 'good');
    this.io.render();
  },
});
