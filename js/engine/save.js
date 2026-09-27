// 存檔：把遊戲狀態轉成純資料（JSON），以及從存檔還原
var RG = (globalThis.RG = globalThis.RG || {});

RG.SAVE_VERSION = 1;

Object.assign(RG.Game.prototype, {
  serialize() {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    return {
      v: RG.SAVE_VERSION,
      savedAt: Date.now(),
      config: clone(Object.assign({}, this.config, { players: undefined })),
      round: this.round,
      turnIndex: this.turnIndex,
      market: clone(this.market),
      players: this.players.map((p) => {
        const c = clone(p);
        c.turn = {};
        return c;
      }),
      board: this.board.map((t) => ({
        owner: t.owner == null ? null : t.owner,
        level: t.level || 0,
        guardian: t.guardian ? clone(t.guardian) : null,
        element: t.element || null,
        god: t.god || null,
        block: !!t.block,
      })),
    };
  },

  restore(s) {
    if (!s || s.v !== RG.SAVE_VERSION) throw new Error('存檔版本不相容');
    this.config = Object.assign({}, this.config, s.config);
    this.round = s.round;
    this.turnIndex = s.turnIndex;
    this.market = JSON.parse(JSON.stringify(s.market));
    this.players = s.players.map((p) => Object.assign(JSON.parse(JSON.stringify(p)), { turn: {} }));
    s.board.forEach((b, i) => {
      const t = this.board[i];
      if (t.type === 'land') {
        t.owner = b.owner;
        t.level = b.level;
        t.guardian = b.guardian;
        t.element = b.element || t.element;
      }
      t.god = b.god || null;
      t.block = !!b.block;
    });
    this.resumed = true;
  },
});

// 存檔摘要（顯示在讀檔清單）
RG.saveSummary = function (s) {
  if (!s || !s.players) return '';
  const g = Object.create(RG.Game.prototype);
  g.board = RG.buildBoard();
  g.players = [];
  g.market = s.market;
  g.config = s.config;
  try {
    g.restore(s);
  } catch (e) {
    return '存檔損毀';
  }
  const ranking = g.players.slice().sort((a, b) => g.netWorth(b) - g.netWorth(a));
  return ranking.map((p) => `${p.icon}${p.name} ${RG.U.money(g.netWorth(p))}${p.bankrupt ? '（破產）' : ''}`).join('　');
};
