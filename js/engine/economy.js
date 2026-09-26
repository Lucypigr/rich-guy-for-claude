// 經濟系統：地產、過路費、股票（Fortune Street）、連鎖（Culdcept）、付款與破產
var RG = (globalThis.RG = globalThis.RG || {});

RG.TOLL_RATE = [0.25, 0.6, 1.1, 1.8, 2.6, 3.6]; // 0~5 層
RG.LEVEL_NAMES = ['空地', '平房', '洋房', '公寓', '大樓', '摩天樓'];
RG.LEVEL_ICONS = ['', '🏠', '🏡', '🏘️', '🏢', '🏙️'];
RG.MAX_SHARES = 99;

Object.assign(RG.Game.prototype, {
  // 地產價值：建築投資 ＋ 商圈加成（同商圈持有越多，價值越高，Fortune Street 式增值）
  landValue(t) {
    let v = t.price * (1 + 0.6 * t.level);
    if (t.owner != null) {
      const d = this.districtInfo(t.owner, t.district);
      v *= d.owned === d.total ? 1.5 : 1 + 0.15 * (d.owned - 1);
    }
    return Math.round(v);
  },
  upgradeCost(t, p) {
    let c = Math.round(t.price * 0.6);
    if (p && p.god && p.god.type === 'fortune') c = Math.round(c / 2);
    return c;
  },
  buyPrice(t, p) {
    let c = t.price;
    if (p && p.god && p.god.type === 'fortune') c = Math.round(c / 2);
    return c;
  },

  // 商圈加成（Fortune Street 多店加成 / 大富翁8 連鎖地）
  districtInfo(ownerId, districtId) {
    const lots = this.board.filter((t) => t.type === 'land' && t.district === districtId);
    const owned = lots.filter((t) => t.owner === ownerId).length;
    const mult = owned === lots.length ? 2 : 1 + 0.3 * (owned - 1);
    return { owned, total: lots.length, mult: Math.max(1, mult) };
  },
  // 屬性連鎖（Culdcept chain）
  chainInfo(ownerId, element) {
    if (element === 'neutral') return { count: 1, mult: 1 };
    const count = this.board.filter((t) => t.type === 'land' && t.owner === ownerId && t.element === element).length;
    return { count, mult: Math.min(1.6, 1 + 0.15 * (count - 1)) };
  },
  guardianMult(t) {
    if (!t.guardian) return 1;
    const c = RG.card(t.guardian.id);
    return c.element === t.element ? 1.4 : 1.2;
  },

  tollBreakdown(t, payer) {
    const owner = this.ownerOf(t);
    const base = t.price * RG.TOLL_RATE[t.level];
    const d = this.districtInfo(t.owner, t.district);
    const ch = this.chainInfo(t.owner, t.element);
    const g = this.guardianMult(t);
    let total = base * d.mult * ch.mult * g;
    const notes = [];
    if (owner && owner.god && owner.god.type === 'wealth') {
      total *= 2;
      notes.push('財神 ×2');
    }
    if (owner && owner.job === 'hero') {
      total *= 1.15;
      notes.push('勇者 ×1.15');
    }
    if (payer && payer.god && payer.god.type === 'poverty') {
      total *= 2;
      notes.push('窮神 ×2');
    }
    return { base: Math.round(base), district: d, chain: ch, guardian: g, notes, total: Math.round(total) };
  },
  toll(t, payer) {
    return this.tollBreakdown(t, payer).total;
  },

  // ---------- 股票 ----------
  stockPrice(did) {
    const lots = this.board.filter((t) => t.type === 'land' && t.district === did);
    const avg = lots.reduce((s, t) => s + this.landValue(t), 0) / lots.length;
    return Math.max(1, Math.round(avg * 0.04 * this.market[did].factor));
  },
  totalShares(did) {
    return this.players.reduce((s, p) => s + (p.bankrupt ? 0 : p.stocks[did]), 0);
  },
  stockValue(p) {
    return RG.DISTRICTS.reduce((s, d) => s + p.stocks[d.id] * this.stockPrice(d.id), 0);
  },
  netWorth(p) {
    if (p.bankrupt) return 0;
    const lands = this.landsOf(p).reduce((s, t) => s + this.landValue(t), 0);
    return p.cash + lands + this.stockValue(p);
  },
  adjustFactor(did, mult) {
    const m = this.market[did];
    m.factor = RG.U.clamp(m.factor * mult, 0.3, 4);
  },
  buyStock(p, did, n) {
    n = Math.min(n, RG.MAX_SHARES - p.stocks[did]);
    const price = this.stockPrice(did);
    n = Math.min(n, Math.floor(p.cash / price));
    if (n <= 0) return 0;
    p.cash -= n * price;
    p.stocks[did] += n;
    if (n >= 10) this.adjustFactor(did, 1 + 0.03 * Math.floor(n / 10));
    this.log(`📈 ${p.name} 買進 ${RG.DISTRICTS.find((d) => d.id === did).stock} ${n} 股（@${price}）。`);
    return n;
  },
  sellStock(p, did, n, silent) {
    n = Math.min(n, p.stocks[did]);
    if (n <= 0) return 0;
    const price = this.stockPrice(did);
    p.cash += n * price;
    p.stocks[did] -= n;
    if (n >= 10) this.adjustFactor(did, 1 - 0.03 * Math.floor(n / 10));
    if (!silent) this.log(`📉 ${p.name} 賣出 ${RG.DISTRICTS.find((d) => d.id === did).stock} ${n} 股（@${price}）。`);
    return n * price;
  },
  payDividends(t, toll, payer) {
    for (const h of this.active()) {
      if (h === payer) continue;
      const shares = h.stocks[t.district];
      if (!shares) continue;
      let amt = toll * Math.min(shares * 0.005, 0.25);
      if (h.job === 'alchemist') amt *= 1.3;
      amt = Math.round(amt);
      if (amt > 0) {
        h.cash += amt;
        this.log(`💹 ${h.name} 持有 ${shares} 股，獲得股利 ${RG.U.money(amt)}。`);
      }
    }
  },
  marketTick() {
    RG.DISTRICTS.forEach((d) => {
      const m = this.market[d.id];
      m.factor = RG.U.clamp(m.factor + (1 - m.factor) * 0.08 + RG.U.randRange(-0.05, 0.05), 0.3, 4);
      m.history.push(this.stockPrice(d.id));
      if (m.history.length > 30) m.history.shift();
    });
  },

  // ---------- 付款與破產 ----------
  async pay(p, amount, to, reason) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    if (p.cash < amount) this.liquidate(p, amount);
    const paid = Math.min(p.cash, amount);
    p.cash -= paid;
    if (to) to.cash += paid;
    if (paid < amount) {
      this.log(`💸 ${p.name} 無法支付${reason || ''} ${RG.U.money(amount)}……`, 'bad');
      this.bankrupt(p);
    }
    this.io.render();
    return paid;
  },
  liquidate(p, need) {
    // 先賣股票，再以 70% 價值賣地給銀行
    for (const d of RG.DISTRICTS) {
      if (p.cash >= need) break;
      if (!p.stocks[d.id]) continue;
      const price = this.stockPrice(d.id);
      const n = Math.min(p.stocks[d.id], Math.ceil((need - p.cash) / price));
      const got = this.sellStock(p, d.id, n, true);
      this.log(`⚠️ ${p.name} 現金不足，被迫賣出 ${d.stock} ${n} 股（${RG.U.money(got)}）。`, 'bad');
    }
    const lands = this.landsOf(p).sort((a, b) => this.landValue(a) - this.landValue(b));
    for (const t of lands) {
      if (p.cash >= need) break;
      const v = Math.round(this.landValue(t) * 0.7);
      p.cash += v;
      this.releaseLand(t);
      this.log(`⚠️ ${p.name} 被迫變賣「${t.name}」，得到 ${RG.U.money(v)}。`, 'bad');
    }
  },
  releaseLand(t) {
    const owner = this.ownerOf(t);
    if (t.guardian && owner) owner.discard.push(t.guardian.id);
    t.owner = null;
    t.level = 0;
    t.guardian = null;
  },
  bankrupt(p) {
    p.bankrupt = true;
    p.cash = 0;
    this.landsOf(p).forEach((t) => this.releaseLand(t));
    RG.DISTRICTS.forEach((d) => (p.stocks[d.id] = 0));
    p.god = null;
    this.log(`☠️ ${p.name} 破產了！`, 'bad');
    this.checkEnd();
  },

  // ---------- 停留格子 ----------
  async landOn(p) {
    const t = this.tile(p.pos);
    this.io.render();
    switch (t.type) {
      case 'land':
        return this.landOnProperty(p, t);
      case 'chance':
        return this.chanceEvent(p);
      case 'news':
        return this.newsEvent(p);
      case 'shop':
        return this.cardShop(p);
      case 'points': {
        const n = 20 + RG.U.rand(4) * 10;
        p.points += n;
        this.log(`🎟️ ${p.name} 獲得 ${n} 點券。`);
        return;
      }
      case 'monster':
        return this.monsterEncounter(p);
      case 'hospital':
        return this.hospitalVisit(p);
      case 'temple':
        return this.templeVisit(p);
      case 'broker':
        return this.stockTradeOffer(p, 'broker');
      case 'magic': {
        const a = this.drawCard(p);
        const b = this.drawCard(p);
        this.heal(p, this.maxHp(p) * 0.3);
        const names = [a, b].filter(Boolean).map((id) => `「${RG.card(id).name}」`).join('');
        this.log(`🔮 魔法陣發光：${p.name} 抽了 2 張卡${p.isCPU ? '' : names}，並回復 HP。`);
        return;
      }
      default:
        return;
    }
  },

  async landOnProperty(p, t) {
    if (t.owner == null) return this.offerPurchase(p, t);
    if (t.owner === p.id) return this.offerUpgrade(p, t);
    return this.visitEnemyLand(p, t);
  },

  async offerPurchase(p, t) {
    if (p.god && p.god.type === 'land') {
      t.owner = p.id;
      this.log(`🧓 土地公顯靈！${p.name} 免費取得「${t.name}」。`, 'good');
      await this.offerSummon(p, t);
      return;
    }
    const price = this.buyPrice(t, p);
    if (p.cash < price) return;
    const yes = await this.decide(p, 'buyLand', { t, price }, async () => {
      const ans = await this.io.choose(p, {
        title: `購買「${t.name}」？`,
        text: `${RG.DISTRICTS.find((d) => d.id === t.district).name}・${RG.ELEMENTS[t.element].icon}${RG.ELEMENTS[t.element].name}屬性\n價格 ${RG.U.money(price)}（現金 ${RG.U.money(p.cash)}）`,
        tile: t.idx,
        options: [
          { id: 'yes', label: `購買 ${RG.U.money(price)}` },
          { id: 'no', label: '不買' },
        ],
      });
      return ans === 'yes';
    });
    if (!yes) return;
    p.cash -= price;
    t.owner = p.id;
    this.log(`🏷️ ${p.name} 買下「${t.name}」（${RG.U.money(price)}）。`);
    this.io.render();
    await this.offerSummon(p, t);
  },

  // 停在自己的地產：可投資加蓋同商圈任一塊自己的地（Fortune Street 式投資）
  async offerUpgrade(p, t) {
    const d = RG.DISTRICTS.find((x) => x.id === t.district);
    await this.offerInvest(p, this.landsOf(p).filter((x) => x.district === t.district), `🏗️ 投資${d.name}`, 2, t);
    if (!t.guardian) await this.offerSummon(p, t);
  },

  async offerInvest(p, lands, title, maxTimes, focus) {
    for (let i = 0; i < maxTimes; i++) {
      const cands = lands.filter((x) => x.level < 5 && this.upgradeCost(x, p) <= p.cash);
      if (!cands.length) return;
      const pick = await this.decide(p, 'investPick', { cands }, () =>
        this.io.choose(p, {
          title,
          text: `選擇要加蓋的地產（還可加蓋 ${maxTimes - i} 次，現金 ${RG.U.money(p.cash)}）`,
          tile: focus ? focus.idx : undefined,
          options: [
            ...cands.map((x) => {
              const before = this.toll(x);
              x.level++;
              const after = this.toll(x);
              x.level--;
              return {
                id: String(x.idx),
                label: `${x.name}：${RG.LEVEL_NAMES[x.level]} → ${RG.LEVEL_NAMES[x.level + 1]}　${RG.U.money(this.upgradeCost(x, p))}`,
                sub: `過路費 ${RG.U.money(before)} → ${RG.U.money(after)}`,
              };
            }),
            { id: 'no', label: '不加蓋' },
          ],
        })
      );
      if (pick == null || pick === 'no') return;
      const x = this.board[+pick];
      const cost = this.upgradeCost(x, p);
      p.cash -= cost;
      x.level++;
      this.log(`🏗️ ${p.name} 把「${x.name}」加蓋成${RG.LEVEL_NAMES[x.level]}（${RG.U.money(cost)}）。`);
      this.io.render();
    }
  },

  // Culdcept：派駐守護獸
  async offerSummon(p, t) {
    const options = p.hand
      .map((id, idx) => ({ id, idx, c: RG.card(id) }))
      .filter((o) => o.c.type === 'creature' && o.c.cost <= p.cash);
    if (!options.length || t.guardian) return;
    const idx = await this.decide(p, 'summonGuardian', { t, options }, () =>
      this.io.pickHandCard(p, {
        title: `派駐守護獸到「${t.name}」？（${RG.ELEMENTS[t.element].icon}屬性相同過路費 ×1.4，否則 ×1.2）`,
        filter: (id) => RG.card(id).type === 'creature' && RG.card(id).cost <= p.cash,
        allowNone: true,
        tile: t.idx,
      })
    );
    if (idx == null) return;
    const c = RG.card(p.hand[idx]);
    p.hand.splice(idx, 1);
    p.cash -= c.cost;
    t.guardian = { id: c.id, hp: c.hp, maxHp: c.hp };
    this.log(`${c.icon} ${p.name} 召喚「${c.name}」守護「${t.name}」（${RG.U.money(c.cost)}）。`);
    this.io.render();
  },

  async visitEnemyLand(p, t) {
    const owner = this.ownerOf(t);
    // Culdcept：有守護獸 → 可以用生物卡侵略
    if (t.guardian) {
      const attackers = p.hand
        .map((id, idx) => ({ id, idx, c: RG.card(id) }))
        .filter((o) => o.c.type === 'creature' && !(o.c.abilities || []).includes('wall') && o.c.cost <= p.cash);
      if (attackers.length) {
        const plan = await this.decide(p, 'invadePlan', { t, attackers }, () => this.io.invadeDialog(p, t));
        if (plan) {
          const result = await this.invasion(p, t, plan.creatureIdx, plan.itemIdx);
          if (result === 'win' || p.bankrupt) return;
        }
      }
    }
    if (this.tile(p.pos) !== t || t.owner === p.id || t.owner == null) return;
    const bd = this.tollBreakdown(t, p);
    let toll = bd.total;
    if (owner.status.hospital > 0) {
      this.log(`🏥 ${owner.name} 住院中，${p.name} 免付過路費。`);
      toll = 0;
    } else {
      const fp = p.hand.indexOf('freepass');
      if (fp >= 0 && toll > 0) {
        this.discardFromHand(p, fp);
        this.log(`🎫 ${p.name} 使用免費卡，免付「${t.name}」過路費 ${RG.U.money(toll)}。`, 'good');
        toll = 0;
      }
    }
    if (toll > 0) {
      await this.io.tollNotice(p, t, bd);
      const paid = await this.pay(p, toll, owner, '過路費');
      this.log(`💰 ${p.name} 支付 ${owner.name} 過路費 ${RG.U.money(paid)}（${t.name}）。`, 'pay');
      if (paid > 0) this.payDividends(t, paid, p);
      if (p.bankrupt) return;
    }
    // Fortune Street：沒有守護獸的地產可以 5 倍價格強制收購
    if (!t.guardian && t.owner != null && t.owner !== p.id) {
      const cost = this.landValue(t) * 5;
      if (p.cash >= cost) {
        const yes = await this.decide(p, 'buyout', { t, cost }, async () => {
          const ans = await this.io.choose(p, {
            title: `強制收購「${t.name}」？`,
            text: `沒有守護獸的地產可用 5 倍價值收購。\n花費 ${RG.U.money(cost)}，原地主 ${owner.name} 得到 ${RG.U.money(this.landValue(t) * 3)}。`,
            tile: t.idx,
            options: [
              { id: 'yes', label: `收購 ${RG.U.money(cost)}` },
              { id: 'no', label: '算了' },
            ],
          });
          return ans === 'yes';
        });
        if (yes) {
          p.cash -= cost;
          owner.cash += this.landValue(t) * 3;
          t.owner = p.id;
          this.log(`🤝 ${p.name} 以 ${RG.U.money(cost)} 強制收購了 ${owner.name} 的「${t.name}」！`, 'bad');
          this.io.render();
        }
      }
    }
  },

  async hospitalVisit(p) {
    if (p.hp >= this.maxHp(p) || p.cash < 100) return;
    const yes = await this.decide(p, 'hospitalHeal', {}, async () => {
      const ans = await this.io.choose(p, {
        title: '🏥 醫院',
        text: `支付 $100 回滿 HP？（目前 ${p.hp}/${this.maxHp(p)}）`,
        options: [
          { id: 'yes', label: '治療 $100' },
          { id: 'no', label: '不用' },
        ],
      });
      return ans === 'yes';
    });
    if (yes) {
      p.cash -= 100;
      p.hp = this.maxHp(p);
      this.log(`🏥 ${p.name} 在醫院回滿了 HP。`);
    }
  },
});
