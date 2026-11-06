import assert from 'node:assert/strict';

import { parseTencentAppId, patchTurnstileApi } from './_extractors.js';
import { solutionToken, withTimeout } from './_helpers.js';

let passed = 0;

async function test(name, callback) {
  try {
    await callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await test('solutionToken supports reCAPTCHA and token solutions', () => {
  assert.equal(solutionToken({ gRecaptchaResponse: 'recaptcha-token' }), 'recaptcha-token');
  assert.equal(solutionToken({ token: 'generic-token' }), 'generic-token');
  assert.throws(() => solutionToken({}), /does not contain a token/);
});

await test('Tencent appId is extracted from the current demo bundle format', () => {
  const source =
    'window.onload=function(){var e,n,o,t="189920146",i=a(window.location.search,"lang"),s=a(window.location.search,"appid");';
  assert.equal(parseTencentAppId(source), '189920146');
});

await test('Turnstile API is patched before its onload callback', () => {
  const source = '(wr||(window.turnstile=xr),setTimeout(onload,0))';
  assert.equal(
    patchTurnstileApi(source),
    '(wr||(window.turnstile=xr,window.__wrapTurnstile?.(window.turnstile)),setTimeout(onload,0))'
  );
  assert.throws(() => patchTurnstileApi('setTimeout(onload,0)'), /initialization was not found/);
});

await test('withTimeout resolves normally and rejects slow operations', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50, 'too slow'), 'ready');
  await assert.rejects(
    withTimeout(new Promise(() => {}), 1, 'operation timed out'),
    /operation timed out/
  );
});

console.log(`${passed} tests passed.`);
