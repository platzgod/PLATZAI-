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
