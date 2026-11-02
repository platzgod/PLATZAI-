/**
 * 個人指導塾PLATZ 学習報告書システム（貼り付け用・1ファイル版）
 *
 * このファイルの中身をすべてコピーし、Apps Script の「コード.gs」に貼り付けて保存してください。
 * 元のファイル：report_system/apps_script/ （直すときは元のファイルを直し、node report_system/build_bundle.js で作り直す）
 */
// ======================================================================
// Config.gs
// ======================================================================

/**
 * 学習報告書システム — 設定（質問・シートの列）
 *
 * 質問を増やす・減らす・言い回しを変えるときは PAGES / QUESTIONS を直し、
 * メニュー「学習報告書 → フォームを作り直す」を実行してください。
 */

var SHEET = {
  STUDENTS: '生徒マスタ',
  TEACHERS: '講師マスタ',
  REPORTS: '報告書',
  SETTINGS: '設定',
  LOG: '送信ログ'
};

/** 区分ごとの科目（フォームの「科目」のプルダウン）。 */
var SUBJECTS_BY_LEVEL = {
  '小学生': ['算数', '国語', '英語', '理科', '社会', '中学受験対策', 'その他'],
  '中学生': ['英語', '数学', '国語', '理科', '社会', '英検対策', 'その他'],
  '高校生': ['英語', '数学ⅠA', '数学ⅡB', '数学Ⅲ', '数学C', '現代文', '古文・漢文',
    '物理', '化学', '生物', '地学', '日本史', '世界史', '地理', '公共・倫理・政経',
    '情報', '小論文', '英検対策', 'その他']
};
var LEVELS = ['小学生', '中学生', '高校生'];
var NO_SECOND = 'なし（1科目だけ）';

var ATTITUDES = ['とても良い', '良い', 'ふつう', 'もう少し'];
var STATE_OPTIONS = [
  '集中して取り組んでいた',
  '積極的に質問していた',
  '前回より理解が深まっていた',
  'ていねいに解いていた',
  '粘り強く考えていた',
  '少し疲れている様子だった',
  '集中が途切れることがあった'
];
var HOMEWORK_OPTIONS = ['全部できていた', '一部できていた', 'できていなかった', '前回は宿題なし'];

/**
 * フォームのページ（この順で並ぶ）。
 *   perLevel … 小学生用・中学生用・高校生用の3ページに分けて作る（科目の選択肢だけが違う）
 *
 * ページの進み方：
 *   ① 基本情報 ─ 区分＝小学生 → ② 1科目目（小学生）┐
 *              ├ 区分＝中学生 → ② 1科目目（中学生）┤
 *              └ 区分＝高校生 → ② 1科目目（高校生）┤
 *     「2科目目」＝なし → ③ へ  ／  科目を選ぶ → ②-2 2科目目 → ③ ┘
 *   ③ 授業の様子 → ④ 宿題 → ⑤ 講師コメント・連絡
 */
var PAGES = [
  { id: 'basic', title: '① 授業の基本情報' },
  { id: 'first', title: '② 1科目目', perLevel: true },
  { id: 'second', title: '②-2 2科目目', help: '2科目目の内容を書いてください。' },
  { id: 'state', title: '③ 授業の様子・小テスト' },
  { id: 'homework', title: '④ 宿題' },
  { id: 'comment', title: '⑤ 講師コメント・連絡' }
];

/**
 * 講師が授業後に答える質問。
 *   key      … プログラム内の名前（変えない）
 *   title    … フォームに表示する質問文（報告書シートの列名にもなる。重複させない）
 *   type     … list / date / text / paragraph / scale / choice / checkbox
 *   options  … 'levels'（小学生/中学生/高校生）, 'subjects'（区分に合わせた科目）, 配列
 *   branch   … 'level'：区分でページを分ける ／ 'second'：2科目目の有無でページを分ける
 *   internal … true なら保護者には送らない（教室長だけが見る）
 */
