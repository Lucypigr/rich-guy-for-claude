// 開局設定、牌組編輯器（Culdcept 式構築）、規則說明
var RG = (globalThis.RG = globalThis.RG || {});

RG.Setup = {
  KEY: 'rg-setup-v1',
  state: null,

  defaults() {
    const pick = ['beibei', 'xiaomei', 'qian', 'ninja'];
    return {
      slots: pick.map((cid, i) => {
        const c = RG.CHARACTERS.find((x) => x.id === cid);
        return { on: true, charId: cid, isCPU: i > 0, job: c.job, deckKey: c.deck, custom: null };
      }),
      options: { dice: 2, target: 10000, maxRounds: 40, startCash: 3000, speed: 1 },
    };
  },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY));
      if (s && s.slots && s.slots.length === 4) return s;
    } catch (e) {
      /* 瀏覽器不允許儲存時使用預設值 */
    }
    return this.defaults();
  },
  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch (e) {
      /* 忽略 */
    }
  },

  show() {
    RG.UI.game = null;
    document.getElementById('modal-root').innerHTML = '';
    document.querySelectorAll('.pick-banner').forEach((b) => b.remove());
    if (!this.state) this.state = this.load();
    this.draw();
  },

  seg(name, value, choices) {
    return `<div class="seg" data-seg="${name}">${choices
      .map(([v, label]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`)
      .join('')}</div>`;
  },

  draw() {
    const st = this.state;
    const app = document.getElementById('app');
    const jobs = Object.entries(RG.JOBS).filter(([, j]) => !j.advanced);
    const decks = Object.entries(RG.PRESET_DECKS);
    const slotHTML = st.slots
      .map((s, i) => {
        const c = RG.CHARACTERS.find((x) => x.id === s.charId);
        const j = RG.JOBS[s.job];
        const deckName = s.deckKey === 'custom' ? '自訂牌組' : RG.PRESET_DECKS[s.deckKey].name;
        return `<div class="slot ${s.on ? '' : 'off'}" style="--c:${c.color}" data-slot="${i}">
          <div class="slot-head"><span class="avatar" style="--c:${c.color}">${c.icon}</span>
            <div style="flex:1"><b>玩家 ${i + 1}</b><div class="d-sub">${s.on ? (s.isCPU ? '電腦' : '真人') : '不參加'}</div></div>
            ${i >= 2 ? `<button class="btn small" data-toggle>${s.on ? '移除' : '加入'}</button>` : ''}</div>
          ${s.on ? `
          <label class="field">控制${this.seg('cpu' + i, s.isCPU ? 1 : 0, [[0, '真人'], [1, '電腦']])}</label>
          <label class="field" for="char-${i}">角色（大富翁8）<select id="char-${i}" data-char>${RG.CHARACTERS.map((x) => `<option value="${x.id}" ${x.id === s.charId ? 'selected' : ''}>${x.icon} ${x.name}</option>`).join('')}</select></label>
          <label class="field" for="job-${i}">職業（Dokapon）<select id="job-${i}" data-job>${jobs.map(([id, x]) => `<option value="${id}" ${id === s.job ? 'selected' : ''}>${x.icon} ${x.name}</option>`).join('')}</select></label>
          <div class="job-note">⚡${j.skill.name}：${j.skill.desc}<br>🌿${j.field.name}：${j.field.desc}</div>
          <label class="field" for="deck-${i}">牌組（Culdcept，20 張）<select id="deck-${i}" data-deck>${decks.map(([id, d]) => `<option value="${id}" ${id === s.deckKey ? 'selected' : ''}>${d.name}</option>`).join('')}<option value="custom" ${s.deckKey === 'custom' ? 'selected' : ''}>自訂牌組${s.custom ? '' : '（未建立）'}</option></select></label>
          <div class="job-note">${s.deckKey === 'custom' ? '自己構築的 20 張牌組。' : RG.PRESET_DECKS[s.deckKey].desc}</div>
          <button class="btn small" data-build>🃏 編輯「${deckName}」</button>` : ''}
        </div>`;
      })
      .join('');
    const o = st.options;
    app.innerHTML = `<div class="setup">
      <div class="hero">
        <div>
          <h1>群英<span>大富翁</span></h1>
          <p>以《大富翁8》的地產與卡片為主軸，融合《Dokapon Kingdom》的職業與猜拳戰鬥、《Culdcept》的牌組構築與生物守地、《Fortune Street》的商圈股票與升遷薪水。先讓總資產達標並回到銀行的人獲勝。</p>
        </div>
        <div class="pillars">
          <div class="pillar"><b>🃏 大富翁8</b><span>買地加蓋、均貧卡、查稅卡、怪獸卡、神明附身</span></div>
          <div class="pillar"><b>⚔️ Dokapon Kingdom</b><span>職業技能、攻擊/重擊/魔法 vs 防禦/反擊/魔防</span></div>
          <div class="pillar"><b>📖 Culdcept</b><span>20 張牌組、守護獸、屬性連鎖、侵略奪地</span></div>
          <div class="pillar"><b>📈 Fortune Street</b><span>商圈股票、股利、花色升遷、5 倍收購</span></div>
        </div>
      </div>
      <div class="slots">${slotHTML}</div>
      <div class="opts">
        <label class="field">骰子${this.seg('dice', o.dice, [[1, '1 顆（慢）'], [2, '2 顆（標準）']])}</label>
        <label class="field">目標資產${this.seg('target', o.target, [[8000, '8千'], [10000, '1萬'], [15000, '1.5萬']])}</label>
        <label class="field">回合上限${this.seg('maxRounds', o.maxRounds, [[30, '30'], [40, '40'], [60, '60']])}</label>
        <label class="field">起始現金${this.seg('startCash', o.startCash, [[2000, '2千'], [3000, '3千'], [5000, '5千']])}</label>
        <label class="field">電腦速度${this.seg('speed', o.speed, [[1.6, '慢'], [1, '中'], [0.35, '快']])}</label>
      </div>
      <div class="row end"><button class="btn" data-rules>📜 規則說明</button><button class="btn" data-reset>恢復預設</button><button class="btn primary" data-start style="padding:10px 28px;font-size:16px">開始遊戲</button></div>
    </div>`;

    app.querySelectorAll('[data-slot]').forEach((el) => {
      const i = +el.dataset.slot;
      const s = st.slots[i];
      const q = (sel) => el.querySelector(sel);
      if (q('[data-toggle]')) q('[data-toggle]').onclick = () => { s.on = !s.on; this.commit(); };
      if (!s.on) return;
      q('[data-char]').onchange = (e) => {
        const c = RG.CHARACTERS.find((x) => x.id === e.target.value);
        s.charId = c.id;
        s.job = c.job;
        if (s.deckKey !== 'custom') s.deckKey = c.deck;
        this.commit();
      };
      q('[data-job]').onchange = (e) => { s.job = e.target.value; this.commit(); };
      q('[data-deck]').onchange = async (e) => {
        s.deckKey = e.target.value;
        const charDeck = RG.CHARACTERS.find((x) => x.id === s.charId).deck;
        if (s.deckKey === 'custom' && !s.custom) s.custom = await this.deckBuilder(Object.assign({}, RG.PRESET_DECKS[charDeck].cards), `玩家 ${i + 1} 的自訂牌組`);
        if (s.deckKey === 'custom' && !s.custom) s.deckKey = charDeck;
        this.commit();
      };
      q('[data-build]').onclick = async () => {
        const base = s.deckKey === 'custom' && s.custom ? s.custom : RG.PRESET_DECKS[s.deckKey].cards;
        const res = await this.deckBuilder(Object.assign({}, base), `玩家 ${i + 1} 的牌組`);
        if (res) {
          s.custom = res;
          s.deckKey = 'custom';
          this.commit();
        }
      };
    });
    app.querySelectorAll('[data-seg]').forEach((el) => {
      el.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const name = el.dataset.seg;
          const v = +b.dataset.v;
          if (name.startsWith('cpu')) st.slots[+name.slice(3)].isCPU = !!v;
          else st.options[name] = v;
          this.commit();
        };
      });
    });
    app.querySelector('[data-rules]').onclick = () => this.rules();
    app.querySelector('[data-reset]').onclick = () => { this.state = this.defaults(); this.commit(); };
    app.querySelector('[data-start]').onclick = () => this.start();
  },

  commit() {
    this.save();
    this.draw();
  },

  start() {
    const st = this.state;
    const used = new Set();
    const players = st.slots
      .filter((s) => s.on)
      .map((s) => {
        let c = RG.CHARACTERS.find((x) => x.id === s.charId);
        if (used.has(c.id)) c = RG.CHARACTERS.find((x) => !used.has(x.id));
        used.add(c.id);
        const deck = s.deckKey === 'custom' && s.custom ? s.custom : RG.PRESET_DECKS[s.deckKey].cards;
        return { name: c.name, icon: c.icon, color: c.color, job: s.job, deck, isCPU: s.isCPU };
      });
    RG.UI.speed = st.options.speed;
    const io = RG.makeIO();
    const game = new RG.Game(
      { players, dice: st.options.dice, target: st.options.target, maxRounds: st.options.maxRounds, startCash: st.options.startCash },
      io
    );
    RG.UI.mount(game);
    game.run().catch((e) => {
      console.error(e);
      RG.UI.log('⚠️ 發生錯誤：' + e.message, 'bad');
    });
  },

  // ---------- 牌組編輯器 ----------
  deckBuilder(counts, title) {
    return new Promise((resolve) => {
      const d = RG.Dialogs.open('<div></div>', { wide: true });
      const groups = ['creature', 'item', 'spell', 'tool'];
      const draw = () => {
        const total = RG.deckCount(counts);
        const byType = groups.map((type) => {
          const n = RG.CARDS.filter((c) => c.type === type).reduce((s, c) => s + (counts[c.id] || 0), 0);
          return `${RG.CARD_TYPES[type].name} ${n}`;
        });
        const sections = groups
          .map((type) => {
            const items = RG.CARDS.filter((c) => c.type === type)
              .map((c) => {
                const n = counts[c.id] || 0;
                let line = '';
                if (c.type === 'creature') line = `${RG.ELEMENTS[c.element].icon} ST${c.st}/HP${c.hp}・$${c.cost}${(c.abilities || []).map((a) => '・' + RG.ABILITIES[a].name).join('')}`;
                else if (c.type === 'tool') line = c.desc;
                else line = `${c.desc}${c.type === 'item' ? `・$${c.cost}` : ''}`;
                return `<div class="db-item" style="--tc:${RG.CARD_TYPES[c.type].color}"><span class="db-icon">${c.icon}</span>
                  <div><div class="db-name">${c.name}</div><div class="db-desc">${RG.U.esc(line)}</div></div>
                  <div class="db-count"><button class="btn small" data-m="${c.id}" ${n ? '' : 'disabled'} aria-label="減少${c.name}">−</button><b class="num">${n}</b><button class="btn small" data-p="${c.id}" ${n >= RG.MAX_COPIES || total >= RG.DECK_SIZE ? 'disabled' : ''} aria-label="增加${c.name}">＋</button></div></div>`;
              })
              .join('');
            return `<h4 style="margin:12px 0 0;color:${RG.CARD_TYPES[type].color}">${RG.CARD_TYPES[type].name}卡</h4><div class="db-grid">${items}</div>`;
          })
          .join('');
        d.dlg.innerHTML = `<div class="db-bar"><h3>🃏 ${RG.U.esc(title)}</h3>
          <div class="row"><b class="num" style="font-size:18px;color:${total === RG.DECK_SIZE ? 'var(--good)' : 'var(--gold)'}">${total} / ${RG.DECK_SIZE}</b>
          <span class="d-sub">${byType.join('・')}・同名卡最多 ${RG.MAX_COPIES} 張</span>
          <span style="flex:1"></span>
          <select id="db-preset" style="width:auto"><option value="">套用預組…</option>${Object.entries(RG.PRESET_DECKS).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('')}</select>
          <button class="btn small" data-clear>清空</button><button class="btn small" data-fill>隨機補滿</button></div></div>
          <p class="d-sub">建議：生物卡 8～10 張（守地與侵略）、道具 2～3 張、其餘放法術與機會卡。卡片的現金花費在使用時支付。</p>
          ${sections}
          <div class="row end" style="margin-top:14px"><button class="btn" data-cancel>取消</button><button class="btn primary" data-ok ${total === RG.DECK_SIZE ? '' : 'disabled'}>完成（${total}/${RG.DECK_SIZE}）</button></div>`;
        d.dlg.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { counts[b.dataset.p] = (counts[b.dataset.p] || 0) + 1; draw(); }));
        d.dlg.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
          counts[b.dataset.m]--;
          if (!counts[b.dataset.m]) delete counts[b.dataset.m];
          draw();
        }));
        d.dlg.querySelector('#db-preset').onchange = (e) => {
          if (!e.target.value) return;
          counts = Object.assign({}, RG.PRESET_DECKS[e.target.value].cards);
          draw();
        };
        d.dlg.querySelector('[data-clear]').onclick = () => { counts = {}; draw(); };
        d.dlg.querySelector('[data-fill]').onclick = () => {
          let guard = 0;
          while (RG.deckCount(counts) < RG.DECK_SIZE && guard++ < 500) {
            const c = RG.U.pick(RG.CARDS);
            if ((counts[c.id] || 0) < RG.MAX_COPIES) counts[c.id] = (counts[c.id] || 0) + 1;
          }
          draw();
        };
        d.dlg.querySelector('[data-cancel]').onclick = () => { d.close(); resolve(null); };
        d.dlg.querySelector('[data-ok]').onclick = () => { d.close(); resolve(counts); };
      };
      draw();
    });
  },

  rules() {
    const html = `<div class="rules"><h3>📜 規則說明</h3>
      <p>每回合：<b>抽 1 張卡 → 擲骰前可使用法術/機會卡（魔法師可用 2 張）→ 擲骰移動 → 觸發停留格子 → 同格可決鬥</b>。總資產（現金＋地產價值＋股票市值）達到目標並回到銀行即獲勝；達回合上限時資產最高者獲勝。</p>
      <h4>🃏 大富翁8：地產、卡片與神明</h4>
      <ul>
        <li>停在空地可購買；停在自己的地可加蓋（0～5 層，平房到摩天樓），還能順便加蓋同商圈的其他自有地。</li>
        <li>停在對手的地要付過路費。地主住院時免付；手上有「免費卡」會自動抵銷。</li>
        <li>機會卡：均貧、均富、查稅、怪獸、拆屋、購地、換地、轉向、停留、烏龜、遙控骰子、機車、冬眠、陷害、紅卡/黑卡、路障、機器娃娃、請神/送神/嫁禍……在卡片屋用點券購買。</li>
        <li>神明會出現在地圖上，經過就附身 5 回合：財神、福神、土地公、天使（好）；窮神、衰神、惡魔（壞）。</li>
      </ul>
      <h4>⚔️ Dokapon Kingdom：職業與猜拳戰鬥</h4>
      <ul>
        <li>六種職業各有戰鬥技能與被動能力，打贏 ${RG.JOB_MASTERY_WINS} 場即「精通」；精通兩種職業後可在轉職神殿轉為「勇者」。</li>
        <li>戰鬥時攻方選 攻擊／重擊／魔法／技能，守方選 防禦／反擊／魔防：防禦讓攻擊減半，反擊會反彈重擊，魔防削弱魔法。速度快者先攻，各攻擊兩次。</li>
        <li>停在魔物巢穴要打魔物（賺錢與經驗）；和其他玩家停在同一格可以決鬥，勝者奪取 15% 現金或 1 張手牌，敗者住院 2 回合。</li>
      </ul>
      <h4>📖 Culdcept：牌組構築、守護獸與侵略</h4>
      <ul>
        <li>開局前每人準備 20 張牌組（同名最多 ${RG.MAX_COPIES} 張），起手 ${RG.START_HAND} 張、每回合抽 1 張、手牌上限 ${RG.HAND_LIMIT} 張，牌庫抽完會把棄牌洗回去。</li>
        <li>在自己的地產可召喚生物當守護獸：過路費 ×1.2，屬性與地相同時 ×1.4。同屬性地越多，「屬性連鎖」讓過路費越高。</li>
        <li>停在對手有守護獸的地，可用生物卡（可加道具）侵略：先攻者用 ST 打對方 HP，守護獸屬性與地相同時獲得「(層數+1)×10」HP 加成。打倒守護獸就奪下整塊地（含建築）。</li>
        <li>守護獸會在地主經過銀行時回滿 HP。有守護獸的地不能被收購、購地卡或換地卡奪走。</li>
      </ul>
      <h4>📈 Fortune Street：商圈、股票與升遷</h4>
      <ul>
        <li>地圖分六個商圈，每個商圈有自己的股票。股價約為商圈平均地價的 4%，加蓋會帶動股價；一次買賣 10 股以上也會推動股價。</li>
        <li>在銀行（經過或停留）與證券所可買股票，自己回合擲骰前隨時可賣。有人在該商圈付過路費時，股東每股分得 0.5% 的股利（最多 25%）。</li>
        <li>同商圈擁有越多塊地，過路費與地產價值越高；全包則過路費 ×2。沒有守護獸的地，對手付完過路費後可用 5 倍價值強制收購（原地主拿 3 倍）。</li>
        <li>收集 ♠♥♦♣ 四種花色後經過銀行即「升遷」，領取薪水並可投資加蓋兩次；平時經過銀行領 $200 並可投資一次。</li>
      </ul>
      <p class="src">本作為同人融合玩法，各系統為參考原作概念後重新設計的數值，並非原作的精確規則。</p>
      <div class="row end"><button class="btn primary">了解</button></div></div>`;
    const d = RG.Dialogs.open(html, { wide: true, dismiss: true });
    d.dlg.querySelector('.btn.primary').onclick = () => d.close();
  },
};
