// 電腦玩家的決策
var RG = (globalThis.RG = globalThis.RG || {});

RG.AI = {
  reserve(g, p) {
    return 300 + g.round * 20 + g.netWorth(p) * 0.05;
  },

  buyLand(g, p, { t, price }) {
    const d = g.districtInfo(p.id, t.district);
    const bias = d.owned > 0 ? 0.7 : 1;
    return p.cash - price > this.reserve(g, p) * bias;
  },
  investPick(g, p, { cands }) {
    const best = cands.slice().sort((a, b) => b.price - a.price)[0];
    return p.cash - g.upgradeCost(best, p) > this.reserve(g, p) * 1.2 ? String(best.idx) : null;
  },
  summonGuardian(g, p, { t, options }) {
    if (p.cash < this.reserve(g, p) * 0.5) return null;
    const scored = options
      .map((o) => {
        let s = o.c.hp + o.c.st * 0.5;
        if (o.c.element === t.element) s += 40;
        if ((o.c.abilities || []).includes('wall')) s += 10;
        return { o, s };
      })
      .sort((a, b) => b.s - a.s);
    // 保留一張強攻擊生物用來侵略
    return scored[0].o.idx;
  },
  invadePlan(g, p, { t, attackers }) {
    const owner = g.ownerOf(t);
    const dCard = RG.card(t.guardian.id);
    const items = p.hand.map((id, idx) => ({ id, idx, c: RG.card(id) })).filter((o) => o.c.type === 'item');
    const worth = g.landValue(t) + g.toll(t, p);
    let best = null;
    for (const a of attackers) {
      const abil = new Set(a.c.abilities || []);
      const bonus = dCard.element === t.element && t.element !== 'neutral' && !abil.has('pierce') ? 10 * (t.level + 1) : 0;
      const dHp = t.guardian.hp + bonus + 10; // 預留對手可能的防禦道具
      const tries = [null, ...items];
      for (const it of tries) {
        const cost = a.c.cost + (it ? it.c.cost : 0);
        if (cost > p.cash - 50) continue;
        const st = a.c.st + (it ? it.c.st : 0) + (p.turn.boost ? 10 : 0);
        if (st >= dHp) {
          const score = worth - cost;
          if (!best || score > best.score) best = { creatureIdx: a.idx, itemIdx: it ? it.idx : null, score };
        }
      }
    }
    if (best && best.score > 0 && owner) return best;
    return null;
  },
  defenseItem(g, p, { t }) {
    const items = p.hand.map((id, idx) => ({ id, idx, c: RG.card(id) })).filter((o) => o.c.type === 'item' && o.c.cost <= p.cash && o.c.hp > 0);
    if (!items.length || t.level < 2) return null;
    items.sort((a, b) => b.c.hp - a.c.hp);
    return items[0].idx;
  },
  buyout(g, p, { t, cost }) {
    const d = g.districtInfo(p.id, t.district);
    return d.owned >= 1 && p.cash - cost > this.reserve(g, p) * 2;
  },
  hospitalHeal(g, p) {
    return p.hp < g.maxHp(p) * 0.5 && p.cash > 600;
  },
  challenge(g, p, { targets }) {
    const me = g.stats(p);
    let best = null;
    for (const q of targets) {
      const s = g.stats(q);
      const mine = me.atk + me.mag * 0.5 + p.hp * 0.3;
      const theirs = s.atk + s.mag * 0.5 + q.hp * 0.3;
      if (mine > theirs * 1.15 && (q.cash > 400 || q.hand.length > 2)) {
        if (!best || q.cash > best.cash) best = q;
      }
    }
    return best;
  },
  pvpReward(g, p, { loser }) {
    return loser.cash * 0.15 > 150 || !loser.hand.length ? 'cash' : 'card';
  },
  discardChoice(g, p) {
    // 丟掉最便宜的道具或最弱的生物
    let worst = 0, ws = Infinity;
    p.hand.forEach((id, i) => {
      const c = RG.card(id);
      const s = c.type === 'creature' ? c.st + c.hp : c.type === 'tool' ? 60 + (c.shop || 0) : 50 + (c.cost || 0) * 0.3;
      if (s < ws) {
        ws = s;
        worst = i;
      }
    });
    return worst;
  },
  changeJob(g, p, { jobs, fee }) {
    if (jobs.includes('hero') && p.cash > fee + 500) return 'hero';
    if (p.mastered.includes(p.job) && p.cash > fee + 800) {
      const fresh = jobs.filter((j) => !p.mastered.includes(j) && !RG.JOBS[j].advanced);
      if (fresh.length) return RG.U.pick(fresh);
    }
    return 'stay';
  },
  insiderDistrict(g, p) {
    return RG.DISTRICTS.slice().sort((a, b) => p.stocks[b.id] - p.stocks[a.id])[0].id;
  },

  shop(g, p, stock) {
    const want = ['poor', 'tax', 'buyland', 'freepass', 'remote', 'redcard', 'monster', 'turtle'];
    for (const c of stock) {
      const price = g.shopPrice(p, c);
      if (want.includes(c.id) && p.points >= price && p.hand.length < RG.HAND_LIMIT) {
        p.points -= price;
        p.hand.push(c.id);
        g.log(`🃏 ${p.name} 在卡片屋買了「${c.name}」。`);
      }
    }
  },

  tradeStocks(g, p, where) {
    // 買進自己地產最多的商圈股票
    const res = this.reserve(g, p) * 1.5;
    if (p.cash < res + 200) {
      // 缺錢時賣掉部分股票
      if (p.cash < 200) {
        for (const d of RG.DISTRICTS) if (p.stocks[d.id] > 0) g.sellStock(p, d.id, Math.ceil(p.stocks[d.id] / 2));
      }
      return;
    }
    const scored = RG.DISTRICTS.map((d) => {
      const info = g.districtInfo(p.id, d.id);
      const lv = g.board.filter((t) => t.district === d.id && t.owner === p.id).reduce((s, t) => s + t.level, 0);
      return { d, s: info.owned * 2 + lv + RG.U.randRange(0, 1.5) - (p.stocks[d.id] >= 90 ? 99 : 0) };
    }).sort((a, b) => b.s - a.s);
    const target = scored[0];
    if (target.s < 1) return;
    const price = g.stockPrice(target.d.id);
    const budget = (p.cash - res) * 0.5;
    const n = Math.min(99 - p.stocks[target.d.id], Math.floor(budget / price));
    if (n >= 5) g.buyStock(p, target.d.id, n);
  },

  // 擲骰前出牌
  chooseCard(g, p) {
    const others = g.others(p);
    if (!others.length) return null;
    const richest = others.slice().sort((a, b) => b.cash - a.cash)[0];
    const leader = others.slice().sort((a, b) => g.netWorth(b) - g.netWorth(a))[0];
    const plans = [];
    p.hand.forEach((id, idx) => {
      if (!g.cardUsable(p, id).ok) return;
      const c = RG.card(id);
      const cands = g.cardTargets(p, c);
      const add = (score, extra) => plans.push(Object.assign({ idx, id, score }, extra));
      switch (id) {
        case 'poor':
          if (richest.cash > p.cash * 1.6 + 500) add(richest.cash - p.cash, { player: richest.id });
          break;
        case 'rich': {
          const act = g.active();
          const avg = act.reduce((s, x) => s + x.cash, 0) / act.length;
          if (avg > p.cash * 1.5 + 400) add(avg - p.cash);
          break;
        }
        case 'tax':
          if (richest.cash > 1000) add(richest.cash * 0.2, { player: richest.id });
          break;
        case 'turtle':
          if (g.netWorth(leader) > g.netWorth(p) && leader.status.turtle === 0) add(150, { player: leader.id });
          break;
        case 'frame':
          if (g.netWorth(leader) > g.netWorth(p) * 0.9 && leader.status.hospital === 0) add(250, { player: leader.id });
          break;
        case 'hibernate':
          add(200);
          break;
        case 'soulsteal':
          if (leader.hand.length > 2) add(120, { player: leader.id });
          break;
        case 'turn':
          break;
        case 'monster':
        case 'demolish': {
          const enemy = cands.filter((t) => t.owner != null && t.owner !== p.id).sort((a, b) => b.level * b.price - a.level * a.price)[0];
          if (enemy && enemy.level >= (id === 'monster' ? 2 : 1)) add(enemy.level * enemy.price * 0.6, { tile: enemy.idx });
          break;
        }
        case 'buyland': {
          const t = cands[0];
          if (t && p.cash - g.landValue(t) * 1.5 > this.reserve(g, p)) add(g.landValue(t) * 0.5, { tile: t.idx });
          break;
        }
        case 'swapland': {
          const mine = g.landsOf(p).sort((a, b) => g.landValue(a) - g.landValue(b))[0];
          const theirs = cands[0];
          if (mine && theirs && g.landValue(theirs) > g.landValue(mine) * 1.5) add(g.landValue(theirs) - g.landValue(mine), { tile: mine.idx });
          break;
        }
        case 'redcard': {
          const d = RG.DISTRICTS.slice().sort((a, b) => p.stocks[b.id] - p.stocks[a.id])[0];
          if (p.stocks[d.id] >= 20) add(p.stocks[d.id] * g.stockPrice(d.id) * 0.5, { district: d.id });
          break;
        }
        case 'blackcard': {
          const d = RG.DISTRICTS.slice().sort((a, b) => leader.stocks[b.id] - leader.stocks[a.id])[0];
          if (leader.stocks[d.id] >= 20 && p.stocks[d.id] < 5) add(leader.stocks[d.id] * g.stockPrice(d.id) * 0.4, { district: d.id });
          break;
        }
        case 'fireball': {
          const t = cands.filter((x) => x.owner !== p.id && x.guardian.hp <= 40).sort((a, b) => g.landValue(b) - g.landValue(a))[0];
          if (t) add(g.landValue(t) * 0.4, { tile: t.idx });
          break;
        }
        case 'terraform': {
          const t = cands.find((x) => x.guardian && RG.card(x.guardian.id).element !== x.element && RG.card(x.guardian.id).element !== 'neutral');
          if (t) add(100, { tile: t.idx, element: RG.card(t.guardian.id).element });
          break;
        }
        case 'fortify': {
          const t = cands.sort((a, b) => b.price - a.price)[0];
          if (t) add(t.price * 0.8, { tile: t.idx });
          break;
        }
        case 'manaspring':
          add(200);
          break;
        case 'wisdom':
          if (p.hand.length <= 4) add(80);
          break;
        case 'holylight':
          if (p.hp < g.maxHp(p) * 0.5) add(90);
          break;
        case 'gale':
        case 'remote':
        case 'motor': {
          // 找出能停在好格子的點數
          const best = this.bestDice(g, p, id);
          if (best) add(best.score, { dice: best.dice });
          break;
        }
        case 'stay': {
          const t = g.tile(p.pos);
          if (t.type === 'land' && t.owner === p.id && t.level < 5 && p.cash > this.reserve(g, p) * 2) add(90);
          break;
        }
        case 'roadblock': {
          if (cands.length) add(30, { tile: cands[Math.min(cands.length - 1, 2)].idx });
          break;
        }
        case 'robot': {
          let n = 0;
          for (let k = 1; k <= 10; k++) if (g.tile(p.pos + k * p.dir).block) n++;
          if (n) add(60);
          break;
        }
        case 'summongod': {
          const good = g.board.find((t) => t.god && RG.GODS[t.god].good);
          if (good && !p.god) add(110);
          break;
        }
        case 'dismissgod':
          if (!RG.GODS[p.god.type].good) add(150);
          break;
        case 'framegod':
          if (!RG.GODS[p.god.type].good) add(220, { player: leader.id });
          break;
      }
    });
    if (!plans.length) return null;
    plans.sort((a, b) => b.score - a.score);
    return plans[0].score >= 60 ? plans[0] : null;
  },

  tileScore(g, p, t) {
    if (t.type === 'land') {
      if (t.owner == null) return p.cash > t.price + 300 ? 60 : 5;
      if (t.owner === p.id) return 40;
      return -g.toll(t, p) / 5;
    }
    return { bank: 40, suit: 20, chance: 15, shop: 20, points: 20, magic: 30, temple: 10, broker: 15, monster: 15, news: 5, hospital: 0 }[t.type] || 0;
  },
  bestDice(g, p, id) {
    if (p.status.turtle > 0) return null;
    const nd = g.config.dice;
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const base = range(nd, nd * 6);
    const opts = [];
    if (id === 'remote') for (let n = 1; n <= nd * 6; n++) opts.push({ dice: n, steps: [n] });
    else if (id === 'gale') opts.push({ steps: base.map((n) => n + 3) });
    else opts.push({ steps: range(nd + 1, nd * 6 + 6) });
    const baseAvg = base.reduce((s, n) => s + this.tileScore(g, p, g.tile(p.pos + n * p.dir)), 0) / base.length;
    let best = null;
    for (const o of opts) {
      const avg = o.steps.reduce((s, n) => s + this.tileScore(g, p, g.tile(p.pos + n * p.dir)), 0) / o.steps.length;
      const score = (avg - baseAvg) * 3;
      if (!best || score > best.score) best = { dice: o.dice, score };
    }
    return best && best.score > 20 ? best : null;
  },

  // Dokapon 戰鬥指令
  battleAttack(g, att, dfd) {
    const opts = [
      ['attack', 45],
      ['strike', 25],
      ['magic', att.mag > att.atk ? 45 : 12],
    ];
    if (!att.skillUsed && att.job) {
      const w = att.job === 'cleric' ? (att.hp < att.maxHp * 0.5 ? 80 : 0) : 30;
      opts.push(['skill', w]);
    }
    return RG.U.weighted(opts);
  },
  battleDefense(g, dfd, att) {
    return RG.U.weighted([
      ['defend', 50],
      ['counter', 25],
      ['mguard', att.mag > att.atk ? 45 : 15],
    ]);
  },
};