var QUESTIONS = [
  { page: 'basic', key: 'teacher', title: '講師名', type: 'list', source: 'teachers', required: true },
  { page: 'basic', key: 'student', title: '生徒名', type: 'list', source: 'students', required: true },
  { page: 'basic', key: 'date', title: '授業日', type: 'date', required: true },
  { page: 'basic', key: 'level', title: '区分', type: 'choice', options: 'levels', branch: 'level', required: true },

  { page: 'first', key: 'subject1', title: '科目（1科目目）', type: 'list', options: 'subjects', required: true },
  { page: 'first', key: 'content1', title: '今日の学習内容（単元・テーマ）', type: 'paragraph', required: true,
    help: '例：二次関数の最大・最小（場合分け）' },
  { page: 'first', key: 'material1', title: '使った教材・ページ', type: 'text',
    help: '例：青チャート数I p.112〜118' },
  { page: 'first', key: 'understanding1', title: '理解度', type: 'scale', min: 1, max: 5,
    minLabel: 'まだ難しい', maxLabel: 'よく理解できた', required: true },
  { page: 'first', key: 'good1', title: 'できたこと・よかったこと', type: 'paragraph', required: true,
    help: '具体的に1〜2点（保護者が読んで様子が浮かぶように）' },
  { page: 'first', key: 'issue1', title: 'これからの課題・つまずいたところ', type: 'paragraph',
    help: '次回どう手当てするかも書くと伝わりやすいです' },
  { page: 'first', key: 'subject2', title: '2科目目', type: 'list', options: 'subjects', branch: 'second',
    required: true, help: '1つの授業で2科目教えたときだけ選んでください' },

  { page: 'second', key: 'content2', title: '2科目目：今日の学習内容', type: 'paragraph', required: true },
  { page: 'second', key: 'material2', title: '2科目目：使った教材・ページ', type: 'text' },
  { page: 'second', key: 'understanding2', title: '2科目目：理解度', type: 'scale', min: 1, max: 5,
    minLabel: 'まだ難しい', maxLabel: 'よく理解できた', required: true },
  { page: 'second', key: 'good2', title: '2科目目：できたこと・よかったこと', type: 'paragraph', required: true },
  { page: 'second', key: 'issue2', title: '2科目目：これからの課題', type: 'paragraph' },

  { page: 'state', key: 'attitude', title: '授業態度', type: 'choice', options: ATTITUDES, required: true },
  { page: 'state', key: 'state', title: '授業中の様子（当てはまるものすべて）', type: 'checkbox', options: STATE_OPTIONS },
  { page: 'state', key: 'test', title: '小テストの結果', type: 'text',
    help: '例：8/10　（実施しなかったときは空欄）' },

  { page: 'homework', key: 'hwPrev', title: '前回の宿題', type: 'choice', options: HOMEWORK_OPTIONS, required: true },
  { page: 'homework', key: 'hwNext', title: '次回までの宿題', type: 'paragraph',
    help: '例：青チャート p.119〜121 の例題をノートに解く' },

  { page: 'comment', key: 'comment', title: '保護者へのひとこと', type: 'paragraph', required: true },
  { page: 'comment', key: 'nextDate', title: '次回の授業日', type: 'date' },
  { page: 'comment', key: 'notice', title: '保護者への連絡事項', type: 'paragraph',
    help: '振替・面談・持ち物など（なければ空欄）' },
  { page: 'comment', key: 'memo', title: '教室長への申し送り（保護者には送りません）', type: 'paragraph', internal: true }
];

/** 報告書シートの列（左から）。質問の列は QUESTIONS から自動で並ぶ。 */
var REPORT_HEAD = ['受付日時', '報告ID', 'ステータス', '承認', '要確認', '生徒ID'];
var REPORT_TAIL = ['送信本文（直してから承認できます）', '送信先', '送信日時', 'エラー'];

function reportHeaders_() {
  return REPORT_HEAD.concat(QUESTIONS.map(function (q) { return q.title; }), REPORT_TAIL);
}

var STATUS = {
  WAITING: '確認待ち',
  SENT: '送信済み',
  ERROR: '送信エラー',
  NO_DEST: '送信先なし'
};

var STUDENT_HEADERS = ['生徒ID', '生徒名', '学年', '保護者名', '送信方法', 'メールアドレス',
  'LINEユーザーID', '連携コード', 'LINE連携日時', '在籍'];
var SEND_METHODS = ['LINE', 'LINE＋メール', 'メール', '送らない'];

var TEACHER_HEADERS = ['講師名', '在籍'];

var SETTING_ROWS = [
  ['塾名', '個人指導塾PLATZ', '報告書の差出人として表示'],
  ['教室名', '', '教室が複数になったら入れる（空欄なら表示しない）'],
  ['問い合わせ先', '', '報告書の末尾に表示（空欄なら表示しない）'],
  ['メールの件名', '【学習報告書】{生徒名}さん {授業日}', '{生徒名} {授業日} {科目} が使えます'],
  ['友だち追加のときに連携の案内を送る', 'はい', '公式アカウントの「あいさつメッセージ」を使うときは「いいえ」にする（二重に届くため）'],
  ['LINE連携の案内文', 'お手元の「連携コード」（6文字）をこのトークに送ってください。お子さまの学習報告書が届くようになります。', ''],
  ['承認したらすぐ送る', 'はい', '「いいえ」にすると、メニューの「承認済みをまとめて送る」で送る']
];

// ======================================================================
// Report.gs
// ======================================================================

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
    var expected = /^小/.test(grade) ? '小学生' : /^中/.test(grade) ? '中学生' : /^高/.test(grade) ? '高校生' : '';
    if (expected && level !== expected)
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

// ======================================================================
// Sheets.gs
// ======================================================================

/**
 * 学習報告書システム — シートの読み書き・初期設定・フォーム作成
 */

