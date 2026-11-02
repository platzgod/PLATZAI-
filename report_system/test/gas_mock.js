// Google Apps Script の最小限のモック（このシステムで使う API だけ）
'use strict';
const crypto = require('crypto');

/** スプレッドシートが文字を勝手に変える例：「8/10」→日付、「2026-11-02」→日付、「=」「+」で始まる→数式 */
function autoConvert(v) {
  if (typeof v !== 'string') return v;
  let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(+m[1], m[2] - 1, +m[3]);
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})$/)) && +m[1] <= 12) return new Date(2026, m[1] - 1, +m[2]);
  if (/^[=+]/.test(v)) return '#ERROR!';
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function makeEnv() {
  const calls = { fetch: [], mail: [], triggers: [] };
  const fetchHandlers = [];
  const props = {};

  class Range {
    constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j));
        out.push(row);
      }
      return out;
    }
    getValue() { return this.sh._get(this.r, this.c); }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh._put(this.r + i, this.c + j, x))); return this; }
    setValue(v) { this.sh._put(this.r, this.c, v); return this; }
    setNumberFormat(f) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[(this.r + i) + ':' + (this.c + j)] = f;
      return this;
    }
    getRow() { return this.r; }
    getLastRow() { return this.r + this.nr - 1; }
    getColumn() { return this.c; }
    getSheet() { return this.sh; }
    insertCheckboxes() { for (let i = 0; i < this.nr; i++) this.sh._set(this.r + i, this.c, false); return this; }
    setFontWeight() { return this; } setBackground() { return this; } setNote() { return this; }
    setWrap() { return this; } setDataValidation() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.fmt = {}; }
    // 本物のスプレッドシートと同じく、書式が「書式なしテキスト（@）」でなければ文字を自動で変換する
    _put(r, c, v) { this._set(r, c, this.fmt[r + ':' + c] === '@' ? v : autoConvert(v)); }
    getName() { return this.name; }
    _get(r, c) { return (this.data[r - 1] || [])[c - 1] ?? ''; }
    _set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => r.length)); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
    appendRow(row) { const r = this.data.length + 1; row.forEach((x, j) => this._put(r, j + 1, x)); }
    setFrozenRows() {} setColumnWidth() {}
  }
  const sheets = [new Sheet('シート1')];
  const active = { sheet: null, row: 1 };
  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
    // メニューの「選択した行」を試すため：どのシートのどの行を選んでいるか
    setActiveSheetForTest: (sh, row) => { active.sheet = sh; active.row = row; },
    getId: () => 'SS_ID', getSpreadsheetTimeZone: () => 'Asia/Tokyo'
  };
  const builder = () => { const b = { requireValueInList: () => b, build: () => ({}) }; return b; };

  // FormApp：並んだ項目と分岐を記録するだけ
  const form = { items: [], props: {} };
  const mkItem = (kind) => {
    const it = { kind, title: '', choices: [], required: false };
    const api = {
      _it: it,
      setTitle(t) { it.title = t; return api; }, getTitle: () => it.title,
      setHelpText() { return api; }, setRequired(b) { it.required = b; return api; },
      setBounds() { return api; }, setLabels() { return api; },
      setChoiceValues(v) { it.choices = v.map(value => ({ value, go: null })); return api; },
      createChoice: (value, go) => ({ value, go: go ? go._it : null }),
      setChoices(c) { it.choices = c; return api; },
      asListItem: () => api
    };
    form.items.push(it);
    return api;
  };
  const formApi = {
    getId: () => 'FORM_ID', setDestination() {},
    getItems: (type) => form.items.filter(i => !type || i.kind === type).map(i => ({ getTitle: () => i.title, asListItem: () => ({ setChoiceValues: v => { i.choices = v.map(value => ({ value })); } }) })),
    deleteItem() {},
    setTitle() { return formApi; }, setDescription() { return formApi; }, setConfirmationMessage() { return formApi; },
    setShowLinkToRespondAgain() { return formApi; }, setAllowResponseEdits() { return formApi; }, setProgressBar() { return formApi; },
    addSectionHeaderItem: () => mkItem('header'), addPageBreakItem: () => mkItem('page'),
    addListItem: () => mkItem('LIST'), addDateItem: () => mkItem('date'), addTextItem: () => mkItem('text'),
    addParagraphTextItem: () => mkItem('paragraph'), addScaleItem: () => mkItem('scale'),
    addMultipleChoiceItem: () => mkItem('choice'), addCheckboxItem: () => mkItem('checkbox')
  };

  const g = {
    FormApp: { create: () => formApi, openById: () => formApi, DestinationType: { SPREADSHEET: 1 }, ItemType: { LIST: 'LIST' } },
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, newDataValidation: builder,
      getActiveSheet: () => Object.assign(Object.create(active.sheet), { getActiveRange: () => ({ getRow: () => active.row }) })
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo', getActiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
          .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
      },
      DigestAlgorithm: { MD5: 'md5' },
      computeDigest: (alg, s) => [...crypto.createHash(alg).update(s, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b))
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        calls.fetch.push({ url, opt, payload: opt.payload ? JSON.parse(opt.payload) : null });
        const h = fetchHandlers.find(h => h.test(url, opt)) || { code: 200, body: '{}' };
        return { getResponseCode: () => h.code, getContentText: () => h.body };
      }
    },
    MailApp: { sendEmail: o => { calls.mail.push(o); } },
    ContentService: { createTextOutput: t => ({ text: t }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({}) }
  };
  return { g, calls, fetchHandlers, props, ss, sheets, form };
}

module.exports = { makeEnv };
