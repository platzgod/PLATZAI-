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