function ss_() {
  // ふつうは getActiveSpreadsheet() で取れる。取れない呼ばれ方（Webhook など）に備えて、
  // 初期設定のときに覚えた ID でも開けるようにしておく。
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('スプレッドシートが見つかりません。スプレッドシートからメニューの「初期設定」を実行してください。');
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」がありません。メニューの「初期設定」を実行してください。');
  return sh;
}

/** 1行目を見出しとして読み、{ headers, rows: [{ _row: 行番号, 見出し: 値 }] } を返す。 */
function readTable_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    headers.forEach(function (h, j) { o[h] = values[i][j]; });
    rows.push(o);
  }
  return { headers: headers, rows: rows };
}

function colOf_(sh, header) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var c = headers.indexOf(header);
  if (c < 0) throw new Error('シート「' + sh.getName() + '」に列「' + header + '」がありません');
  return c + 1;
}

function setCell_(sh, row, header, value) {
  sh.getRange(row, colOf_(sh, header)).setValue(value);
}

function settings_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET.SETTINGS);
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (String(r[0]).trim()) out[String(r[0]).trim()] = r[1];
  });
  return out;
}

function students_() {
  return readTable_(sheet_(SHEET.STUDENTS)).rows.filter(function (s) { return String(s['生徒ID']).trim(); });
}

function activeStudents_() {
  return students_().filter(function (s) { return String(s['在籍']).trim() !== '退塾'; });
}

function findStudent_(id) {
  id = String(id).trim();
  var hit = students_().filter(function (s) { return String(s['生徒ID']).trim() === id; });
  return hit[0] || null;
}

function activeTeachers_() {
  return readTable_(sheet_(SHEET.TEACHERS)).rows.filter(function (t) {
    return String(t['講師名']).trim() && String(t['在籍']).trim() !== '退職';
  });
}

function log_(reportId, studentName, channel, dest, result, detail) {
  var sh = ss_().getSheetByName(SHEET.LOG);
  if (!sh) return;
  sh.appendRow([new Date(), reportId, studentName, channel, dest, result, detail || '']);
}

// ---------------------------------------------------------------- 初期設定

function ensureSheet_(name, headers, rows) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  var created = false;
  if (!sh) {
    sh = ss.insertSheet(name);
    created = true;
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
    if (rows && rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { sheet: sh, created: created };
}

function setupSheets_() {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss_().getId());
  var st = ensureSheet_(SHEET.STUDENTS, STUDENT_HEADERS, [
    ['S001', '山田 太郎', '高2', '山田 花子', 'LINE＋メール', 'parent@example.com', '', '', '', '在籍'],
    ['S002', '佐藤 花', '中3', '佐藤 一郎', 'LINE', '', '', '', '', '在籍'],
    ['S003', '鈴木 健', '小5', '鈴木 美香', 'LINE', '', '', '', '', '在籍']
  ]).sheet;
  var methodCol = colOf_(st, '送信方法');
  st.getRange(2, methodCol, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(SEND_METHODS, true).build());
  st.getRange(2, colOf_(st, '在籍'), 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['在籍', '休塾', '退塾'], true).build());

  ensureSheet_(SHEET.TEACHERS, TEACHER_HEADERS, [['佐藤 先生', '在籍'], ['鈴木 先生', '在籍']]);

  var rep = ensureSheet_(SHEET.REPORTS, reportHeaders_(), null).sheet;
  rep.setColumnWidth(colOf_(rep, REPORT_TAIL[0]), 420);
  rep.getRange(1, colOf_(rep, '承認')).setBackground('#fde293')
    .setNote('内容を確認したら✓を付けてください。保護者に送られます。');
  rep.getRange(1, colOf_(rep, '要確認')).setNote('区分と学年が合わないなど、確認してほしい点が出ます（送信は止めません）。');
  rep.getRange(1, colOf_(rep, REPORT_TAIL[0])).setBackground('#fde293')
    .setNote('ここを直すと、直した文面がそのまま送られます。');

  var set = ensureSheet_(SHEET.SETTINGS, ['項目', '値', 'メモ'], SETTING_ROWS).sheet;
  set.setColumnWidth(2, 360);
  set.setColumnWidth(3, 360);

  ensureSheet_(SHEET.LOG, ['日時', '報告ID', '生徒名', '送信方法', '宛先', '結果', '詳細'], null);

  var first = ss_().getSheetByName('シート1') || ss_().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss_().getSheets().length > 1) ss_().deleteSheet(first);
}

// ---------------------------------------------------------------- フォーム

function form_() {
  var id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) return null;
  try { return FormApp.openById(id); } catch (e) { return null; }
}

