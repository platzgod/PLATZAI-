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
