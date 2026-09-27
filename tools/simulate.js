// 無介面模擬：讓 4 名電腦玩家對戰多局，用來測試規則與平衡
// 用法：node tools/simulate.js [局數]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = [
  'js/util.js',
  'js/data/board.js',
  'js/data/cards.js',
  'js/data/world.js',
  'js/engine/game.js',
  'js/engine/economy.js',
  'js/engine/battle.js',
  'js/engine/effects.js',
  'js/engine/ai.js',
  'js/engine/save.js',
];
const ctx = { console, setTimeout, Math, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const RG = ctx.RG;

const noop = async () => {};
function makeIO(logs) {
  return {
    log: (m) => logs.push(m),
    render: () => {},
    turnStart: noop,
    pause: noop,
    moveStep: noop,
    showDice: noop,
    notify: noop,
    toast: () => {},
    cardFlash: noop,
    tollNotice: noop,
    battleOpen: noop,
    battleUpdate: noop,
    battleClose: noop,
    invasionResult: noop,
    gameOver: noop,
  };
}

async function main() {
  const n = +process.argv[2] || 20;
  const stats = { rounds: [], reasons: {}, winners: {}, jobs: {}, invasions: 0, invadeWins: 0, battles: 0, promotions: 0, buyouts: 0, bankrupts: 0 };
  for (let i = 0; i < n; i++) {
    const logs = [];
    const chars = RG.U.shuffle(RG.CHARACTERS.slice()).slice(0, 4);
    const game = new RG.Game(
      {
        ...(process.env.DICE ? { dice: +process.env.DICE } : {}),
        ...(process.env.TARGET ? { target: +process.env.TARGET } : {}),
        players: chars.map((c, k) => ({
          name: c.name,
          icon: c.icon,
          color: c.color,
          job: process.env.JOB || c.job,
          deck: RG.PRESET_DECKS[process.env.DECKS ? process.env.DECKS.split(',')[k] : c.deck].cards,
          isCPU: true,
        })),
      },
      makeIO(logs)
    );
    try {
      await game.run();
    } catch (e) {
      console.error('Game crashed at round', game.round);
      console.error(logs.slice(-15).join('\n'));
      throw e;
    }
    stats.rounds.push(game.round);
    stats.nw = stats.nw || [];
    stats.nw.push(game.ranking().map((p) => `${p.name}:${game.netWorth(p)}`).join(' '));
    stats.reasons[game.winReason] = (stats.reasons[game.winReason] || 0) + 1;
    stats.winners[game.winner.name] = (stats.winners[game.winner.name] || 0) + 1;
    stats.jobs[game.winner.job] = (stats.jobs[game.winner.job] || 0) + 1;
    const wi = game.players.indexOf(game.winner);
    if (process.env.DECKS) stats.decks = stats.decks || {}, (stats.decks[process.env.DECKS.split(',')[wi]] = (stats.decks[process.env.DECKS.split(',')[wi]] || 0) + 1);
    stats.invasions += logs.filter((l) => l.includes('侵略 ')).length;
    stats.invadeWins += logs.filter((l) => l.includes('侵略成功')).length;
    stats.battles += logs.filter((l) => l.includes('出現了') || l.includes('發起決鬥')).length;
    stats.promotions += logs.filter((l) => l.includes('次升遷')).length;
    stats.buyouts += logs.filter((l) => l.includes('強制收購')).length;
    stats.bankrupts += logs.filter((l) => l.includes('破產了')).length;
    if (i === 0) fs.writeFileSync(path.join(__dirname, '..', '.sim-log.txt'), logs.join('\n'));
  }
  if (process.env.NW) console.log(stats.nw.slice(0, 8).join('\n'));
  const avg = stats.rounds.reduce((a, b) => a + b, 0) / n;
  console.log(`games=${n} avgRounds=${avg.toFixed(1)} min=${Math.min(...stats.rounds)} max=${Math.max(...stats.rounds)}`);
  console.log('reasons', stats.reasons);
  console.log('winners', stats.winners);
  console.log('winnerJobs', stats.jobs);
  if (stats.decks) console.log('winnerDecks', stats.decks);
  console.log('per game: invasions', (stats.invasions / n).toFixed(1), 'invadeWins', (stats.invadeWins / n).toFixed(1), 'battles', (stats.battles / n).toFixed(1), 'promotions', (stats.promotions / n).toFixed(1), 'buyouts', (stats.buyouts / n).toFixed(1), 'bankrupts', (stats.bankrupts / n).toFixed(1));
}
// 存檔測試：在第 10 回合的存檔點存檔，用存檔建立新遊戲並跑完整局
async function saveRoundTrip() {
  let saved = null;
  const chars = RG.CHARACTERS.slice(0, 4);
  const cfg = { players: chars.map((c) => ({ name: c.name, icon: c.icon, color: c.color, job: c.job, deck: RG.PRESET_DECKS[c.deck].cards, isCPU: true })) };
  const io = makeIO([]);
  io.checkpoint = (cp) => {
    if (!saved && cp.round >= 10) saved = JSON.stringify(cp);
  };
  await new RG.Game(cfg, io).run();
  if (!saved) return console.log('save test: game ended before round 10');
  const data = JSON.parse(saved);
  const g2 = new RG.Game(data.config, makeIO([]), data);
  const again = g2.serialize();
  delete again.savedAt;
  delete data.savedAt;
  if (JSON.stringify(again) !== JSON.stringify(data)) throw new Error('save round-trip mismatch');
  await g2.run();
  console.log(`save test: OK（從第 ${data.round} 回合讀檔，第 ${g2.round} 回合結束，${g2.winner.name} 獲勝）`);
}

main()
  .then(saveRoundTrip)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
