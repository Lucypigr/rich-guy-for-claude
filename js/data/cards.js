// 卡片資料
//  creature：Culdcept 生物卡，可派駐為地產的守護獸或用來侵略
//  item    ：Culdcept 道具卡，於侵略戰鬥中使用
//  spell   ：Culdcept 法術卡，擲骰前施放
//  tool    ：大富翁8 功能卡，擲骰前使用（卡片屋可用點券購買）
var RG = (globalThis.RG = globalThis.RG || {});

RG.CARD_TYPES = {
  creature: { name: '生物', color: '#b5473a' },
  item: { name: '道具', color: '#6b6f7d' },
  spell: { name: '法術', color: '#6a4bb5' },
  tool: { name: '機會', color: '#c7861b' },
};

RG.ABILITIES = {
  first: { name: '先制', desc: '戰鬥時先攻擊' },
  regen: { name: '再生', desc: '戰鬥結束後 HP 全滿' },
  pierce: { name: '穿透', desc: '無視對手的地形 HP 加成' },
  wall: { name: '堅守', desc: '只能防守，不能用於侵略' },
  rebirth: { name: '不死', desc: '陣亡時回到手牌' },
  reflect: { name: '反射', desc: '受到的傷害反彈一半給攻擊者' },
};

RG.CARDS = [
  // ---- 生物（Culdcept）----
  { id: 'salamander', type: 'creature', name: '火蜥蜴', icon: '🦎', element: 'fire', cost: 60, st: 30, hp: 30 },
  { id: 'hellhound', type: 'creature', name: '地獄犬', icon: '🐕', element: 'fire', cost: 90, st: 40, hp: 30, abilities: ['first'] },
  { id: 'firegiant', type: 'creature', name: '火焰巨人', icon: '👺', element: 'fire', cost: 150, st: 50, hp: 50 },
  { id: 'phoenix', type: 'creature', name: '鳳凰', icon: '🪶', element: 'fire', cost: 180, st: 30, hp: 40, abilities: ['regen', 'rebirth'] },
  { id: 'mermaid', type: 'creature', name: '人魚', icon: '🧜', element: 'water', cost: 60, st: 20, hp: 40 },
  { id: 'icesprite', type: 'creature', name: '冰精靈', icon: '❄️', element: 'water', cost: 80, st: 30, hp: 40, abilities: ['reflect'] },
  { id: 'seaserpent', type: 'creature', name: '海蛇', icon: '🐍', element: 'water', cost: 150, st: 40, hp: 60 },
  { id: 'leviathan', type: 'creature', name: '利維坦', icon: '🐋', element: 'water', cost: 230, st: 60, hp: 60 },
  { id: 'gargoyle', type: 'creature', name: '石像鬼', icon: '🗿', element: 'earth', cost: 70, st: 20, hp: 50 },
  { id: 'treant', type: 'creature', name: '樹人', icon: '🌳', element: 'earth', cost: 100, st: 30, hp: 50, abilities: ['regen'] },
  { id: 'troll', type: 'creature', name: '巨魔', icon: '👹', element: 'earth', cost: 130, st: 45, hp: 45 },
  { id: 'earthdragon', type: 'creature', name: '大地龍', icon: '🐉', element: 'earth', cost: 230, st: 55, hp: 70 },
  { id: 'harpy', type: 'creature', name: '鷹身女妖', icon: '🦅', element: 'wind', cost: 50, st: 30, hp: 20, abilities: ['first'] },
  { id: 'sylph', type: 'creature', name: '風精靈', icon: '🧚', element: 'wind', cost: 80, st: 30, hp: 30, abilities: ['pierce'] },
  { id: 'griffon', type: 'creature', name: '獅鷲', icon: '🦁', element: 'wind', cost: 130, st: 40, hp: 40, abilities: ['first'] },
  { id: 'thunderbird', type: 'creature', name: '雷鳥', icon: '⚡', element: 'wind', cost: 210, st: 55, hp: 45, abilities: ['pierce'] },
  { id: 'stonewall', type: 'creature', name: '石牆', icon: '🧱', element: 'neutral', cost: 50, st: 0, hp: 60, abilities: ['wall'] },
  { id: 'knight', type: 'creature', name: '流浪騎士', icon: '🛡️', element: 'neutral', cost: 110, st: 40, hp: 40 },

  // ---- 道具（Culdcept，戰鬥用）----
  { id: 'longsword', type: 'item', name: '長劍', icon: '🗡️', cost: 40, st: 20, hp: 0, desc: 'ST +20' },
  { id: 'greataxe', type: 'item', name: '巨斧', icon: '🪓', cost: 60, st: 35, hp: -10, desc: 'ST +35、HP -10' },
  { id: 'buckler', type: 'item', name: '圓盾', icon: '🔰', cost: 40, st: 0, hp: 25, desc: 'HP +25' },
  { id: 'holyarmor', type: 'item', name: '聖鎧', icon: '🥋', cost: 80, st: 0, hp: 40, desc: 'HP +40' },
  { id: 'swiftboots', type: 'item', name: '疾風靴', icon: '👢', cost: 30, st: 10, hp: 0, grant: 'first', desc: 'ST +10，獲得「先制」' },
  { id: 'mirror', type: 'item', name: '反射鏡', icon: '🪞', cost: 60, st: 0, hp: 10, grant: 'reflect', desc: 'HP +10，獲得「反射」' },

  // ---- 法術（Culdcept）----
  { id: 'fireball', type: 'spell', name: '火球術', icon: '☄️', cost: 80, target: 'guardedLand', desc: '對任一地產的守護獸造成 40 傷害，陣亡則移除。' },
  { id: 'terraform', type: 'spell', name: '地變術', icon: '🌋', cost: 60, target: 'ownLand', desc: '把自己一塊地產的屬性改成指定屬性。' },
  { id: 'fortify', type: 'spell', name: '築城術', icon: '🏯', cost: 150, target: 'ownLand', desc: '自己一塊地產免費加蓋一層（上限 3 層）。' },
  { id: 'manaspring', type: 'spell', name: '魔力泉', icon: '⛲', cost: 0, target: 'none', desc: '獲得 $200 + 回合數 × $15。' },
  { id: 'wisdom', type: 'spell', name: '智慧之書', icon: '📖', cost: 30, target: 'none', desc: '抽 2 張卡。' },
  { id: 'holylight', type: 'spell', name: '治癒之光', icon: '✨', cost: 50, target: 'none', desc: '自己 HP 全滿，所有守護獸 HP 全滿。' },
  { id: 'gale', type: 'spell', name: '疾風術', icon: '💨', cost: 40, target: 'none', desc: '本回合擲骰點數 +3。' },
  { id: 'soulsteal', type: 'spell', name: '奪魂術', icon: '👻', cost: 60, target: 'otherPlayer', desc: '隨機奪取目標 1 張手牌。' },

  // ---- 機會卡（大富翁8）----
  { id: 'turn', type: 'tool', name: '轉向卡', icon: '🔄', shop: 10, target: 'anyPlayer', desc: '讓指定玩家（含自己）掉頭行走。' },
  { id: 'stay', type: 'tool', name: '停留卡', icon: '⏸️', shop: 10, target: 'none', desc: '本回合原地不動，再次觸發所在格。' },
  { id: 'remote', type: 'tool', name: '遙控骰子', icon: '🎲', shop: 20, target: 'none', desc: '自己決定本回合要走幾步（最多為骰子數 × 6）。' },
  { id: 'motor', type: 'tool', name: '機車卡', icon: '🛵', shop: 15, target: 'none', desc: '本回合多擲 1 顆骰子。' },
  { id: 'turtle', type: 'tool', name: '烏龜卡', icon: '🐢', shop: 20, target: 'anyPlayer', desc: '目標接下來 3 回合每次只能走 1 步。' },
  { id: 'poor', type: 'tool', name: '均貧卡', icon: '⚖️', shop: 40, target: 'otherPlayer', desc: '與指定對手平分雙方現金。' },
  { id: 'rich', type: 'tool', name: '均富卡', icon: '🤝', shop: 30, target: 'none', desc: '所有玩家現金平均分配。' },
  { id: 'tax', type: 'tool', name: '查稅卡', icon: '🧾', shop: 30, target: 'otherPlayer', desc: '向指定對手收取其現金的 20%。' },
  { id: 'monster', type: 'tool', name: '怪獸卡', icon: '🦖', shop: 40, target: 'nearLand', desc: '摧毀前後 3 格內一塊地產上的所有建築。' },
  { id: 'demolish', type: 'tool', name: '拆屋卡', icon: '🔨', shop: 20, target: 'builtLand', desc: '任一地產拆掉一層建築。' },
  { id: 'buyland', type: 'tool', name: '購地卡', icon: '📜', shop: 50, target: 'hereLand', desc: '以 1.5 倍價值強制收購腳下沒有守護獸的對手地產。' },
  { id: 'swapland', type: 'tool', name: '換地卡', icon: '🔁', shop: 50, target: 'swapLand', desc: '用自己的一塊地，交換腳下沒有守護獸的對手地產。' },
  { id: 'hibernate', type: 'tool', name: '冬眠卡', icon: '💤', shop: 40, target: 'none', desc: '所有對手冬眠 1 回合。' },
  { id: 'summongod', type: 'tool', name: '請神符', icon: '🙏', shop: 20, target: 'none', desc: '把地圖上最近的神明請到自己身上。' },
  { id: 'dismissgod', type: 'tool', name: '送神符', icon: '🎐', shop: 15, target: 'none', desc: '送走附在自己身上的神明。' },
  { id: 'framegod', type: 'tool', name: '嫁禍卡', icon: '🫵', shop: 25, target: 'otherPlayer', desc: '把自己身上的神明轉嫁給對手。' },
  { id: 'redcard', type: 'tool', name: '紅卡', icon: '🟥', shop: 30, target: 'district', desc: '指定商圈股價漲停（×1.5）。' },
  { id: 'blackcard', type: 'tool', name: '黑卡', icon: '⬛', shop: 30, target: 'district', desc: '指定商圈股價跌停（×0.6）。' },
  { id: 'frame', type: 'tool', name: '陷害卡', icon: '🚑', shop: 30, target: 'otherPlayer', desc: '把對手送進醫院休養 2 回合。' },
  { id: 'roadblock', type: 'tool', name: '路障卡', icon: '🚧', shop: 10, target: 'aheadTile', desc: '在前方 1～8 格放置路障，經過者會被擋下。' },
  { id: 'robot', type: 'tool', name: '機器娃娃', icon: '🤖', shop: 10, target: 'none', desc: '清除前方 10 格內所有路障。' },
  { id: 'freepass', type: 'tool', name: '免費卡', icon: '🎫', shop: 20, target: 'passive', desc: '被動：自動抵銷下一次過路費。' },
];