function buildForm_() {
  var props = PropertiesService.getScriptProperties();
  var s = settings_();
  var form = form_();
  if (!form) {
    form = FormApp.create((s['塾名'] || '') + ' 学習報告書（講師用）');
    props.setProperty('FORM_ID', form.getId());
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss_().getId());
  }
  form.getItems().forEach(function (it) { form.deleteItem(it); });

  form.setTitle((s['塾名'] || '') + ' 学習報告書（講師用）')
    .setDescription('授業が終わったら答えてください（3分ほど）。教室長が確認してから保護者に届きます。')
    .setConfirmationMessage('送信しました。教室長の確認後に保護者へ届きます。')
    .setShowLinkToRespondAgain(true)
    .setAllowResponseEdits(false)
    .setProgressBar(true);

  // 1) ページと質問を並べる。分岐する質問は、行き先のページができてから選択肢を入れる。
  var pageBreak = {};   // 'first:中学生' / 'second' / 'state' … → PageBreakItem
  var branchItems = []; // { q, item, level }
  PAGES.forEach(function (page, i) {
    var variants = page.perLevel ? LEVELS : [null];
    variants.forEach(function (level) {
      var title = page.title + (level ? '（' + level + '）' : '');
      if (i === 0) {
        form.addSectionHeaderItem().setTitle(title);
      } else {
        var pb = form.addPageBreakItem().setTitle(title);
        if (page.help) pb.setHelpText(page.help);
        pageBreak[page.id + (level ? ':' + level : '')] = pb;
      }
      QUESTIONS.filter(function (q) { return q.page === page.id; }).forEach(function (q) {
        var item = addQuestion_(form, q, level);
        if (q.branch) branchItems.push({ q: q, item: item, level: level });
      });
    });
  });

  // 2) 分岐の行き先を入れる
  branchItems.forEach(function (b) {
    var choices;
    if (b.q.branch === 'level') {
      choices = LEVELS.map(function (lv) { return b.item.createChoice(lv, pageBreak['first:' + lv]); });
    } else if (b.q.branch === 'second') {
      choices = [b.item.createChoice(NO_SECOND, pageBreak.state)].concat(
        SUBJECTS_BY_LEVEL[b.level].map(function (sub) { return b.item.createChoice(sub, pageBreak.second); }));
    }
    b.item.setChoices(choices);
  });

  refreshChoices_(form);
  return form;
}

function optionsFor_(q, level) {
  if (q.options === 'levels') return LEVELS;
  if (q.options === 'subjects') return SUBJECTS_BY_LEVEL[level] || [];
  return q.options;
}

function addQuestion_(form, q, level) {
  var item;
  switch (q.type) {
    case 'list': item = form.addListItem(); break;
    case 'date': item = form.addDateItem(); break;
    case 'text': item = form.addTextItem(); break;
    case 'paragraph': item = form.addParagraphTextItem(); break;
    case 'scale': item = form.addScaleItem().setBounds(q.min, q.max).setLabels(q.minLabel, q.maxLabel); break;
    case 'choice': item = form.addMultipleChoiceItem(); break;
    case 'checkbox': item = form.addCheckboxItem(); break;
    default: throw new Error('未知の質問タイプ: ' + q.type);
  }
  if (q.options && !q.branch && (q.type === 'list' || q.type === 'choice' || q.type === 'checkbox')) {
    item.setChoiceValues(optionsFor_(q, level));
  }
  item.setTitle(q.title);
  if (q.help) item.setHelpText(q.help);
  if (q.required) item.setRequired(true);
  return item;
}

/** 講師名・生徒名のプルダウンを、講師マスタ・生徒マスタの在籍者で更新する。 */
function refreshChoices_(form) {
  form = form || form_();
  if (!form) return;
  var lists = {
    teachers: activeTeachers_().map(function (t) { return String(t['講師名']).trim(); }),
    students: activeStudents_().map(studentChoiceLabel_)
  };
  QUESTIONS.filter(function (q) { return q.source; }).forEach(function (q) {
    var item = form.getItems(FormApp.ItemType.LIST).filter(function (it) { return it.getTitle() === q.title; })[0];
    if (!item) return;
    var values = lists[q.source];
    item.asListItem().setChoiceValues(values.length ? values : ['（マスタに登録してください）']);
  });
}

