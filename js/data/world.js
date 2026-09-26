// 角色、職業（Dokapon）、魔物、神明（大富翁8）、命運與新聞事件
var RG = (globalThis.RG = globalThis.RG || {});

// 大富翁8 經典角色
RG.CHARACTERS = [
  { id: 'atu', name: '阿土伯', icon: '👴', color: '#e0a526', job: 'cleric', deck: 'fortress' },
  { id: 'xiaomei', name: '孫小美', icon: '👧', color: '#e8558b', job: 'magician', deck: 'arcane' },
  { id: 'qian', name: '錢夫人', icon: '👩‍💼', color: '#9a63d6', job: 'alchemist', deck: 'tycoon' },
  { id: 'ninja', name: '忍太郎', icon: '🥷', color: '#3a8fd6', job: 'ninja', deck: 'tempest' },
  { id: 'beibei', name: '金貝貝', icon: '👦', color: '#2fb07a', job: 'warrior', deck: 'flame' },
  { id: 'salon', name: '沙隆巴斯', icon: '🧔', color: '#d9612b', job: 'thief', deck: 'tempest' },
];

// Dokapon 職業：base = Lv1 能力，grow = 每升一級成長
RG.JOBS = {
  warrior: {
    name: '戰士', icon: '⚔️',
    base: { hp: 44, atk: 14, def: 9, mag: 5, spd: 8 },
    grow: { hp: 6, atk: 3, def: 2, mag: 1, spd: 1 },
    skill: { name: '怒濤斬', desc: '攻擊 ×1.8，無視「防禦」。' },
    field: { name: '鬥志', desc: '回合開始 30% 機率鬥志高昂：戰鬥攻擊 ×1.5，生物侵略 ST +10。' },
  },
  magician: {
    name: '魔法師', icon: '🪄',
    base: { hp: 36, atk: 8, def: 7, mag: 15, spd: 8 },
    grow: { hp: 4, atk: 1, def: 1, mag: 3, spd: 1 },
    skill: { name: '隕石術', desc: '魔法 ×1.8，「魔防」只能減半。' },
    field: { name: '雙重詠唱', desc: '每回合可使用 2 張法術/機會卡，法術花費 -20%。' },
  },
  thief: {
    name: '盜賊', icon: '🗝️',
    base: { hp: 38, atk: 11, def: 7, mag: 7, spd: 13 },
    grow: { hp: 5, atk: 2, def: 1, mag: 1, spd: 3 },
    skill: { name: '偷竊', desc: '一般攻擊並偷走對手 1 張手牌（對魔物則偷金錢）。' },
    field: { name: '扒竊', desc: '經過其他玩家時 50% 機率偷走 1 張手牌。' },
  },
  cleric: {
    name: '僧侶', icon: '📿',
    base: { hp: 48, atk: 9, def: 11, mag: 10, spd: 7 },
    grow: { hp: 6, atk: 1, def: 2, mag: 2, spd: 1 },
    skill: { name: '治癒術', desc: '回復 60% 最大 HP。' },
    field: { name: '聖光', desc: '每回合額外回復 HP，所有守護獸每回合回復 10 HP。' },
  },
  alchemist: {
    name: '煉金術士', icon: '⚗️',
    base: { hp: 38, atk: 10, def: 8, mag: 12, spd: 9 },
    grow: { hp: 5, atk: 2, def: 2, mag: 2, spd: 1 },
    skill: { name: '點金術', desc: '一般攻擊，並把造成的傷害 ×$8 變成金錢。' },
    field: { name: '理財', desc: '股票股利 ×1.3，卡片屋打 8 折。' },
  },
  ninja: {
    name: '忍者', icon: '🌀',
    base: { hp: 38, atk: 12, def: 8, mag: 8, spd: 12 },
    grow: { hp: 5, atk: 2, def: 1, mag: 1, spd: 2 },
    skill: { name: '影分身', desc: '連續兩次攻擊（各 ×0.8），不會被「反擊」。' },
    field: { name: '隱身術', desc: '無視路障；侵略時生物獲得「先制」。' },
  },
  hero: {
    name: '勇者', icon: '👑', advanced: true,
    base: { hp: 50, atk: 14, def: 11, mag: 12, spd: 11 },
    grow: { hp: 6, atk: 3, def: 2, mag: 2, spd: 2 },
    skill: { name: '勇者之劍', desc: '攻擊 ×2.2，無視「防禦」與「反擊」。' },
    field: { name: '王者風範', desc: '收取的過路費 +15%，升遷薪水 +50%。' },
    unlock: '精通任兩種職業後，在轉職神殿解鎖。',
  },
};
RG.JOB_MASTERY_WINS = 3;

