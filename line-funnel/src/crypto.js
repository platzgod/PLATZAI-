// 署名検証（Workers 標準の Web Crypto を使用）
const encoder = new TextEncoder();

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// LINE: x-line-signature = base64(HMAC-SHA256(チャネルシークレット, 本文))
export async function verifyLineSignature(body, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  return timingSafeEqual(toBase64(await hmacSha256(channelSecret, body)), signature);
}

// Stripe: Stripe-Signature = "t=タイムスタンプ,v1=hex(HMAC-SHA256(シークレット, "t.本文"))"
export async function verifyStripeSignature(body, header, secret, nowSec, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const v1s = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || v1s.length === 0 || Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = toHex(await hmacSha256(secret, `${t}.${body}`));
  return v1s.some((v) => timingSafeEqual(v, expected));
}
