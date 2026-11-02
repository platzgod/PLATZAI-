// 実行：node report_system/test/run_tests.js
// .gs ファイルを Node の vm で読み込み、モックの上で「回答 → 確認待ち → 承認 → 送信」と LINE 連携を通しで確かめる。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { makeEnv } = require('./gas_mock');

const SRC = path.join(__dirname, '..', 'apps_script');
const FILES = ['Config.gs', 'Report.gs', 'Sheets.gs', 'Send.gs', 'LineLink.gs', 'Menu.gs'];

function load() {
  const env = makeEnv();
  const ctx = vm.createContext(env.g);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  return { ...env, ctx };
}

function fakeResponse(answers, ctx) {
  const items = ctx.QUESTIONS.filter(q => answers[q.key] !== undefined).map(q => ({
    getItem: () => ({ getTitle: () => q.title }),
    getResponse: () => answers[q.key]
  }));
  return { getItemResponses: () => items, getTimestamp: () => new Date(2026, 10, 2, 19, 30, 5) };
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('  NG  ' + name); throw e; }
}

const SAMPLE = {
  teacher: '佐藤 先生', student: 'S001 山田 太郎', date: '2026-11-02', subject: '数学',
  content: '二次関数の最大・最小（定義域に文字を含む場合分け）', material: '青チャート数I p.112〜118',
  understanding: '4', good: '軸と定義域の位置関係を図に描いて、3通りの場合分けを自分で整理できました。',
  issue: '場合分けの境目（等号を含むか）で迷うことがあります。次回、類題で確認します。',
  attitude: '良い', state: ['集中して取り組んでいた', '積極的に質問していた'], test: '8/10',
  hwPrev: '全部できていた', hwNext: '青チャート p.119〜121 の例題をノートに解く',
  comment: '先週より解く手が止まらなくなってきました。ご家庭でも「図を描いてる？」と声をかけてみてください。',
  nextDate: '2026-11-09', notice: '11月16日（月）は教室休業日のため、振替をご相談させてください。',
  memo: '模試の申込がまだ'
};

console.log('文面づくり');
{
  const { ctx } = load();
  test('日付と曜日', () => {
    assert.strictEqual(ctx.formatDateJa_('2026-11-02', true), '2026年11月2日（月）');
    assert.strictEqual(ctx.formatDateJa_('2026-11-09', false), '11月9日（月）');
  });
  test('連携コードの正規化（全角・小文字・空白）', () => {
    assert.strictEqual(ctx.normalizeCode_(' ａｂ３ ４ｃｄ '), 'AB34CD');
  });
  test('連携コードは6文字で重複しない', () => {
    const c = ctx.generateCode_(['AAAAAA']);
    assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
  });
  test('本文：必要な項目が入り、申し送りは入らない', () => {
    const t = ctx.buildReportText_(SAMPLE, { '生徒名': '山田 太郎', '学年': '高2' },
      { '塾名': '〇〇個別指導塾', '教室名': '駅前教室', '問い合わせ先': '0120-000-000' });
    for (const s of ['山田 太郎さん（高2）', '2026年11月2日（月）', '★★★★☆（4/5）', '・積極的に質問していた',
      '小テスト：8／10点', '前回の宿題：全部できていた', '■ 次回の授業　11月9日（月）', '■ ご連絡'])
      assert.ok(t.includes(s), '含まれない: ' + s);
    assert.ok(!t.includes('模試の申込'), '申し送りが保護者向け本文に入っている');
    fs.writeFileSync(path.join(__dirname, '..', '見本_送信される文面.txt'), t + '\n');
  });
  test('本文：任意項目が空なら見出しごと省く', () => {
    const a = { ...SAMPLE, issue: '', test: '', hwNext: '', nextDate: '', notice: '', state: [] };
    const t = ctx.buildReportText_(a, { '生徒名': '山田 太郎' }, {});
    for (const s of ['△ これからの課題', '小テスト', '次回までの宿題', '■ 次回の授業', '■ ご連絡'])
      assert.ok(!t.includes(s), '残っている: ' + s);
  });
  test('長文は LINE の 5000 文字制限内に分割', () => {
    const parts = ctx.splitForLine_(('あ'.repeat(3000) + '\n\n').repeat(4));
    assert.ok(parts.length >= 3 && parts.every(p => p.text.length <= 5000));
  });
}

