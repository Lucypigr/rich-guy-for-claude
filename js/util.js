// 共用工具函式
var RG = (globalThis.RG = globalThis.RG || {});

RG.U = {
  rand(n) {
    return Math.floor(Math.random() * n);
  },
  randRange(a, b) {
    return a + Math.random() * (b - a);
  },
  chance(p) {
    return Math.random() < p;
  },
  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  weighted(entries) {
    // entries: [[value, weight], ...]
    const total = entries.reduce((s, e) => s + Math.max(0, e[1]), 0);
    if (total <= 0) return entries[0][0];
    let r = Math.random() * total;
    for (const [v, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return v;
    }
    return entries[entries.length - 1][0];
  },
  clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  },
  money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  },
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  },
};