function installTriggers_(form) {
  var handlers = ['onFormSubmitHandler', 'onSheetEditHandler'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitHandler').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('onSheetEditHandler').forSpreadsheet(ss_()).onEdit().create();
}

// ---------------------------------------------------------------- 回答の受け取り

/** フォームの回答 → QUESTIONS の key ごとの値 */
function answersFromResponse_(response) {
  var byTitle = {};
  response.getItemResponses().forEach(function (ir) {
    byTitle[ir.getItem().getTitle()] = ir.getResponse();
  });
  var a = {};
  QUESTIONS.forEach(function (q) { a[q.key] = byTitle[q.title] === undefined ? '' : byTitle[q.title]; });
  return a;
}

/** 回答を報告書シートに1行追加する（ここではまだ送らない）。 */
function addReport_(a, submittedAt) {
  var sh = sheet_(SHEET.REPORTS);
  var st = parseStudentChoice_(a.student);
  var student = findStudent_(st.id) || { '生徒ID': st.id, '生徒名': st.name };
  var text = buildReportText_(a, student, settings_());
  var id = 'R' + Utilities.formatDate(submittedAt, ss_().getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' + Math.floor(Math.random() * 900 + 100);

  var values = {};
  values['受付日時'] = submittedAt;
  values['報告ID'] = id;
  values['ステータス'] = STATUS.WAITING;
  values['承認'] = false;
  values['要確認'] = checkAnswers_(a, findStudent_(st.id));
  values['生徒ID'] = st.id;
  QUESTIONS.forEach(function (q) { values[q.title] = clean_(a[q.key]); });
  values[REPORT_TAIL[0]] = text;
  values['送信先'] = describeDestination_(student);

  // 同時に2件届いても同じ行に書かないよう、行を決めて書き終えるまでロックする
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var headers = ensureReportHeaders_(sh);
    var r = sh.getLastRow() + 1;
    var range = sh.getRange(r, 1, 1, headers.length);
    // 回答は文字のまま入れる（「8/10」が日付に、「=」「+」で始まる文が数式に化けないように）
    range.setNumberFormat('@');
    sh.getRange(r, headers.indexOf('受付日時') + 1).setNumberFormat('yyyy/MM/dd HH:mm');
    range.setValues([headers.map(function (h) { return values[h] === undefined ? '' : values[h]; })]);
    sh.getRange(r, headers.indexOf('承認') + 1).insertCheckboxes();
    sh.getRange(r, headers.indexOf(REPORT_TAIL[0]) + 1).setWrap(true);
    return r;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 報告書シートの見出しを確かめ、足りない列（質問を増やしたとき）は右端に足す。
 * 列は見出しの名前で探すので、列の順番が変わっても正しい列に書き込まれる。
 */
function ensureReportHeaders_(sh) {
  var last = sh.getLastColumn();
  var headers = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];
  reportHeaders_().forEach(function (h) {
    if (headers.indexOf(h) >= 0) return;
    headers.push(h);
    sh.getRange(1, headers.length).setValue(h).setFontWeight('bold').setBackground('#e8f0fe');
  });
  return headers;
}

/** 報告書シートの1行から回答を読み戻す（本文の作り直し用）。 */
function answersFromRow_(rowObj) {
  var a = {};
  QUESTIONS.forEach(function (q) {
    var v = rowObj[q.title];
    a[q.key] = (q.type === 'checkbox') ? clean_(v).split(/、/) : v;
  });
  return a;
}

function describeDestination_(student) {
  var t = sendTargets_(student['送信方法']);
  var parts = [];
  if (t.line) parts.push(splitIds_(student['LINEユーザーID']).length ? 'LINE' : 'LINE（未連携）');
  if (t.mail) parts.push(clean_(student['メールアドレス']) ? 'メール' : 'メール（アドレスなし）');
  return parts.join(' / ') || '送らない';
}

// ======================================================================
// Send.gs
// ======================================================================

/**
 * 学習報告書システム — 送信（LINE公式アカウント / メール）
 *
 * LINE は Messaging API の push メッセージで送る。
 * チャネルアクセストークンはシートではなくスクリプトプロパティ LINE_TOKEN に保存する
 * （メニュー「LINEの設定」から入力）。
 */

var LINE_API_ = 'https://api.line.me/v2/bot';

function lineToken_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '';
}

function lineFetch_(method, path, payload, retryKey) {
  var token = lineToken_();
  if (!token) throw new Error('LINEのチャネルアクセストークンが未設定です（メニュー「LINEの設定」）');
  var opt = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  };
  if (retryKey) opt.headers['X-Line-Retry-Key'] = retryKey;
  if (payload) {
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(LINE_API_ + path, opt);
  var code = res.getResponseCode();
  // 409 = 同じ Retry-Key で送信済み（＝前回届いている）
  if (code >= 200 && code < 300 || (retryKey && code === 409)) {
    var body = res.getContentText();
    return body ? JSON.parse(body) : {};
  }
  throw new Error('LINE API ' + code + ': ' + res.getContentText());
}

/** LINE のテキストは1通5000文字まで。長いときは段落の切れ目で分ける（1回の送信で5通まで）。 */
function splitForLine_(text) {
  var LIMIT = 4900;
  var out = [];
  var rest = text;
  while (rest.length > LIMIT) {
    var cut = rest.lastIndexOf('\n\n', LIMIT);
    if (cut < 1000) cut = LIMIT;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  out.push(rest);
  return out.slice(0, 5).map(function (t) { return { type: 'text', text: t }; });
}

function sendLine_(userId, text, retryKey) {
  lineFetch_('post', '/message/push', { to: userId, messages: splitForLine_(text) }, retryKey);
}

function sendMail_(to, subject, text, settings) {
  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: text,
    name: [clean_(settings['塾名']), clean_(settings['教室名'])].filter(String).join(' ') || '学習報告書'
  });
}

/**
 * 報告書シートの1行を送る。送れた宛先は「送信先」列に「済」と記録し、
 * 再送するときは「済」の宛先を飛ばす（二重に届かないように）。
 * @return {string} 新しいステータス
 */
