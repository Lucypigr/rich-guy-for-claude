// 戰鬥：Dokapon 猜拳式角色戰鬥 ＋ Culdcept 生物侵略戰
var RG = (globalThis.RG = globalThis.RG || {});

RG.ATTACK_CMDS = {
  attack: { name: '攻擊', icon: '⚔️', desc: '一般攻擊。被「防禦」減半。' },
  strike: { name: '重擊', icon: '💥', desc: '兩倍傷害，但被「反擊」會反彈。' },
  magic: { name: '魔法', icon: '✴️', desc: '依魔力造成傷害，被「魔防」大幅削減。' },
  skill: { name: '技能', icon: '🌟', desc: '職業技能，每場戰鬥限用一次。' },
};
RG.DEFENSE_CMDS = {
  defend: { name: '防禦', icon: '🛡️', desc: '「攻擊」傷害減半，「重擊」小幅減傷。' },
  counter: { name: '反擊', icon: '🔁', desc: '看穿「重擊」並反彈傷害；其他攻擊全吃。' },
  mguard: { name: '魔防', icon: '🔰', desc: '大幅減少「魔法」傷害；物理攻擊全吃。' },
};

Object.assign(RG.Game.prototype, {
  fighterFromPlayer(p) {
    const s = this.stats(p);
    return {
      kind: 'player', ref: p, name: p.name, icon: p.icon, job: p.job,
      hp: p.hp, maxHp: s.hp, atk: s.atk, def: s.def, mag: s.mag, spd: s.spd,
      boost: p.turn && p.turn.boost && this.turnPlayer === p, skillUsed: false, isCPU: p.isCPU,
    };
  },
  fighterFromMonster(m) {
    return {
      kind: 'monster', ref: m, name: m.name, icon: m.icon, job: null,
      hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, mag: m.mag, spd: m.spd,
      boost: false, skillUsed: true, isCPU: true,
    };
  },

  physDmg(att, dfd, mult) {
    const atk = att.atk * (att.boost ? 1.5 : 1) * RG.U.randRange(0.85, 1.15);
    return Math.max(1, Math.round((atk - dfd.def * 0.4) * mult));
  },
  magDmg(att, dfd, mult) {
    const mag = att.mag * RG.U.randRange(0.85, 1.15) * 1.3;
    return Math.max(1, Math.round((mag - dfd.def * 0.2) * mult));
  },

  // 單次攻防判定
  resolveExchange(att, dfd, a, d) {
    const r = { a, d, dmg: 0, back: 0, heal: 0, text: '', extra: null };
    const DEF = d === 'defend', CTR = d === 'counter', MG = d === 'mguard';
    if (a === 'attack') {
      r.dmg = this.physDmg(att, dfd, DEF ? 0.5 : 1);
      r.text = DEF ? '被防禦住了，傷害減半。' : '命中！';
    } else if (a === 'strike') {
      if (CTR) {
        r.back = this.physDmg(dfd, att, 1.5);
        r.text = '重擊被看穿，遭到反擊！';
      } else {
        r.dmg = this.physDmg(att, dfd, DEF ? 1.2 : 2);
        r.text = DEF ? '重擊貫穿了防禦！' : '重擊直接命中！';
      }
    } else if (a === 'magic') {
      r.dmg = this.magDmg(att, dfd, MG ? 0.35 : 1);
      r.text = MG ? '魔防擋下了大部分魔法。' : '魔法命中！';
    } else if (a === 'skill') {
      att.skillUsed = true;
      switch (att.job) {
        case 'warrior':
          r.dmg = this.physDmg(att, dfd, 1.8);
          r.text = '怒濤斬！無視防禦的猛烈一擊。';
          break;
        case 'magician':
          r.dmg = this.magDmg(att, dfd, MG ? 0.9 : 1.8);
          r.text = '隕石術從天而降！';
          break;
        case 'thief':
          r.dmg = this.physDmg(att, dfd, DEF ? 0.5 : 1);
          r.extra = 'steal';
          r.text = '偷竊！';
          break;
        case 'cleric':
          r.heal = Math.round(att.maxHp * 0.6);
          r.text = '治癒術，回復了 HP。';
          break;
        case 'alchemist':
          r.dmg = this.physDmg(att, dfd, DEF ? 0.5 : 1);
          r.extra = 'gold';
          r.text = '點金術！';
          break;
        case 'ninja':
          r.dmg = this.physDmg(att, dfd, DEF ? 0.4 : 0.8) + this.physDmg(att, dfd, DEF ? 0.4 : 0.8);
          r.text = '影分身連續攻擊！';
          break;
        case 'hero':
          r.dmg = this.physDmg(att, dfd, 2.2);
          r.text = '勇者之劍！';
          break;
        default:
          r.dmg = this.physDmg(att, dfd, 1);
      }
    }
    return r;
  },

  async chooseAttack(att, dfd, ctx) {
    if (att.isCPU) return RG.AI.battleAttack(this, att, dfd);
    return this.io.battleCommand(att.ref, ctx, 'attack', att);
  },
  async chooseDefense(dfd, att, ctx) {
    if (dfd.isCPU) return RG.AI.battleDefense(this, dfd, att);
    return this.io.battleCommand(dfd.ref, ctx, 'defense', dfd);
  },

  // Dokapon 戰鬥：依速度決定先後，雙方各攻擊兩次
  async fight(A, B, title) {
    const [first, second] = A.spd > B.spd || (A.spd === B.spd && RG.U.chance(0.5)) ? [A, B] : [B, A];
    const ctx = { title, A, B, lines: [] };
    await this.io.battleOpen(ctx);
    A.gold = 0;
    B.gold = 0;
    outer: for (let round = 1; round <= 2; round++) {
      for (const [att, dfd] of [[first, second], [second, first]]) {
        ctx.round = round;
        const a = await this.chooseAttack(att, dfd, ctx);
        const d = await this.chooseDefense(dfd, att, ctx);
        const r = this.resolveExchange(att, dfd, a, d);
        dfd.hp = Math.max(0, dfd.hp - r.dmg);
        att.hp = Math.max(0, att.hp - r.back);
        att.hp = Math.min(att.maxHp, att.hp + r.heal);
        if (r.extra === 'steal' && r.dmg > 0) {
          if (dfd.kind === 'player' && dfd.ref.hand.length) {
            const stolen = this.removeRandomCard(dfd.ref);
            att.ref.hand.push(stolen);
            r.text += `偷走了「${RG.card(stolen).name}」！`;
          } else if (dfd.kind === 'monster') {
            att.gold += r.dmg * 8;
            r.text += `偷到 $${r.dmg * 8}！`;
          }
        }
        if (r.extra === 'gold' && att.kind === 'player') {
          att.gold += r.dmg * 8;
          r.text += `變出 $${r.dmg * 8}！`;
        }
        const line = `${att.icon}${att.name}【${RG.ATTACK_CMDS[a].name}】 vs ${dfd.icon}${dfd.name}【${RG.DEFENSE_CMDS[d].name}】：${r.text}${r.dmg ? ` ${dfd.name} -${r.dmg}` : ''}${r.back ? ` ${att.name} -${r.back}` : ''}${r.heal ? ` ${att.name} +${r.heal}` : ''}`;
        ctx.lines.push(line);
        await this.io.battleUpdate(ctx, { att, dfd, r });
        if (A.hp <= 0 || B.hp <= 0) break outer;
      }
    }
    for (const f of [A, B]) if (f.kind === 'player' && f.gold) f.ref.cash += f.gold;
    let winner = null, loser = null;
    if (A.hp <= 0 && B.hp > 0) [winner, loser] = [B, A];
    else if (B.hp <= 0 && A.hp > 0) [winner, loser] = [A, B];
    ctx.result = winner ? `${winner.icon} ${winner.name} 獲勝！` : '不分勝負。';
    await this.io.battleClose(ctx);
    // 寫回玩家 HP
    for (const f of [A, B]) if (f.kind === 'player') f.ref.hp = f.hp;
    return { winner, loser };
  },

  knockOut(p) {
    p.hp = 0;
    p.status.hospital = 2;
    const h = this.board.findIndex((t) => t.type === 'hospital');
    p.pos = h;
    this.log(`🚑 ${p.name} 被打倒，送往醫院休養 2 回合。`, 'bad');
  },

  // ---------- 魔物巢穴 ----------
  async monsterEncounter(p) {
    if (p.hp <= 0) return;
    const pool = RG.MONSTERS.filter((m) => m.lv <= p.level + 2 && m.lv >= p.level - 3);
    const base = RG.U.pick(pool.length ? pool : RG.MONSTERS);
    const bonus = Math.max(0, this.round - 10) * 0.02;
    const m = Object.assign({}, base, {
      hp: Math.round(base.hp * (1 + bonus)),
      atk: Math.round(base.atk * (1 + bonus)),
    });
    this.log(`${m.icon} 魔物「${m.name}」(Lv${m.lv}) 出現了！`);
    const P = this.fighterFromPlayer(p);
    const M = this.fighterFromMonster(m);
    const { winner } = await this.fight(P, M, `魔物巢穴：${m.name}`);
    if (winner === P) {
      p.cash += m.gold;
      this.log(`🏅 ${p.name} 擊敗了 ${m.name}，獲得 ${RG.U.money(m.gold)} 與 ${m.exp} 經驗值。`, 'good');
      this.gainExp(p, m.exp);
      this.recordJobWin(p);
      if (RG.U.chance(0.3)) {
        const pool2 = RG.CARDS.filter((c) => c.type === 'creature' || c.type === 'item');
        const c = RG.U.pick(pool2);
        p.hand.push(c.id);
        this.log(`🎁 ${m.name} 掉落了「${c.name}」卡！`, 'good');
      }
    } else if (winner === M) {
      this.knockOut(p);
    } else {
      this.gainExp(p, Math.round(m.exp / 3));
      this.log(`${m.name} 逃走了。${p.name} 獲得 ${Math.round(m.exp / 3)} 經驗值。`);
    }
    this.io.render();
  },

  // ---------- 玩家對戰（Dokapon PvP）----------
  async checkPvP(p) {
    const t = this.tile(p.pos);
    if (t.type === 'hospital' || p.hp <= 0) return;
    const targets = this.others(p).filter((q) => q.pos === p.pos && q.status.hospital === 0 && q.hp > 0);
    if (!targets.length) return;
    const target = await this.decide(p, 'challenge', { targets }, async () => {
      const ans = await this.io.choose(p, {
        title: '⚔️ 狹路相逢',
        text: '這一格有其他玩家，要發起決鬥嗎？勝者可奪取對方 15% 現金或 1 張手牌。',
        options: [
          ...targets.map((q) => ({ id: String(q.id), label: `挑戰 ${q.icon}${q.name}`, sub: `Lv${q.level} ${RG.JOBS[q.job].name} HP ${q.hp}` })),
          { id: 'no', label: '不打' },
        ],
      });
      return ans && ans !== 'no' ? this.players[+ans] : null;
    });
    if (!target) return;
    this.log(`⚔️ ${p.name} 向 ${target.name} 發起決鬥！`);
    const A = this.fighterFromPlayer(p);
    const B = this.fighterFromPlayer(target);
    const { winner, loser } = await this.fight(A, B, `決鬥：${p.name} vs ${target.name}`);
    if (!winner) return;
    const w = winner.ref, l = loser.ref;
    this.gainExp(w, 10 + l.level * 5);
    this.recordJobWin(w);
    const reward = await this.decide(w, 'pvpReward', { loser: l }, async () => {
      const ans = await this.io.choose(w, {
        title: `🏆 ${w.name} 獲勝！`,
        text: `要從 ${l.name} 身上奪取什麼？`,
        options: [
          { id: 'cash', label: `現金 ${RG.U.money(l.cash * 0.15)}` },
          { id: 'card', label: '隨機 1 張手牌', disabled: !l.hand.length },
        ],
      });
      return ans || 'cash';
    });
    if (reward === 'card' && l.hand.length) {
      const id = this.removeRandomCard(l);
      w.hand.push(id);
      this.log(`🃏 ${w.name} 奪走了 ${l.name} 的「${RG.card(id).name}」。`, 'bad');
    } else {
      const amt = Math.round(l.cash * 0.15);
      l.cash -= amt;
      w.cash += amt;
      this.log(`💰 ${w.name} 奪走了 ${l.name} ${RG.U.money(amt)}。`, 'bad');
    }
    this.knockOut(l);
    this.io.render();
  },

  // ---------- Culdcept 侵略戰 ----------
  creatureSide(card, item, extra) {
    const abil = new Set(card.abilities || []);
    if (item && item.grant) abil.add(item.grant);
    (extra || []).forEach((a) => abil.add(a));
    return { card, item, abil, st: card.st + (item ? item.st : 0), hp: 0 };
  },

  async invasion(p, t, creatureIdx, itemIdx) {
    const owner = this.ownerOf(t);
    const atkId = p.hand[creatureIdx];
    const itemId = itemIdx != null ? p.hand[itemIdx] : null;
    // 從手牌移除（先移除較大的索引）
    [creatureIdx, itemIdx].filter((i) => i != null).sort((a, b) => b - a).forEach((i) => p.hand.splice(i, 1));
    const aCard = RG.card(atkId);
    const aItem = itemId ? RG.card(itemId) : null;
    p.cash -= aCard.cost + (aItem ? aItem.cost : 0);

    // 防守方選擇道具
    const dIdx = await this.decide(owner, 'defenseItem', { t, aCard, aItem }, () =>
      this.io.pickHandCard(owner, {
        title: `${p.name} 用「${aCard.name}」侵略你的「${t.name}」！要使用道具防守嗎？`,
        filter: (id) => RG.card(id).type === 'item' && RG.card(id).cost <= owner.cash,
        allowNone: true,
        tile: t.idx,
      })
    );
    let dItem = null;
    if (dIdx != null) {
      dItem = RG.card(owner.hand[dIdx]);
      owner.hand.splice(dIdx, 1);
      owner.cash -= dItem.cost;
      owner.discard.push(dItem.id);
    }
    const dCard = RG.card(t.guardian.id);
    const A = this.creatureSide(aCard, aItem, p.job === 'ninja' ? ['first'] : []);
    A.hp = aCard.hp + (aItem ? aItem.hp : 0);
    if (p.turn.boost) A.st += 10;
    const D = this.creatureSide(dCard, dItem);
    const landBonus = dCard.element === t.element && t.element !== 'neutral' && !A.abil.has('pierce') ? 10 * (t.level + 1) : 0;
    const dItemHp = dItem ? dItem.hp : 0;
    D.hp = t.guardian.hp + dItemHp + landBonus;
    const dStartHp = D.hp;

    const lines = [];
    lines.push(`${aCard.icon}${aCard.name}${aItem ? `＋${aItem.name}` : ''}（ST ${A.st} / HP ${A.hp}）侵略 ${dCard.icon}${dCard.name}${dItem ? `＋${dItem.name}` : ''}（ST ${D.st} / HP ${D.hp}${landBonus ? `，含地形加成 +${landBonus}` : ''}）`);
    const order = D.abil.has('first') && !A.abil.has('first') ? [D, A] : [A, D];
    const strike = (x, y) => {
      if (x.hp <= 0 || x.st <= 0) return;
      y.hp -= x.st;
      lines.push(`${x.card.icon}${x.card.name} 攻擊 ${x.st} → ${y.card.name} HP ${Math.max(0, y.hp)}`);
      if (y.abil.has('reflect')) {
        const back = Math.floor(x.st / 2);
        x.hp -= back;
        lines.push(`${y.card.name} 的反射彈回 ${back} → ${x.card.name} HP ${Math.max(0, x.hp)}`);
      }
    };
    strike(order[0], order[1]);
    if (order[1].hp > 0) strike(order[1], order[0]);

    if (aItem) p.discard.push(aItem.id);
    const aDead = A.hp <= 0, dDead = D.hp <= 0;
    let result;
    const sendAway = (pl, card) => {
      if ((card.abilities || []).includes('rebirth')) {
        pl.hand.push(card.id);
        lines.push(`${card.name} 浴火重生，回到 ${pl.name} 的手牌。`);
      } else pl.discard.push(card.id);
    };
    if (dDead && !aDead) {
      result = 'win';
      sendAway(owner, dCard);
      const aItemHp = aItem ? aItem.hp : 0;
      const hpLeft = Math.min(aCard.hp, A.hp - Math.max(0, aItemHp));
      t.owner = p.id;
      t.guardian = {
        id: aCard.id,
        hp: A.abil.has('regen') ? aCard.hp : Math.max(1, hpLeft),
        maxHp: aCard.hp,
      };
      lines.push(`🚩 侵略成功！${p.name} 奪下了「${t.name}」（${RG.LEVEL_NAMES[t.level]}）！`);
    } else {
      if (dDead) {
        sendAway(owner, dCard);
        t.guardian = null;
        lines.push('雙方同歸於盡，地產失去守護獸。');
      } else {
        const taken = dStartHp - D.hp;
        const newHp = t.guardian.hp - Math.max(0, taken - dItemHp - landBonus);
        t.guardian.hp = D.abil.has('regen') ? t.guardian.maxHp : Math.max(1, newHp);
      }
      if (aDead) {
        sendAway(p, aCard);
        result = 'lose';
        lines.push(`侵略失敗，${aCard.name} 陣亡。`);
      } else {
        p.hand.push(aCard.id);
        result = 'draw';
        lines.push(`${aCard.name} 撤退回到手牌。`);
      }
    }
    lines.forEach((l) => this.log(l, result === 'win' ? 'bad' : ''));
    await this.io.invasionResult(p, t, { lines, result, defender: owner });
    this.io.render();
    return result;
  },
});
