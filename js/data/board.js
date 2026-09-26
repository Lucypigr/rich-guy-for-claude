// 地圖資料：40 格環狀地圖，六個商圈（Fortune Street 的 district + 股票）
var RG = (globalThis.RG = globalThis.RG || {});

RG.ELEMENTS = {
  fire: { name: '火', icon: '🔥', color: '#e4572e' },
  water: { name: '水', icon: '💧', color: '#2d7dd2' },
  earth: { name: '地', icon: '🌿', color: '#3f9b4a' },
  wind: { name: '風', icon: '🌪️', color: '#a4b52b' },
  neutral: { name: '無', icon: '⚪', color: '#8a8f98' },
};

RG.DISTRICTS = [
  { id: 'A', name: '西門町', stock: '西門開發', color: '#e05a7a', base: 180 },
  { id: 'B', name: '士林', stock: '士林夜市', color: '#f08a24', base: 220 },
  { id: 'C', name: '淡水', stock: '淡水漁港', color: '#2fa3b5', base: 260 },
  { id: 'D', name: '信義', stock: '信義金融', color: '#7a5cc4', base: 320 },
  { id: 'E', name: '九份', stock: '九份觀光', color: '#c49a2c', base: 380 },
  { id: 'F', name: '墾丁', stock: '墾丁度假', color: '#2f9e6b', base: 450 },
];

RG.SUITS = {
  spade: { icon: '♠', name: '黑桃' },
  heart: { icon: '♥', name: '紅心' },
  diamond: { icon: '♦', name: '方塊' },
  club: { icon: '♣', name: '梅花' },
};

RG.TILE_TYPES = {
  bank: { name: '銀行', icon: '🏦', desc: '起點。經過或停留可買股票；集滿四種花色後經過即「升遷」領薪水。' },
  land: { name: '地產', icon: '', desc: '可購買、加蓋、派駐守護獸。' },
  suit: { name: '花色', icon: '', desc: '經過或停留即收集此花色（Fortune Street）。' },
  chance: { name: '命運', icon: '❓', desc: '抽一張命運卡，好壞難料。' },
  shop: { name: '卡片屋', icon: '🃏', desc: '用點券購買大富翁8道具卡。' },
  points: { name: '點券', icon: '🎟️', desc: '獲得 20～50 點券。' },
  monster: { name: '魔物巢穴', icon: '👹', desc: '與魔物戰鬥（Dokapon 猜拳戰鬥），勝利可得經驗與金錢。' },
  hospital: { name: '醫院', icon: '🏥', desc: '戰敗者在此休養。停留可付 $100 回滿 HP。' },
  temple: { name: '轉職神殿', icon: '⛩️', desc: '可轉換職業（Dokapon），並回滿 HP。' },
  broker: { name: '證券所', icon: '📈', desc: '停留可買賣股票。' },
  news: { name: '新聞', icon: '📰', desc: '播報影響全體玩家的新聞事件。' },
  magic: { name: '魔法陣', icon: '🔮', desc: '抽 2 張卡並回復 HP（Culdcept）。' },
};

// [type, district/suit, element, priceOffset]
RG.BOARD_LAYOUT = [
  ['bank'],
  ['land', 'A', 'fire', 0],
  ['land', 'A', 'water', 10],
  ['suit', 'spade'],
  ['land', 'A', 'fire', 20],
  ['chance'],
  ['land', 'B', 'earth', 0],
  ['land', 'B', 'earth', 10],
  ['shop'],
  ['land', 'B', 'wind', 20],
  ['monster'],
  ['land', 'C', 'water', 0],
  ['points'],
  ['land', 'C', 'water', 10],
  ['land', 'C', 'wind', 20],
  ['broker'],
  ['suit', 'heart'],
  ['land', 'D', 'fire', 0],
  ['land', 'D', 'wind', 10],
  ['news'],
  ['hospital'],
  ['land', 'D', 'fire', 20],
  ['land', 'D', 'earth', 30],
  ['chance'],
  ['magic'],
  ['land', 'E', 'earth', 0],
  ['land', 'E', 'water', 10],
  ['suit', 'diamond'],
  ['land', 'E', 'earth', 20],
  ['monster'],
  ['temple'],
  ['land', 'F', 'wind', 0],
  ['land', 'F', 'fire', 10],
  ['shop'],
  ['land', 'F', 'water', 20],
  ['land', 'F', 'wind', 30],
  ['suit', 'club'],
  ['chance'],
  ['points'],
  ['land', 'A', 'earth', 30],
];

// 11x11 外圈座標（順時針：上排 → 右排 → 下排 → 左排）
RG.tileGridPos = function (i) {
  if (i <= 10) return { col: i + 1, row: 1 };
  if (i <= 20) return { col: 11, row: i - 10 + 1 };
  if (i <= 30) return { col: 11 - (i - 20), row: 11 };
  return { col: 1, row: 11 - (i - 30) };
};

RG.LAND_NAMES = {
  A: ['紅樓', '電影街', '萬年大樓', '捷運站前'],
  B: ['夜市口', '劍潭', '官邸', '芝山'],
  C: ['老街', '漁人碼頭', '紅毛城'],
  D: ['101 大樓', '市府廣場', '松菸', '象山'],
  E: ['豎崎路', '阿妹茶樓', '金瓜石'],
  F: ['大街', '南灣', '白沙灣', '鵝鑾鼻'],
};

RG.buildBoard = function () {
  const counters = {};
  return RG.BOARD_LAYOUT.map((def, i) => {
    const [type, a, b, c] = def;
    const t = { idx: i, type };
    if (type === 'land') {
      const d = RG.DISTRICTS.find((x) => x.id === a);
      counters[a] = (counters[a] || 0) + 1;
      t.district = a;
      t.element = b;
      t.price = d.base + c;
      t.name = RG.LAND_NAMES[a][counters[a] - 1] || d.name;
      t.owner = null;
      t.level = 0;
      t.guardian = null;
    } else if (type === 'suit') {
      t.suit = a;
      t.name = RG.SUITS[a].name;
    } else {
      t.name = RG.TILE_TYPES[type].name;
    }
    return t;
  });
};