function sendReportRow_(rowNum) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(SHEET.REPORTS);
    var t = readTable_(sh);
    var r = t.rows[rowNum - 2];
    if (!r) throw new Error(rowNum + '行目に報告書がありません');
    if (r['ステータス'] === STATUS.SENT) return STATUS.SENT;
    if (r['承認'] !== true) return r['ステータス'];

    var settings = settings_();
    var student = findStudent_(r['生徒ID']);
    var reportId = r['報告ID'];
    var text = clean_(r[REPORT_TAIL[0]]);
    var name = student ? clean_(student['生徒名']) : clean_(r['生徒名']);
    var done = clean_(r['送信先']);
    var results = [];
    var errors = [];

    if (!student) {
      errors.push('生徒マスタに生徒ID「' + r['生徒ID'] + '」がありません');
    } else {
      var targets = sendTargets_(student['送信方法']);
      if (targets.line) {
        var ids = splitIds_(student['LINEユーザーID']);
        if (!ids.length) errors.push('LINE未連携（連携コードを保護者に送ってもらってください）');
        ids.forEach(function (uid, i) {
          var label = 'LINE' + (ids.length > 1 ? (i + 1) : '');
          if (done.indexOf(label + ':済') >= 0) { results.push(label + ':済'); return; }
          try {
            sendLine_(uid, text, retryKey_(reportId, uid));
            results.push(label + ':済');
            log_(reportId, name, 'LINE', uid, '送信済み');
          } catch (e) {
            results.push(label + ':失敗');
            errors.push(label + '：' + e.message);
            log_(reportId, name, 'LINE', uid, '失敗', e.message);
          }
        });
      }
      if (targets.mail) {
        var to = clean_(student['メールアドレス']);
        if (!to) errors.push('メールアドレスが空です');
        else if (done.indexOf('メール:済') >= 0) results.push('メール:済');
        else {
          try {
            var a = answersFromRow_(r);
            sendMail_(to, fillTemplate_(settings['メールの件名'] || '【学習報告書】{生徒名}さん {授業日}', a, student), text, settings);
            results.push('メール:済');
            log_(reportId, name, 'メール', to, '送信済み');
          } catch (e2) {
            results.push('メール:失敗');
            errors.push('メール：' + e2.message);
            log_(reportId, name, 'メール', to, '失敗', e2.message);
          }
        }
      }
      if (!targets.line && !targets.mail) errors.push('送信方法が「送らない」か空です');
    }

    var noTarget = student && !sendTargets_(student['送信方法']).line && !sendTargets_(student['送信方法']).mail;
    var status = !errors.length ? STATUS.SENT : (noTarget ? STATUS.NO_DEST : STATUS.ERROR);
    setCell_(sh, rowNum, 'ステータス', status);
    setCell_(sh, rowNum, '送信先', results.join(' / ') || done);
    setCell_(sh, rowNum, 'エラー', errors.join('\n'));
    if (status === STATUS.SENT) setCell_(sh, rowNum, '送信日時', new Date());
    paintStatus_(sh, rowNum, status);
    return status;
  } finally {
    lock.releaseLock();
  }
}

/** 同じ報告書・同じ宛先なら同じキー → LINE側で二重送信を防ぐ（UUID形式が必要）。 */
function retryKey_(reportId, userId) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, reportId + '|' + userId);
  var hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16),
    ((parseInt(hex.charAt(16), 16) & 3) | 8).toString(16) + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

function paintStatus_(sh, rowNum, status) {
  var color = { '送信済み': '#e6f4ea', '送信エラー': '#fce8e6', '送信先なし': '#f1f3f4', '確認待ち': null }[status];
  sh.getRange(rowNum, colOf_(sh, 'ステータス')).setBackground(color || null);
}

/** 承認済みで、まだ送れていない報告書をまとめて送る。 */
function sendApprovedReports() {
  var sh = sheet_(SHEET.REPORTS);
  var rows = readTable_(sh).rows.filter(function (r) {
    return r['承認'] === true && r['ステータス'] !== STATUS.SENT;
  });
  var count = { sent: 0, failed: 0 };
  rows.forEach(function (r) {
    var s = sendReportRow_(r._row);
    if (s === STATUS.SENT) count.sent++; else count.failed++;
  });
  return count;
}

// ======================================================================
// LineLink.gs
// ======================================================================

/**
 * 学習報告書システム — 保護者のLINEと生徒をつなぐ（Webhook）
 *
 * 流れ：
 *   1. 教室長が生徒マスタで生徒を選び、メニュー「連携コードを発行」→ 6文字のコードができる
 *   2. 保護者に「公式アカウントを友だち追加して、このコードを送ってください」と伝える
 *   3. 保護者がコードを送る → この doPost が受け取り、LINEユーザーIDを生徒マスタに書き込む
 *
 * このスクリプトを「ウェブアプリ」としてデプロイし、その URL を
 * LINE Developers の Webhook URL に設定する（README 参照）。
 *
 * Apps Script では受信リクエストのヘッダー（X-Line-Signature）を読めないため署名を検証できない。
 * 代わりに、(a) コードを知っている人しか連携できない、(b) コードは1回使うと消える、
 * (c) 連携前にプロフィールAPIで「本当にこの公式アカウントの友だちか」を確かめる、の3つで守る。
 */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    (body.events || []).forEach(function (ev) {
      try { handleLineEvent_(ev); } catch (err) { log_('', '', 'LINE受信', '', 'エラー', err.message); }
    });
  } catch (err) {
    log_('', '', 'LINE受信', '', 'エラー', String(err));
  }
  return ContentService.createTextOutput('OK');
}

