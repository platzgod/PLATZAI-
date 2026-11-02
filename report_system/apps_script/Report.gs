/**
 * 学習報告書システム — 報告書の文面づくり（シートに触らない純粋な関数）
 */

var WEEKDAYS_ = ['日', '月', '火', '水', '木', '金', '土'];

/** '2026-11-02' や Date を「11月2日（月）」にする。 */
function formatDateJa_(value, withYear) {
  if (value === '' || value === null || value === undefined) return '';
  var y, m, d;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    y = value.getFullYear(); m = value.getMonth() + 1; d = value.getDate();
  } else {
    var s = String(value).trim();
    var hit = s.match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
    if (!hit) return s;
    y = +hit[1]; m = +hit[2]; d = +hit[3];
  }
  var w = WEEKDAYS_[new Date(y, m - 1, d).getDay()];
  return (withYear ? y + '年' : '') + m + '月' + d + '日（' + w + '）';
}

function stars_(n) {
  n = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n) + '（' + n + '/5）';
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.filter(function (x) { return String(x).trim() !== ''; }).join('、');
  return String(v).trim();
}

/** 「S001 山田 太郎」→ { id: 'S001', name: '山田 太郎' } */
function parseStudentChoice_(choice) {
  var s = clean_(choice);
  var hit = s.match(/^(\S+)\s+(.+)$/);
  return hit ? { id: hit[1], name: hit[2] } : { id: '', name: s };
}

function studentChoiceLabel_(student) {
  return student['生徒ID'] + ' ' + student['生徒名'];
}

/** 回答から科目ごとのまとまりを取り出す（1〜2科目）。 */
function subjectBlocks_(a) {
  var blocks = [{
    subject: clean_(a.subject1), content: a.content1, material: a.material1,
    understanding: a.understanding1, good: a.good1, issue: a.issue1
  }];
  if (hasSecond_(a)) {
    blocks.push({
      subject: clean_(a.subject2), content: a.content2, material: a.material2,
      understanding: a.understanding2, good: a.good2, issue: a.issue2
    });
  }
  return blocks;
}

function hasSecond_(a) {
  var s = clean_(a.subject2);
  return s !== '' && s !== NO_SECOND;
}

function subjectNames_(a) {
  return subjectBlocks_(a).map(function (b) { return b.subject; }).filter(String).join('・');
}

/**
 * 保護者に送る本文をつくる。
 * @param {Object} a 回答（QUESTIONS の key → 値）
 * @param {Object} student 生徒マスタの1行（列名 → 値）
 * @param {Object} settings 設定シート（項目 → 値）
 */
function buildReportText_(a, student, settings) {
  var L = [];
  var push = function (s) { L.push(s); };
  var name = clean_(student['生徒名']) || parseStudentChoice_(a.student).name;
  var grade = clean_(student['学年']);

  push('【学習報告書】' + [clean_(settings['塾名']), clean_(settings['教室名'])].filter(String).join(' '));
  push('━━━━━━━━━━━━');
  push(name + 'さん' + (grade ? '（' + grade + '）' : ''));
  push('授業日：' + formatDateJa_(a.date, true));
  push('科目：' + subjectNames_(a) + '　担当：' + clean_(a.teacher));
  push('');

  subjectBlocks_(a).forEach(function (b) {
    push('■ ' + b.subject + '　理解度 ' + stars_(b.understanding));
    push('【学習内容】' + clean_(b.content));
    if (clean_(b.material)) push('【教材】' + clean_(b.material));
    push('◎ できたこと');
    push(clean_(b.good));
    if (clean_(b.issue)) {
      push('△ これからの課題');
      push(clean_(b.issue));
    }
    push('');
  });

  push('■ 授業の様子');
  push('授業態度：' + clean_(a.attitude));
  var states = Array.isArray(a.state) ? a.state : clean_(a.state).split(/[、,]\s*/);
  states.filter(function (s) { return String(s).trim() !== ''; })
    .forEach(function (s) { push('・' + String(s).trim()); });
  if (clean_(a.test)) push('小テスト：' + formatScore_(a.test));
  push('');

  push('■ 宿題');
  push('前回の宿題：' + clean_(a.hwPrev));
  if (clean_(a.hwNext)) {
    push('次回までの宿題：');
    push(clean_(a.hwNext));
  }
  push('');

  push('■ 講師より');
  push(clean_(a.comment));

  if (clean_(a.nextDate)) {
    push('');
    push('■ 次回の授業　' + formatDateJa_(a.nextDate, false));
  }
  if (clean_(a.notice)) {
    push('');
    push('■ ご連絡');
    push(clean_(a.notice));
  }

  push('━━━━━━━━━━━━');
  var tel = clean_(settings['問い合わせ先']);
  push('ご不明な点は教室までお気軽にお問い合わせください。' + (tel ? '\n' + tel : ''));
  return L.join('\n');
}

/** 教室長に確認してほしい点（送信は止めない。報告書シートの「要確認」列に出す）。 */
function checkAnswers_(a, student) {
  var notes = [];
  if (!student || !clean_(student['生徒ID'])) notes.push('生徒マスタにいない生徒です');
  var grade = student ? clean_(student['学年']) : '';
  var level = clean_(a.level);
  if (grade && level) {
    var isJunior = /^中/.test(grade);
    var isSenior = /^高/.test(grade);
    if ((isJunior && level !== '中学生') || (isSenior && level !== '高校生'))
      notes.push('区分（' + level + '）と学年（' + grade + '）が合いません');
  }
  if (hasSecond_(a) && clean_(a.subject2) === clean_(a.subject1)) notes.push('1科目目と2科目目が同じ科目です');
  return notes.join('\n');
}

/** 「8/10」→「8／10点」。それ以外はそのまま。 */
function formatScore_(s) {
  var hit = clean_(s).match(/^(\d+(?:\.\d+)?)\s*[\/／]\s*(\d+(?:\.\d+)?)\s*点?$/);
  return hit ? hit[1] + '／' + hit[2] + '点' : clean_(s);
}

/** 件名のひな形 {生徒名} {授業日} {科目} を埋める。 */
function fillTemplate_(tpl, a, student) {
  return clean_(tpl)
    .replace(/\{生徒名\}/g, clean_(student['生徒名']) || parseStudentChoice_(a.student).name)
    .replace(/\{授業日\}/g, formatDateJa_(a.date, false))
    .replace(/\{科目\}/g, subjectNames_(a));
}

/** 全角英数を半角に、小文字を大文字に、空白を除く（連携コードの照合用）。 */
function normalizeCode_(s) {
  return String(s || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[\s　-]/g, '')
    .toUpperCase();
}

/** 読み間違えやすい文字（0/O, 1/I/L）を除いた6文字の連携コード。 */
function generateCode_(existing, rand) {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  rand = rand || Math.random;
  for (var tries = 0; tries < 1000; tries++) {
    var c = '';
    for (var i = 0; i < 6; i++) c += chars.charAt(Math.floor(rand() * chars.length));
    if (!existing || existing.indexOf(c) < 0) return c;
  }
  throw new Error('連携コードを作れませんでした');
}

/** 送信方法の列から { line: bool, mail: bool } */
function sendTargets_(method) {
  var m = clean_(method);
  if (m === '送らない' || m === '') return { line: false, mail: false };
  return { line: m.indexOf('LINE') >= 0, mail: m.indexOf('メール') >= 0 };
}

/** LINEユーザーIDの列（改行・カンマ区切りで複数可）を配列に。 */
function splitIds_(s) {
  return clean_(s).split(/[\s,、]+/).filter(function (x) { return /^U[0-9a-f]{32}$/.test(x); });
}
