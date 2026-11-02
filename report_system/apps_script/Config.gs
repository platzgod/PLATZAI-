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
  '中学生': ['英語', '数学', '国語', '理科', '社会', '英検対策', 'その他'],
  '高校生': ['英語', '数学ⅠA', '数学ⅡB', '数学Ⅲ', '数学C', '現代文', '古文・漢文',
    '物理', '化学', '生物', '地学', '日本史', '世界史', '地理', '公共・倫理・政経',
    '情報', '小論文', '英検対策', 'その他']
};
var LEVELS = ['中学生', '高校生'];
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
 *   perLevel … 中学生用・高校生用の2ページに分けて作る（科目の選択肢だけが違う）
 *
 * ページの進み方：
 *   ① 基本情報 ─ 区分＝中学生 → ② 1科目目（中学生）┐
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
 *   options  … 'levels'（中学生/高校生）, 'subjects'（区分に合わせた科目）, 配列
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
  ['塾名', '〇〇個別指導塾', '報告書の差出人として表示'],
  ['教室名', '〇〇教室', ''],
  ['問い合わせ先', '0120-000-000', '報告書の末尾に表示（空欄なら表示しない）'],
  ['メールの件名', '【学習報告書】{生徒名}さん {授業日}', '{生徒名} {授業日} {科目} が使えます'],
  ['LINE連携の案内文', 'お手元の「連携コード」（6文字）をこのトークに送ってください。お子さまの学習報告書が届くようになります。', '友だち追加されたときに自動で返信'],
  ['承認したらすぐ送る', 'はい', '「いいえ」にすると、メニューの「承認済みをまとめて送る」で送る']
];