function doGet() {
  return ContentService.createTextOutput('学習報告書システム：LINE Webhook は動いています');
}

function handleLineEvent_(ev) {
  if (!ev || !ev.source || ev.source.type !== 'user') return;
  var userId = ev.source.userId;
  var s = settings_();

  if (ev.type === 'follow') {
    // 公式アカウントの「あいさつメッセージ」と二重にならないよう、設定で「はい」のときだけ送る
    if (String(s['友だち追加のときに連携の案内を送る']).trim() !== 'はい') return;
    reply_(ev.replyToken, (s['塾名'] ? s['塾名'] + 'です。友だち追加ありがとうございます。\n' : '') +
      (s['LINE連携の案内文'] || '連携コードをこのトークに送ってください。'));
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;

  var code = normalizeCode_(ev.message.text);
  if (!/^[A-Z0-9]{6}$/.test(code)) return; // ふつうのメッセージには反応しない（チャットで返信できる）

  var result = linkByCode_(code, userId);
  reply_(ev.replyToken, result.message);
}

/** コードに合う生徒を探して LINEユーザーID を登録する。 */
function linkByCode_(code, userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(SHEET.STUDENTS);
    var hit = readTable_(sh).rows.filter(function (r) { return normalizeCode_(r['連携コード']) === code; })[0];
    if (!hit) {
      log_('', '', 'LINE連携', userId, '失敗', 'コード不一致：' + code);
      return { ok: false, message: '連携コードが見つかりませんでした。コードをもう一度ご確認いただくか、教室までお問い合わせください。' };
    }
    if (!isFriend_(userId)) {
      return { ok: false, message: '連携できませんでした。公式アカウントを友だち追加してから、もう一度コードを送ってください。' };
    }
    var ids = splitIds_(hit['LINEユーザーID']);
    if (ids.indexOf(userId) < 0) ids.push(userId);
    setCell_(sh, hit._row, 'LINEユーザーID', ids.join('\n'));
    setCell_(sh, hit._row, '連携コード', '');
    setCell_(sh, hit._row, 'LINE連携日時', new Date());
    var method = clean_(hit['送信方法']);
    if (method === '' || method === '送らない') setCell_(sh, hit._row, '送信方法', 'LINE');
    else if (method === 'メール') setCell_(sh, hit._row, '送信方法', 'LINE＋メール');
    log_('', hit['生徒名'], 'LINE連携', userId, '連携済み');
    return { ok: true, message: hit['生徒名'] + 'さんの学習報告書が、このLINEに届くようになりました。' };
  } finally {
    lock.releaseLock();
  }
}

function isFriend_(userId) {
  try {
    lineFetch_('get', '/profile/' + encodeURIComponent(userId));
    return true;
  } catch (e) {
    return false;
  }
}

function reply_(replyToken, text) {
  if (!replyToken) return;
  try {
    lineFetch_('post', '/message/reply', { replyToken: replyToken, messages: [{ type: 'text', text: text }] });
  } catch (e) {
    log_('', '', 'LINE返信', '', '失敗', e.message);
  }
}

// ======================================================================
// Menu.gs
// ======================================================================

