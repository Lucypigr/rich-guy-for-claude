// 存檔管理：瀏覽器本機儲存（自動存檔＋3 個欄位）、存檔碼匯出匯入
var RG = (globalThis.RG = globalThis.RG || {});

RG.SaveStore = {
  PREFIX: 'rg-save-',
  SLOTS: ['1', '2', '3'],

  read(slot) {
    try {
      const raw = localStorage.getItem(this.PREFIX + slot);
      const data = raw ? JSON.parse(raw) : null;
      return data && data.cp && data.cp.v === RG.SAVE_VERSION ? data : null;
    } catch (e) {
      return null;
    }
  },
  write(slot, payload) {
    try {
      localStorage.setItem(this.PREFIX + slot, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(slot) {
    try {
      localStorage.removeItem(this.PREFIX + slot);
    } catch (e) {
      /* 忽略 */
    }
  },
  payload(game) {
    return { cp: game.checkpoint, log: (RG.UI.logLines || []).slice(-80) };
  },
  encode(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return 'RG1:' + btoa(bin);
  },
  decode(text) {
    const s = String(text || '').trim();
    let json = s;
    if (s.startsWith('RG1:')) {
      const bin = atob(s.slice(4));
      json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    const data = JSON.parse(json);
    if (!data || !data.cp || data.cp.v !== RG.SAVE_VERSION) throw new Error('不是這個遊戲的存檔，或版本不相容');
    return data;
  },
  describe(data) {
    const cp = data.cp;
    const d = new Date(2026, 0, cp.round);
    const who = cp.players[cp.turnIndex];
    const when = new Date(cp.savedAt);
    const pad = (n) => String(n).padStart(2, '0');
    return {
      title: `${d.getMonth() + 1}月${d.getDate()}日（第 ${cp.round} 天）・輪到 ${who ? who.icon + who.name : ''}`,
      sub: `${RG.saveSummary(cp)}\n存於 ${when.getMonth() + 1}/${when.getDate()} ${pad(when.getHours())}:${pad(when.getMinutes())}`,
    };
  },
};

Object.assign(RG.Dialogs, {
  // 存檔：選欄位
  saveMenu() {
    const g = RG.UI.game;
    if (!g || !g.checkpoint) return this.toast('目前還沒有可以存檔的進度');
    const S = RG.SaveStore;
    const payload = S.payload(g);
    const rows = S.SLOTS.map((slot) => {
      const d = S.read(slot);
      const info = d ? S.describe(d) : null;
      return `<button class="option" data-slot="${slot}"><span>💾 欄位 ${slot}${info ? `：${RG.U.esc(info.title)}` : '（空）'}</span>${info ? `<span class="o-sub">${RG.U.esc(info.sub)}${'\n'}點一下覆蓋</span>` : '<span class="o-sub">點一下存到這裡</span>'}</button>`;
    }).join('');
    const canDownload = window.self === window.top;
    const d = this.open(`<h3>💾 存檔</h3><p class="d-sub">存下「${RG.U.esc(S.describe(payload).title)}」這個回合開始時的狀態。每回合開始也會自動存檔。</p>
      <div class="options">${rows}</div>
      <div class="row end" style="margin-top:12px"><button class="btn" data-code>📋 匯出存檔碼</button>${canDownload ? '<button class="btn" data-file>⬇️ 下載存檔檔案</button>' : ''}<button class="btn primary" data-close>關閉</button></div>`, { dismiss: true });
    d.dlg.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => {
        const ok = S.write(b.dataset.slot, payload);
        d.close();
        this.toast(ok ? `✅ 已存到欄位 ${b.dataset.slot}` : '⚠️ 瀏覽器不允許儲存，請改用「匯出存檔碼」');
      };
    });
    d.dlg.querySelector('[data-code]').onclick = () => {
      d.close();
      this.exportCode(payload);
    };
    const f = d.dlg.querySelector('[data-file]');
    if (f)
      f.onclick = () => {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `群英大富翁-第${payload.cp.round}天.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
    d.dlg.querySelector('[data-close]').onclick = () => d.close();
  },

  exportCode(payload) {
    const code = RG.SaveStore.encode(payload);
    const d = this.open(`<h3>📋 存檔碼</h3><p class="d-sub">複製這段文字保存起來，之後在「讀取存檔 → 匯入」貼上就能繼續，換電腦或換瀏覽器也可以。</p>
      <textarea id="save-code" class="codebox" readonly>${code}</textarea>
      <div class="row end" style="margin-top:10px"><button class="btn" data-copy>複製</button><button class="btn primary" data-close>關閉</button></div>`, { dismiss: true });
    const ta = d.dlg.querySelector('textarea');
    d.dlg.querySelector('[data-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        this.toast('✅ 已複製存檔碼');
      } catch (e) {
        ta.focus();
        ta.select();
        this.toast('請按 Ctrl+C（或長按）複製已選取的文字');
      }
    };
    d.dlg.querySelector('[data-close]').onclick = () => d.close();
  },

  // 讀檔：自動存檔＋欄位＋匯入
  loadMenu() {
    const S = RG.SaveStore;
    const list = [['auto', '⏱️ 自動存檔'], ...S.SLOTS.map((s) => [s, `💾 欄位 ${s}`])];
    const rows = list
      .map(([slot, name]) => {
        const data = S.read(slot);
        if (!data) return `<div class="save-row empty"><b>${name}</b><span class="o-sub">（空）</span></div>`;
        const info = S.describe(data);
        return `<div class="save-row"><div><b>${name}：${RG.U.esc(info.title)}</b><div class="o-sub">${RG.U.esc(info.sub)}</div></div>
          <div class="row"><button class="btn small" data-del="${slot}" aria-label="刪除${name}">刪除</button><button class="btn small primary" data-load="${slot}">讀取</button></div></div>`;
      })
      .join('');
    const d = this.open(`<h3>📂 讀取存檔</h3><div class="save-list">${rows}</div>
      <h4 style="margin:14px 0 4px">匯入</h4>
      <textarea id="import-code" class="codebox" placeholder="在這裡貼上存檔碼（RG1:…）"></textarea>
      <div class="row" style="margin-top:8px"><label class="btn small filebtn">📄 選擇存檔檔案<input type="file" id="import-file" accept=".json,application/json" hidden></label><span style="flex:1"></span>
      <button class="btn" data-import>匯入並開始</button><button class="btn primary" data-close>關閉</button></div>
      <p class="d-sub" id="import-err"></p>`, { wide: true, dismiss: true });
    const start = (payload) => {
      d.close();
      RG.Setup.loadGame(payload);
    };
    d.dlg.querySelectorAll('[data-load]').forEach((b) => (b.onclick = () => start(S.read(b.dataset.load))));
    d.dlg.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.confirm) {
          S.remove(b.dataset.del);
          d.close();
          this.loadMenu();
          if (!RG.UI.game) RG.Setup.draw();
        } else {
          b.dataset.confirm = '1';
          b.textContent = '確定刪除？';
        }
      };
    });
    const err = d.dlg.querySelector('#import-err');
    const tryImport = (text) => {
      try {
        start(S.decode(text));
      } catch (e) {
        err.textContent = '⚠️ 無法讀取：' + e.message;
      }
    };
    d.dlg.querySelector('[data-import]').onclick = () => tryImport(d.dlg.querySelector('#import-code').value);
    d.dlg.querySelector('#import-file').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => tryImport(r.result);
      r.readAsText(f);
    };
    d.dlg.querySelector('[data-close]').onclick = () => d.close();
  },
});
