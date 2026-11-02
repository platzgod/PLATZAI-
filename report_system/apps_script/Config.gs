/**
 * 学習報告書システム — 設定（質問・シートの列）
 *
 * 質問を増やす・減らす・言い回しを変えるときは QUESTIONS だけを直し、
 * メニュー「学習報告書 → フォームを作り直す」を実行してください。
 */

var SHEET = {
  STUDENTS: '生徒マスタ',
  TEACHERS: '講師マスタ',
  REPORTS: '報告書',
  SETTINGS: '設定',
  LOG: '送信ログ'
};

var SUBJECTS = ['英語', '数学', '国語', '理科', '社会', 'その他'];
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
 * 講師が授業後に答える質問（この順でフォームに並ぶ）。
 *   key      … プログラム内の名前（変えない）
 *   title    … フォームに表示する質問文
 *   type     … list / date / text / paragraph / scale / choice / checkbox
 *   section  … 区切り（フォームのページ見出し）
 *   internal … true なら保護者には送らない（教室長だけが見る）
 */
var QUESTIONS = [
  { key: 'teacher', title: '講師名', type: 'list', source: 'teachers', required: true,
    section: '① 授業の基本情報' },
  { key: 'student', title: '生徒名', type: 'list', source: 'students', required: true },
  { key: 'date', title: '授業日', type: 'date', required: true },
  { key: 'subject', title: '科目', type: 'choice', options: SUBJECTS, required: true },

  { key: 'content', title: '今日の学習内容（単元・テーマ）', type: 'paragraph', required: true,
    help: '例：二次関数の最大・最小（場合分け）', section: '② 学習内容と理解度' },
  { key: 'material', title: '使った教材・ページ', type: 'text',
    help: '例：青チャート数I p.112〜118' },
  { key: 'understanding', title: '理解度', type: 'scale', min: 1, max: 5,
    minLabel: 'まだ難しい', maxLabel: 'よく理解できた', required: true },
  { key: 'good', title: 'できたこと・よかったこと', type: 'paragraph', required: true,
    help: '具体的に1〜2点（保護者が読んで様子が浮かぶように）' },
  { key: 'issue', title: 'これからの課題・つまずいたところ', type: 'paragraph',
    help: '次回どう手当てするかも書くと伝わりやすいです' },

  { key: 'attitude', title: '授業態度', type: 'choice', options: ATTITUDES, required: true,
    section: '③ 授業の様子・小テスト' },
  { key: 'state', title: '授業中の様子（当てはまるものすべて）', type: 'checkbox', options: STATE_OPTIONS },
  { key: 'test', title: '小テストの結果', type: 'text',
    help: '例：8/10　（実施しなかったときは空欄）' },

  { key: 'hwPrev', title: '前回の宿題', type: 'choice', options: HOMEWORK_OPTIONS, required: true,
    section: '④ 宿題' },
  { key: 'hwNext', title: '次回までの宿題', type: 'paragraph',
    help: '例：青チャート p.119〜121 の例題をノートに解く' },

  { key: 'comment', title: '保護者へのひとこと', type: 'paragraph', required: true,
    section: '⑤ 講師コメント・連絡' },
  { key: 'nextDate', title: '次回の授業日', type: 'date' },
  { key: 'notice', title: '保護者への連絡事項', type: 'paragraph',
    help: '振替・面談・持ち物など（なければ空欄）' },
  { key: 'memo', title: '教室長への申し送り（保護者には送りません）', type: 'paragraph', internal: true }
];

/** 報告書シートの列（左から）。質問の列は QUESTIONS から自動で並ぶ。 */
var REPORT_HEAD = ['受付日時', '報告ID', 'ステータス', '承認', '生徒ID'];
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
var SEND_METHODS = ['メール', 'LINE', 'LINE＋メール', '送らない'];

var TEACHER_HEADERS = ['講師名', '在籍'];

var SETTING_ROWS = [
  ['塾名', '〇〇個別指導塾', '報告書の差出人として表示'],
  ['教室名', '〇〇教室', ''],
  ['問い合わせ先', '0120-000-000', '報告書の末尾に表示（空欄なら表示しない）'],
  ['メールの件名', '【学習報告書】{生徒名}さん {授業日}', '{生徒名} {授業日} {科目} が使えます'],
  ['LINE連携の案内文', '下の「連携コード」をこのトークに送ってください。お子さまの学習報告書が届くようになります。', '友だち追加されたときに自動で返信'],
  ['承認したらすぐ送る', 'はい', '「いいえ」にすると、メニューの「承認済みをまとめて送る」で送る']
];