console.log('通しの流れ');
{
  const { ctx, calls, fetchHandlers, sheets } = load();
  ctx.setupSheets_();
  const sh = n => sheets.find(s => s.name === n);
  test('初期設定でシートができる', () => {
    for (const n of ['生徒マスタ', '講師マスタ', '報告書', '設定', '送信ログ']) assert.ok(sh(n), n);
    assert.ok(!sh('シート1'));
  });

  // S002（LINE希望）に連携コードを発行 → 保護者が全角でコードを送る
  ctx.setCell_(sh('生徒マスタ'), 3, '連携コード', 'K7M2QX');
  ctx.PropertiesService.getScriptProperties().setProperty('LINE_TOKEN', 'TOKEN');
  const UID = 'U' + 'a'.repeat(32);
  const UID2 = 'U' + 'b'.repeat(32);

  test('知らないコードは連携しない', () => {
    ctx.doPost({ postData: { contents: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r0', source: { type: 'user', userId: UID }, message: { type: 'text', text: 'ZZZZZZ' } }] }) } });
    assert.strictEqual(ctx.findStudent_('S002')['LINEユーザーID'], '');
    assert.match(calls.fetch.at(-1).payload.messages[0].text, /見つかりません/);
  });
  test('ふつうのメッセージには返信しない', () => {
    const n = calls.fetch.length;
    ctx.doPost({ postData: { contents: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r0', source: { type: 'user', userId: UID }, message: { type: 'text', text: '振替の相談です' } }] }) } });
    assert.strictEqual(calls.fetch.length, n);
  });
  test('コードで LINE 連携され、コードは消える', () => {
    ctx.doPost({ postData: { contents: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r1', source: { type: 'user', userId: UID }, message: { type: 'text', text: 'ｋ７ｍ２ｑｘ' } }] }) } });
    const st = ctx.findStudent_('S002');
    assert.strictEqual(st['LINEユーザーID'], UID);
    assert.strictEqual(st['連携コード'], '');
    assert.ok(Object.prototype.toString.call(st['LINE連携日時']) === '[object Date]');
    assert.match(calls.fetch.at(-1).payload.messages[0].text, /佐藤 花さんの学習報告書/);
  });
  test('使ったコードはもう使えない', () => {
    ctx.doPost({ postData: { contents: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r2', source: { type: 'user', userId: UID2 }, message: { type: 'text', text: 'K7M2QX' } }] }) } });
    assert.strictEqual(ctx.findStudent_('S002')['LINEユーザーID'], UID);
  });
  test('友だちでない ID（プロフィールAPIが404）は連携しない', () => {
    ctx.setCell_(sh('生徒マスタ'), 3, '連携コード', 'P3P3P3');
    fetchHandlers.unshift({ test: u => u.includes('/profile/' + UID2), code: 404, body: '{"message":"Not found"}' });
    ctx.doPost({ postData: { contents: JSON.stringify({ events: [
      { type: 'message', replyToken: 'r3', source: { type: 'user', userId: UID2 }, message: { type: 'text', text: 'P3P3P3' } }] }) } });
    assert.strictEqual(ctx.findStudent_('S002')['LINEユーザーID'], UID);
    fetchHandlers.shift();
    ctx.setCell_(sh('生徒マスタ'), 3, '連携コード', '');
  });

  const rep = sh('報告書');
  const col = h => ctx.colOf_(rep, h);
  const cell = (r, h) => rep._get(r, col(h));
  const approve = r => { rep._set(r, col('承認'), true); ctx.onSheetEditHandler({ range: rep.getRange(r, col('承認')) }); };

  test('フォーム送信 → 確認待ちで1行追加（まだ送らない）', () => {
    const before = { f: calls.fetch.length, m: calls.mail.length };
    ctx.onFormSubmitHandler({ response: fakeResponse(SAMPLE, ctx) });
    ctx.onFormSubmitHandler({ response: fakeResponse({ ...SAMPLE, student: 'S002 佐藤 花', subject: '英語' }, ctx) });
    assert.strictEqual(rep.getLastRow(), 3);
    assert.strictEqual(cell(2, 'ステータス'), '確認待ち');
    assert.strictEqual(cell(2, '承認'), false);
    assert.strictEqual(cell(2, '生徒ID'), 'S001');
    assert.strictEqual(cell(2, '送信先'), 'メール');
    assert.strictEqual(cell(3, '送信先'), 'LINE');
    assert.strictEqual(cell(2, '授業中の様子（当てはまるものすべて）'), '集中して取り組んでいた、積極的に質問していた');
    assert.strictEqual(calls.fetch.length, before.f);
    assert.strictEqual(calls.mail.length, before.m);
  });

  test('教室長が本文を直して承認 → 直した本文がメールで届く', () => {
    rep._set(2, col(ctx.REPORT_TAIL[0]), cell(2, ctx.REPORT_TAIL[0]).replace('声をかけてみてください', '声をかけてあげてください'));
    approve(2);
    assert.strictEqual(cell(2, 'ステータス'), '送信済み');
    const m = calls.mail.at(-1);
    assert.strictEqual(m.to, 'parent@example.com');
    assert.strictEqual(m.subject, '【学習報告書】山田 太郎さん 11月2日（月）');
    assert.ok(m.body.includes('声をかけてあげてください'));
    assert.ok(Object.prototype.toString.call(cell(2, '送信日時')) === '[object Date]');
  });

  test('もう一度✓を付けても二重には送らない', () => {
    const n = calls.mail.length;
    approve(2);
    assert.strictEqual(calls.mail.length, n);
  });

  test('LINE が失敗 → 送信エラー、直ったら再送で送信済み（Retry-Key は同じ）', () => {
    fetchHandlers.unshift({ test: u => u.endsWith('/message/push'), code: 500, body: '{"message":"Internal"}' });
    approve(3);
    assert.strictEqual(cell(3, 'ステータス'), '送信エラー');
    assert.match(cell(3, 'エラー'), /LINE API 500/);
    const key1 = calls.fetch.at(-1).opt.headers['X-Line-Retry-Key'];
    fetchHandlers.shift();
    const c = ctx.sendApprovedReports();
    assert.deepStrictEqual({ ...c }, { sent: 1, failed: 0 });
    assert.strictEqual(cell(3, 'ステータス'), '送信済み');
    assert.strictEqual(cell(3, 'エラー'), '');
    const push = calls.fetch.at(-1);
    assert.strictEqual(push.payload.to, UID);
    assert.strictEqual(push.opt.headers.Authorization, 'Bearer TOKEN');
    assert.strictEqual(push.opt.headers['X-Line-Retry-Key'], key1);
    assert.match(key1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('「承認したらすぐ送る」=いいえ なら✓だけでは送らない', () => {
    ctx.onFormSubmitHandler({ response: fakeResponse(SAMPLE, ctx) });
    const set = sh('設定');
    const r = set.data.findIndex(x => x[0] === '承認したらすぐ送る') + 1;
    set._set(r, 2, 'いいえ');
    const n = calls.mail.length;
    approve(4);
    assert.strictEqual(cell(4, 'ステータス'), '確認待ち');
    assert.strictEqual(calls.mail.length, n);
    ctx.sendApprovedReports();
    assert.strictEqual(cell(4, 'ステータス'), '送信済み');
  });

  test('送信方法「送らない」→ 送信先なし', () => {
    ctx.setCell_(sh('生徒マスタ'), 2, '送信方法', '送らない');
    ctx.onFormSubmitHandler({ response: fakeResponse(SAMPLE, ctx) });
    approve(5);
    ctx.sendApprovedReports();
    assert.strictEqual(cell(5, 'ステータス'), '送信先なし');
  });

  test('送信ログが残る', () => {
    const log = sh('送信ログ').data.slice(1).map(r => r[5]);
    assert.ok(log.includes('送信済み') && log.includes('失敗') && log.includes('連携済み'));
  });
}

console.log(`\n${passed} 件すべて成功`);
