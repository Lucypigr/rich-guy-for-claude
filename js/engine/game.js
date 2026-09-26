// 遊戲核心：玩家、回合流程、移動
var RG = (globalThis.RG = globalThis.RG || {});

RG.HAND_LIMIT = 7;
RG.START_HAND = 4;

RG.Game = class Game {
  constructor(config, io) {
    this.io = io;
    this.config = Object.assign({ startCash: 3000, target: 10000, maxRounds: 40, dice: 2 }, config);
    this.board = RG.buildBoard();
    this.round = 1;
    this.over = false;
    this.winner = null;
    this.turnPlayer = null;
    this.market = {};
    RG.DISTRICTS.forEach((d) => (this.market[d.id] = { factor: 1, history: [] }));
    this.players = config.players.map((pc, i) => this.createPlayer(pc, i));
    RG.DISTRICTS.forEach((d) => this.market[d.id].history.push(this.stockPrice(d.id)));
    this.spawnGod();
  }

  createPlayer(pc, i) {
    const p = {
      id: i,
      name: pc.name,
      icon: pc.icon,
      color: pc.color,
      isCPU: !!pc.isCPU,
      cash: this.config.startCash,
      points: 30,
      pos: 0,
      dir: 1,
      job: pc.job || 'warrior',
      level: 1,
      exp: 0,
      hp: 0,
      jobWins: {},
      mastered: [],
      deck: RG.U.shuffle(RG.deckFromCounts(pc.deck)),
      hand: [],
      discard: [],
      suits: {},
      promotions: 0,
      stocks: {},
      god: null,
      status: { hospital: 0, sleep: 0, turtle: 0 },
      bankrupt: false,
      turn: {},
    };
    RG.DISTRICTS.forEach((d) => (p.stocks[d.id] = 0));
    p.hp = this.stats(p).hp;
    for (let k = 0; k < RG.START_HAND; k++) this.drawCard(p, true);
    return p;
  }

  // ---------- 角色能力（Dokapon）----------
  stats(p) {
    const j = RG.JOBS[p.job];
    const s = {};
    for (const k of ['hp', 'atk', 'def', 'mag', 'spd']) s[k] = j.base[k] + j.grow[k] * (p.level - 1);
    return s;
  }
  maxHp(p) {
    return this.stats(p).hp;
  }
  heal(p, amount) {
    p.hp = Math.min(this.maxHp(p), p.hp + Math.round(amount));
  }
  expToNext(p) {
    return 15 + p.level * 10;
  }
  gainExp(p, n) {
    p.exp += n;
    while (p.exp >= this.expToNext(p)) {
      p.exp -= this.expToNext(p);
      p.level++;
      p.hp += RG.JOBS[p.job].grow.hp;
      this.log(`⬆️ ${p.name} 升到 Lv${p.level}！`, 'good');
    }
  }
  recordJobWin(p) {
    p.jobWins[p.job] = (p.jobWins[p.job] || 0) + 1;
    if (p.jobWins[p.job] >= RG.JOB_MASTERY_WINS && !p.mastered.includes(p.job)) {
      p.mastered.push(p.job);
      this.log(`🎓 ${p.name} 精通了「${RG.JOBS[p.job].name}」！`, 'good');
      if (this.heroUnlocked(p)) this.log(`👑 ${p.name} 可以在轉職神殿轉職為「勇者」了！`, 'good');
    }
  }
  heroUnlocked(p) {
    return p.mastered.filter((j) => j !== 'hero').length >= 2;
  }

  // ---------- 卡片（Culdcept 牌庫）----------
  drawCard(p, silent) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) return null;
      p.deck = RG.U.shuffle(p.discard);
      p.discard = [];
      if (!silent) this.log(`${p.name} 的牌庫重新洗牌。`);
    }
    const id = p.deck.pop();
    p.hand.push(id);
    return id;
  }
  addToHand(p, id) {
    p.hand.push(id);
  }
  discardFromHand(p, idx) {
    const [id] = p.hand.splice(idx, 1);
    p.discard.push(id);
    return id;
  }
  removeRandomCard(p) {
    if (!p.hand.length) return null;
    const idx = RG.U.rand(p.hand.length);
    return p.hand.splice(idx, 1)[0];
  }

  // ---------- 工具 ----------
  log(msg, cls) {
    this.io.log(msg, cls);
  }
  active() {
    return this.players.filter((p) => !p.bankrupt);
  }
  others(p) {
    return this.active().filter((q) => q !== p);
  }
  tile(i) {
    return this.board[((i % 40) + 40) % 40];
  }
  landsOf(p) {
    return this.board.filter((t) => t.type === 'land' && t.owner === p.id);
  }
  ownerOf(t) {
    return t.owner == null ? null : this.players[t.owner];
  }
  distance(from, to, dir) {
    return (((to - from) * dir) % 40 + 40) % 40;
  }
  async decide(p, kind, ctx, human) {
    if (p.isCPU) return RG.AI[kind](this, p, ctx);
    return human();
  }

  // ---------- 主迴圈 ----------
  async run() {
    this.log('🎲 遊戲開始！先達到目標資產並回到銀行者獲勝。', 'sys');
    while (!this.over) {
      for (const p of this.players) {
        if (this.over) break;
        if (p.bankrupt) continue;
        await this.playTurn(p);
        this.checkEnd();
      }
      if (this.over) break;
      this.endRound();
    }
    this.io.render();
    await this.io.gameOver(this.ranking(), this.winner);
  }

  endRound() {
    this.round++;
    this.marketTick();
    if (this.round % 2 === 0 || RG.U.chance(0.35)) this.spawnGod();
    if (this.round > this.config.maxRounds) {
      const r = this.ranking();
      this.finish(r[0], `已達 ${this.config.maxRounds} 回合上限`);
    }
    this.io.render();
  }

  ranking() {
    return this.players
      .slice()
      .sort((a, b) => (a.bankrupt - b.bankrupt) || this.netWorth(b) - this.netWorth(a));
  }

  checkEnd() {
    if (this.over) return;
    const act = this.active();
    if (act.length <= 1) this.finish(act[0] || this.ranking()[0], '其他玩家都破產了');
  }

  finish(p, reason) {
    if (this.over) return;
    this.over = true;
    this.winner = p;
    this.winReason = reason;
    this.log(`🏆 ${p.name} 獲勝！（${reason}）`, 'win');
  }

  async playTurn(p) {
    this.turnPlayer = p;
    p.turn = { cardsUsed: 0, stay: false, fixedDice: null, motor: false, bonus: 0, boost: false };
    this.log(`— ${p.icon} ${p.name} 的回合（第 ${this.round} 回合）—`, 'turn');
    this.io.render();
    await this.io.turnStart(p);

    if (p.status.hospital > 0) {
      p.status.hospital--;
      if (p.status.hospital === 0) {
        p.hp = this.maxHp(p);
        this.log(`${p.name} 康復出院了。`);
      } else this.log(`${p.name} 在醫院休養中（剩 ${p.status.hospital} 回合）。`);
      await this.endTurn(p, false);
      return;
    }
    if (p.status.sleep > 0) {
      p.status.sleep--;
      this.log(`💤 ${p.name} 冬眠中，跳過回合。`);
      await this.endTurn(p, false);
      return;
    }

    // 回合開始：Dokapon 回復與職業被動
    this.heal(p, this.maxHp(p) * (p.job === 'cleric' ? 0.3 : 0.15));
    if (p.job === 'cleric') {
      this.landsOf(p).forEach((t) => {
        if (t.guardian) t.guardian.hp = Math.min(t.guardian.maxHp, t.guardian.hp + 10);
      });
    }
    if (p.job === 'warrior' && RG.U.chance(0.3)) {
      p.turn.boost = true;
      this.log(`🔥 ${p.name} 鬥志高昂！本回合戰鬥力大增。`, 'good');
    }
    if (p.god && p.god.type === 'bad') {
      const loss = Math.round(p.cash * 0.05);
      p.cash -= loss;
      const lost = this.removeRandomCard(p);
      this.log(`😵 衰神作祟：${p.name} 損失 ${RG.U.money(loss)}${lost ? `，並弄丟了「${RG.card(lost).name}」` : ''}。`, 'bad');
    }
    const drawn = this.drawCard(p);
    if (drawn && !p.isCPU) this.log(`${p.name} 抽到「${RG.card(drawn).name}」。`);
    this.io.render();

    await this.actionPhase(p);
    if (this.over || p.bankrupt) return;

    const steps = await this.rollDice(p);
    if (steps > 0) await this.move(p, steps);
    else if (p.turn.stay) {
      this.log(`⏸️ ${p.name} 停留在原地。`);
      const t = this.tile(p.pos);
      if (t.type === 'bank') await this.passBank(p, true);
    }
    if (this.over || p.bankrupt) return;
    await this.landOn(p);
    if (this.over || p.bankrupt) return;
    await this.checkPvP(p);
    if (p.bankrupt) return;
    await this.endTurn(p, true);
  }

  async endTurn(p, moved) {
    if (moved && p.status.turtle > 0) p.status.turtle--;
    if (p.god) {
      p.god.turns--;
      if (p.god.turns <= 0) {
        this.log(`${RG.GODS[p.god.type].icon} ${RG.GODS[p.god.type].name}離開了 ${p.name}。`);
        p.god = null;
      }
    }
    while (p.hand.length > RG.HAND_LIMIT) {
      const idx = await this.decide(p, 'discardChoice', {}, () =>
        this.io.pickHandCard(p, { title: `手牌上限 ${RG.HAND_LIMIT} 張，請選擇一張丟棄`, allowNone: false })
      );
      const id = this.discardFromHand(p, idx == null ? 0 : idx);
      this.log(`${p.name} 丟棄了「${RG.card(id).name}」。`);
    }
    this.io.render();
    await this.io.pause(p.isCPU ? 400 : 150);
  }

  // ---------- 擲骰前：使用卡片 ----------
  cardLimit(p) {
    return p.job === 'magician' ? 2 : 1;
  }
  async actionPhase(p) {
    for (let guard = 0; guard < 20; guard++) {
      if (this.over || p.bankrupt) return;
      const canPlay = p.turn.cardsUsed < this.cardLimit(p);
      if (p.isCPU) {
        if (!canPlay) return;
        const plan = RG.AI.chooseCard(this, p);
        if (!plan) return;
        await this.io.pause(350);
        const ok = await this.playCard(p, plan.idx, plan);
        if (!ok) return;
        continue;
      }
      const act = await this.io.actionPhase(p, { canPlay });
      if (!act || act.type === 'roll') return;
      if (act.type === 'card' && canPlay) await this.playCard(p, act.idx, null);
      if (act.type === 'stocks') await this.io.stockDialog(p, { canBuy: false });
      this.io.render();
    }
  }

  // ---------- 擲骰 ----------
  async rollDice(p) {
    if (p.turn.stay) return 0;
    let values;
    if (p.status.turtle > 0) {
      values = [1];
      this.log(`🐢 ${p.name} 被烏龜卡影響，只能走 1 步。`);
    } else if (p.turn.fixedDice) {
      values = [p.turn.fixedDice];
    } else {
      const n = this.config.dice + (p.turn.motor ? 1 : 0);
      values = Array.from({ length: n }, () => 1 + RG.U.rand(6));
    }
    const steps = values.reduce((a, b) => a + b, 0) + (p.status.turtle > 0 ? 0 : p.turn.bonus);
    await this.io.showDice(p, values, steps);
    this.log(`🎲 ${p.name} 擲出 ${values.join(' + ')}${p.turn.bonus && p.status.turtle <= 0 ? ` +${p.turn.bonus}` : ''}，前進 ${steps} 步。`);
    return steps;
  }

  // ---------- 移動 ----------
  async move(p, steps) {
    for (let s = 1; s <= steps; s++) {
      p.pos = (p.pos + p.dir + 40) % 40;
      const t = this.tile(p.pos);
      const last = s === steps;
      await this.io.moveStep(p);

      if (t.type === 'bank') await this.passBank(p, last);
      if (this.over || p.bankrupt) return;
      if (t.type === 'suit') this.collectSuit(p, t.suit);
      if (t.god) {
        const g = t.god;
        t.god = null;
        this.attachGod(p, g);
      }
      if (p.god && t.type === 'land' && t.owner != null) {
        if (p.god.type === 'angel' && t.level < 5) {
          t.level++;
          this.log(`😇 天使祝福：「${t.name}」加蓋成${RG.LEVEL_NAMES[t.level]}。`, 'good');
        } else if (p.god.type === 'devil' && t.level > 0) {
          t.level--;
          this.log(`😈 惡魔破壞：「${t.name}」拆成${RG.LEVEL_NAMES[t.level]}。`, 'bad');
        }
      }
      if (!last) {
        if (p.job === 'thief') {
          for (const q of this.others(p)) {
            if (q.pos === p.pos && q.hand.length && RG.U.chance(0.5)) {
              const id = this.removeRandomCard(q);
              p.hand.push(id);
              this.log(`🗝️ ${p.name} 扒走了 ${q.name} 的「${RG.card(id).name}」！`, 'bad');
            }
          }
        }
        if (t.block) {
          t.block = false;
          if (p.job === 'ninja') {
            this.log(`🌀 ${p.name} 使出隱身術，穿過了路障並將它拆除。`);
          } else {
            this.log(`🚧 ${p.name} 被路障擋下了！`, 'bad');
            this.io.render();
            return;
          }
        }
      }
      this.io.render();
    }
  }

  async moveTo(p, idx) {
    p.pos = idx;
    await this.io.moveStep(p);
    this.io.render();
  }

  collectSuit(p, suit) {
    if (!p.suits[suit]) {
      p.suits[suit] = true;
      this.log(`${RG.SUITS[suit].icon} ${p.name} 收集到「${RG.SUITS[suit].name}」。`);
    }
  }
  hasAllSuits(p) {
    return Object.keys(RG.SUITS).every((s) => p.suits[s]);
  }

  // ---------- 神明（大富翁8）----------
  spawnGod() {
    const onBoard = this.board.filter((t) => t.god).length;
    if (onBoard >= 2) return;
    const candidates = this.board.filter(
      (t) => !t.god && !['bank', 'hospital'].includes(t.type) && !this.players.some((p) => p.pos === t.idx)
    );
    if (!candidates.length) return;
    const t = RG.U.pick(candidates);
    t.god = RG.U.pick(Object.keys(RG.GODS));
    this.log(`${RG.GODS[t.god].icon} ${RG.GODS[t.god].name}出現在「${t.name}」。`, 'sys');
  }
  attachGod(p, type) {
    p.god = { type, turns: RG.GOD_TURNS };
    const g = RG.GODS[type];
    this.log(`${g.icon} ${g.name}附身在 ${p.name} 身上！${g.desc}`, g.good ? 'good' : 'bad');
  }

  // ---------- 銀行 / 升遷（Fortune Street）----------
  async passBank(p, landed) {
    this.landsOf(p).forEach((t) => {
      if (t.guardian) t.guardian.hp = t.guardian.maxHp;
    });
    const promoted = this.hasAllSuits(p);
    if (promoted) {
      p.promotions++;
      const landValue = this.landsOf(p).reduce((s, t) => s + this.landValue(t), 0);
      let salary = 400 + 150 * p.promotions + Math.round(landValue * 0.1);
      if (p.job === 'hero') salary = Math.round(salary * 1.5);
      p.cash += salary;
      p.points += 20;
      p.suits = {};
      this.log(`🎉 ${p.name} 集滿四種花色，第 ${p.promotions} 次升遷！領取薪水 ${RG.U.money(salary)} 與 20 點券。`, 'good');
    } else {
      p.cash += 200;
      this.log(`🏦 ${p.name} ${landed ? '停在' : '經過'}銀行，領取 $200。`);
    }
    this.io.render();
    // Fortune Street：在銀行可投資任一塊自己的地產（升遷時可投資 2 次）
    await this.offerInvest(p, this.landsOf(p), '🏦 銀行投資：可加蓋任一塊自己的地產', promoted ? 2 : 1);
    if (this.netWorth(p) >= this.config.target) {
      this.finish(p, `總資產達到 ${RG.U.money(this.config.target)} 並回到銀行`);
      return;
    }
    await this.stockTradeOffer(p, landed ? 'bank' : 'pass');
  }

  async stockTradeOffer(p, where) {
    if (p.isCPU) {
      RG.AI.tradeStocks(this, p, where);
      return;
    }
    if (where === 'pass') {
      const ans = await this.io.choose(p, {
        title: '🏦 經過銀行',
        text: '要順便買賣股票嗎？',
        options: [
          { id: 'yes', label: '開啟股市' },
          { id: 'no', label: '不用了' },
        ],
      });
      if (ans !== 'yes') return;
    }
    await this.io.stockDialog(p, { canBuy: true });
  }
};
