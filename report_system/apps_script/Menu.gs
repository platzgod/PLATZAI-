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
