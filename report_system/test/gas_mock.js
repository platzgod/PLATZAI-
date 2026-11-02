// Google Apps Script の最小限のモック（このシステムで使う API だけ）
'use strict';
const crypto = require('crypto');

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
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh._set(this.r + i, this.c + j, x))); return this; }
    setValue(v) { this.sh._set(this.r, this.c, v); return this; }
    getRow() { return this.r; }
    getLastRow() { return this.r + this.nr - 1; }
    getColumn() { return this.c; }
    getSheet() { return this.sh; }
    insertCheckboxes() { for (let i = 0; i < this.nr; i++) this.sh._set(this.r + i, this.c, false); return this; }
    setFontWeight() { return this; } setBackground() { return this; } setNote() { return this; }
    setWrap() { return this; } setDataValidation() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; }
    _get(r, c) { return (this.data[r - 1] || [])[c - 1] ?? ''; }
    _set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => r.length)); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
    appendRow(row) { this.data.push(row.slice()); }
    setFrozenRows() {} setColumnWidth() {}
  }
  const sheets = [new Sheet('シート1')];
  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
    getId: () => 'SS_ID'
  };
  const builder = () => { const b = { requireValueInList: () => b, build: () => ({}) }; return b; };

  const g = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: builder },
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
  return { g, calls, fetchHandlers, props, ss, sheets };
}

module.exports = { makeEnv };
