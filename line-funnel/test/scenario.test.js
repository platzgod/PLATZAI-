import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, nextStep, renderStep } from '../src/scenario.js';

const reg = '2026-11-01T14:30:00.000Z'; // 日本時間 11/1 23:30 に登録
const at = (iso) => new Date(iso);

test('経過日数は日本時間の日付で数える', () => {
  assert.equal(daysSince(reg, at('2026-11-01T14:59:00Z')), 0); // JST 11/1 23:59
  assert.equal(daysSince(reg, at('2026-11-01T15:00:00Z')), 1); // JST 11/2 0:00
  assert.equal(daysSince(reg, at('2026-11-08T01:00:00Z')), 7); // JST 11/8 10:00
});

test('未購入者：プレゼント② → フロント案内 → お役立ち情報', () => {
  const user = { registered_at: reg, front_purchased: 0 };
  const s = (...steps) => new Set(steps);
  assert.equal(nextStep(user, s(), at('2026-11-02T01:00:00Z')), 'welcome');
  assert.equal(nextStep(user, s('welcome'), at('2026-11-07T01:00:00Z')), null); // 6日目
  assert.equal(nextStep(user, s('welcome'), at('2026-11-08T01:00:00Z')), 'present2'); // 7日目
  assert.equal(nextStep(user, s('welcome', 'present2'), at('2026-11-14T01:00:00Z')), null); // 13日目
  assert.equal(nextStep(user, s('welcome', 'present2'), at('2026-11-15T01:00:00Z')), 'frontOffer'); // 14日目
  const afterOffer = s('welcome', 'present2', 'frontOffer');
  assert.equal(nextStep(user, afterOffer, at('2026-11-22T01:00:00Z')), null); // 21日目：未購入者には個別相談なし
  assert.equal(nextStep(user, afterOffer, at('2026-12-14T01:00:00Z')), null); // 43日目
  assert.equal(nextStep(user, afterOffer, at('2026-12-15T01:00:00Z')), 'monthly:1'); // 44日目
  afterOffer.add('monthly:1');
  assert.equal(nextStep(user, afterOffer, at('2027-01-13T01:00:00Z')), null);
  assert.equal(nextStep(user, afterOffer, at('2027-01-14T01:00:00Z')), 'monthly:2'); // 74日目
});

test('遅れて届く配信は1日1通ずつ、早いものから送る', () => {
  const user = { registered_at: reg, front_purchased: 0 };
  assert.equal(nextStep(user, new Set(['welcome']), at('2026-11-20T01:00:00Z')), 'present2');
});

test('購入者：フロント案内・お役立ち情報は送らず、21日目に個別相談', () => {
  const user = { registered_at: reg, front_purchased: 1 };
  const s = new Set(['welcome', 'present2']);
  assert.equal(nextStep(user, s, at('2026-11-15T01:00:00Z')), null); // 14日目でも案内しない
  assert.equal(nextStep(user, s, at('2026-11-22T01:00:00Z')), 'backendConsult'); // 21日目
  s.add('frontOffer');
  assert.equal(nextStep(user, s, at('2026-12-30T01:00:00Z')), 'backendConsult'); // 21日目より後に購入した人
  s.add('backendConsult');
  assert.equal(nextStep(user, s, at('2027-03-01T01:00:00Z')), null);
});

test('フロント案内に本人専用の決済リンクと申込番号が入る', () => {
  const [msg] = renderStep('frontOffer', { user_id: 'Uabc123', ref_code: 'XY23ZK', display_name: 'はなこ' });
  assert.match(msg.text, /client_reference_id=Uabc123/);
  assert.match(msg.text, /「XY23ZK」/);
  assert.doesNotMatch(msg.text, /\{\{/);
});

test('お役立ち情報は最後まで行ったら先頭に戻る', () => {
  const user = { user_id: 'U1', ref_code: 'AAAAAA' };
  assert.deepEqual(renderStep('monthly:4', user), renderStep('monthly:1', user));
});