// Dokapon 魔物
RG.MONSTERS = [
  { name: '史萊姆', icon: '🟢', lv: 1, hp: 22, atk: 9, def: 3, mag: 3, spd: 4, exp: 10, gold: 80 },
  { name: '哥布林', icon: '👺', lv: 2, hp: 28, atk: 11, def: 5, mag: 2, spd: 7, exp: 14, gold: 110 },
  { name: '骷髏兵', icon: '💀', lv: 3, hp: 34, atk: 13, def: 8, mag: 4, spd: 5, exp: 18, gold: 140 },
  { name: '妖狐', icon: '🦊', lv: 4, hp: 36, atk: 11, def: 6, mag: 15, spd: 11, exp: 22, gold: 170 },
  { name: '狼人', icon: '🐺', lv: 5, hp: 48, atk: 17, def: 9, mag: 5, spd: 11, exp: 28, gold: 210 },
  { name: '石像魔', icon: '🗿', lv: 6, hp: 60, atk: 18, def: 16, mag: 8, spd: 6, exp: 34, gold: 250 },
  { name: '黑暗法師', icon: '🧙', lv: 7, hp: 54, atk: 12, def: 10, mag: 22, spd: 9, exp: 40, gold: 300 },
  { name: '巨龍', icon: '🐲', lv: 9, hp: 90, atk: 25, def: 17, mag: 20, spd: 10, exp: 70, gold: 520 },
];

// 大富翁8 神明（附身 5 回合）
RG.GODS = {
  wealth: { name: '財神', icon: '💰', good: true, desc: '收取的過路費 ×2。' },
  fortune: { name: '福神', icon: '🍀', good: true, desc: '購地與加蓋半價。' },
  land: { name: '土地公', icon: '🧓', good: true, desc: '停在無主空地時免費取得。' },
  angel: { name: '天使', icon: '😇', good: true, desc: '經過的地產（不論誰的）都加蓋一層。' },
  poverty: { name: '窮神', icon: '🥶', good: false, desc: '支付的過路費 ×2。' },
  bad: { name: '衰神', icon: '😵', good: false, desc: '每回合損失 5% 現金並隨機丟掉 1 張手牌。' },
  devil: { name: '惡魔', icon: '😈', good: false, desc: '經過的地產（不論誰的）都拆掉一層。' },
};
RG.GOD_TURNS = 5;

// 命運卡（大富翁的機會/命運 ＋ Fortune Street 的 Venture Card）
RG.CHANCE_EVENTS = [
  { id: 'wallet', text: '在路邊撿到錢包，獲得 $250。' },
  { id: 'ticket', text: '違規停車被開罰單，支付 $150。' },
  { id: 'dividend', text: '公司發放特別股利：獲得持股市值的 8%。' },
  { id: 'repair', text: '房屋修繕：每層建築支付 $30。' },
  { id: 'lottery', text: '買了一張彩券……' },
  { id: 'points', text: '集點活動，獲得 40 點券。' },
  { id: 'tobank', text: '銀行來電，立刻前往銀行！' },
  { id: 'back3', text: '走錯路了，後退 3 格。' },
  { id: 'card', text: '路人送你一張機會卡。' },
  { id: 'suit', text: '撿到一張撲克牌：獲得一個還沒有的花色。' },
  { id: 'ambush', text: '被魔物偷襲，HP 減少 30%。' },
  { id: 'god', text: '一陣光芒閃過……有神明附身了！' },
  { id: 'upgrade', text: '都市計畫受惠：你隨機一塊地產免費加蓋一層。' },
  { id: 'charity', text: '慈善捐款：把現金的 10% 捐給最窮的玩家。' },
  { id: 'birthday', text: '今天是你生日！每位玩家送你 $100。' },
  { id: 'insider', text: '聽到內線消息：指定一個商圈，股價上漲 20%。' },
  { id: 'hospital', text: '吃壞肚子，住院 1 回合。' },
  { id: 'exp', text: '參加劍術講習，獲得 20 經驗值。' },
];

RG.NEWS_EVENTS = [
  { id: 'bull', text: '📈 股市大漲！所有股價上漲 20%。' },
  { id: 'bear', text: '📉 股市崩盤！所有股價下跌 20%。' },
  { id: 'typhoon', text: '🌀 颱風來襲！某商圈所有建築倒塌一層。' },
  { id: 'redenvelope', text: '🧧 政府發放紅包，每人獲得 $300。' },
  { id: 'taxall', text: '🧾 國稅局大查稅，每人繳交現金的 10%。' },
  { id: 'gods', text: '⛩️ 眾神下凡，地圖上出現新的神明。' },
  { id: 'riot', text: '👹 魔物暴動，所有玩家 HP 減少 25%。' },
  { id: 'manatide', text: '🔮 魔力潮汐，所有玩家抽 2 張卡。' },
  { id: 'renewal', text: '🏗️ 都市更新！某商圈所有已持有地產加蓋一層。' },
  { id: 'health', text: '🏥 全民健保日，所有玩家 HP 全滿、出院。' },
];