/**
 * 学習報告書システム — メニューとトリガー
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('学習報告書')
    .addItem('① 初期設定（シート・フォームを作る）', 'setup')
    .addItem('フォームのURLを表示', 'showFormUrl')
    .addItem('フォームの選択肢（講師・生徒）を更新', 'menuRefreshChoices')
    .addSeparator()
    .addItem('承認済みをまとめて送る', 'menuSendApproved')
    .addItem('選択した行の本文を作り直す', 'menuRebuildText')
    .addItem('選択した行を自分にテスト送信（メール）', 'menuTestSend')
    .addSeparator()
    .addItem('選択した生徒の連携コードを発行', 'menuIssueCode')
    .addItem('LINEの設定（チャネルアクセストークン）', 'menuSetLineToken')
    .addItem('フォームを作り直す（質問を変えたとき）', 'menuRebuildForm')
    .addToUi();
}

function setup() {
  setupSheets_();
  var form = buildForm_();
  installTriggers_(form);
  SpreadsheetApp.getUi().alert('初期設定が終わりました。\n\n講師用フォーム：\n' + form.getPublishedUrl() +
    '\n\n次に「生徒マスタ」「講師マスタ」「設定」を入力し、「フォームの選択肢を更新」を実行してください。');
}

function showFormUrl() {
  var form = form_();
  if (!form) return SpreadsheetApp.getUi().alert('先に「初期設定」を実行してください。');
  SpreadsheetApp.getUi().alert('講師用フォーム（スマホのホーム画面に追加しておくと便利です）：\n' +
    form.getPublishedUrl());
}

function menuRefreshChoices() {
  refreshChoices_();
  SpreadsheetApp.getUi().alert('フォームの講師名・生徒名を更新しました。');
}

function menuRebuildForm() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('フォームの質問を Config.gs の内容で作り直します。よろしいですか？\n（これまでの回答は消えません）',
    ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var form = buildForm_();
  installTriggers_(form);
  ui.alert('作り直しました。');
}

function menuSendApproved() {
  var c = sendApprovedReports();
  SpreadsheetApp.getUi().alert('送信しました：' + c.sent + '件' + (c.failed ? '\n送れなかったもの：' + c.failed + '件（エラー列を見てください）' : ''));
}

function selectedRow_(sheetName) {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== sheetName) throw new Error('「' + sheetName + '」シートで行を選んでから実行してください。');
  var r = sh.getActiveRange().getRow();
  if (r < 2) throw new Error('見出しではなく、データの行を選んでください。');
  return r;
}

function menuRebuildText() {
  var r = selectedRow_(SHEET.REPORTS);
  var sh = sheet_(SHEET.REPORTS);
  var row = readTable_(sh).rows[r - 2];
  if (row['ステータス'] === STATUS.SENT) throw new Error('送信済みの報告書は作り直せません。');
  var student = findStudent_(row['生徒ID']) || {};
  setCell_(sh, r, REPORT_TAIL[0], buildReportText_(answersFromRow_(row), student, settings_()));
  setCell_(sh, r, '送信先', describeDestination_(student));
}

function menuTestSend() {
  var r = selectedRow_(SHEET.REPORTS);
  var row = readTable_(sheet_(SHEET.REPORTS)).rows[r - 2];
  var me = Session.getActiveUser().getEmail();
  var student = findStudent_(row['生徒ID']) || {};
  sendMail_(me, '【テスト】' + fillTemplate_(settings_()['メールの件名'] || '【学習報告書】{生徒名}さん {授業日}', answersFromRow_(row), student),
    clean_(row[REPORT_TAIL[0]]), settings_());
  SpreadsheetApp.getUi().alert(me + ' に送りました（保護者には送っていません）。');
}

function menuIssueCode() {
  var r = selectedRow_(SHEET.STUDENTS);
  var sh = sheet_(SHEET.STUDENTS);
  var rows = readTable_(sh).rows;
  var existing = rows.map(function (x) { return normalizeCode_(x['連携コード']); });
  var code = generateCode_(existing);
  setCell_(sh, r, '連携コード', code);
  var st = rows[r - 2];
  SpreadsheetApp.getUi().alert(st['生徒名'] + 'さんの連携コード：' + code +
    '\n\n保護者への案内例：\n「公式アカウントを友だち追加し、トークに ' + code + ' と送ってください。」\n' +
    '（コードは1回使うと消えます。2人目の保護者には、もう一度発行してください）');
}

function menuSetLineToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('LINEの設定',
    'LINE Developers の「Messaging API設定」にある「チャネルアクセストークン（長期）」を貼り付けてください。\n' +
    '（シートには保存されません。空欄でOKを押すと削除します）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = res.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (!token) { props.deleteProperty('LINE_TOKEN'); return ui.alert('削除しました。'); }
  props.setProperty('LINE_TOKEN', token);
  try {
    var info = lineFetch_('get', '/info');
    ui.alert('接続できました：' + (info.displayName || '') + '\n\n残りの手順：README の「LINEの準備」⑤〜⑦（Webhook URL の設定）');
  } catch (e) {
    ui.alert('トークンを保存しましたが、接続を確認できませんでした：\n' + e.message);
  }
}

// ---------------------------------------------------------------- トリガー（初期設定で自動登録）

/** 講師がフォームを送信したとき */
function onFormSubmitHandler(e) {
  var a = answersFromResponse_(e.response);
  addReport_(a, e.response.getTimestamp());
}

/** シートが編集されたとき：承認✓ならすぐ送る／マスタが変わればフォームの選択肢を更新 */
function onSheetEditHandler(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  if (name === SHEET.REPORTS) {
    if (e.range.getColumn() !== colOf_(sh, '承認') || e.range.getRow() < 2) return;
    if (String(settings_()['承認したらすぐ送る']).trim() === 'いいえ') return;
    for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      if (sh.getRange(r, e.range.getColumn()).getValue() === true) sendReportRow_(r);
    }
  } else if (name === SHEET.STUDENTS || name === SHEET.TEACHERS) {
    if (e.range.getRow() < 2) return;
    try { refreshChoices_(); } catch (err) { /* フォーム未作成なら何もしない */ }
  }
}