RG.CARD_MAP = {};
RG.CARDS.forEach((c) => (RG.CARD_MAP[c.id] = c));
RG.card = (id) => RG.CARD_MAP[id];

RG.DECK_SIZE = 20;
RG.MAX_COPIES = 3;

// 預組牌庫（Culdcept 的「書」）
RG.PRESET_DECKS = {
  flame: {
    name: '烈焰突擊',
    desc: '火系生物搶地，搭配巨斧強攻。',
    cards: { salamander: 3, hellhound: 3, firegiant: 2, phoenix: 1, greataxe: 2, longsword: 1, fireball: 2, fortify: 1, poor: 1, tax: 1, monster: 1, motor: 1, turn: 1 },
  },
  fortress: {
    name: '大地堡壘',
    desc: '地系高 HP 守護獸，穩健收過路費。',
    cards: { gargoyle: 3, treant: 3, troll: 2, earthdragon: 1, stonewall: 1, buckler: 2, holyarmor: 1, fortify: 2, manaspring: 1, tax: 1, freepass: 1, remote: 1, roadblock: 1 },
  },
  tycoon: {
    name: '財閥流',
    desc: '法術與機會卡操控股市與現金。',
    cards: { mermaid: 2, seaserpent: 2, knight: 3, stonewall: 1, manaspring: 2, wisdom: 1, redcard: 2, blackcard: 1, poor: 1, tax: 1, buyland: 1, swapland: 1, rich: 1, freepass: 1 },
  },
  arcane: {
    name: '水之魔導書',
    desc: '水系生物配合大量法術，靈活控場。',
    cards: { mermaid: 2, icesprite: 2, seaserpent: 2, leviathan: 1, mirror: 1, fireball: 2, terraform: 1, fortify: 2, wisdom: 1, manaspring: 1, holylight: 1, poor: 1, gale: 1, remote: 1, redcard: 1 },
  },
  tempest: {
    name: '風暴游擊',
    desc: '先制與穿透的風系生物，快速侵略。',
    cards: { harpy: 3, sylph: 3, griffon: 2, thunderbird: 1, swiftboots: 2, longsword: 1, gale: 2, soulsteal: 1, turtle: 1, frame: 1, hibernate: 1, summongod: 1, framegod: 1 },
  },
};

RG.deckFromCounts = function (counts) {
  const deck = [];
  Object.entries(counts).forEach(([id, n]) => {
    for (let i = 0; i < n; i++) deck.push(id);
  });
  return deck;
};

RG.deckCount = function (counts) {
  return Object.values(counts).reduce((s, n) => s + n, 0);
};
