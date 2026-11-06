import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import {
  applyAndVerifyTencent,
  applyAndVerifyTurnstileChallenge,
  submitAndVerifyRecaptchaV2,
  submitAndVerifyYandex,
  verifyGeeTestDemo
} from './_verification.js';
import { installTencentInterceptor } from './_extractors.js';

const browser = await chromium.launch({ headless: true });
const targetURL = 'https://verification.test/demo';
const recaptchaForm = `
  <form method="POST">
    <textarea id="g-recaptcha-response" name="g-recaptcha-response"></textarea>
    <input id="recaptcha-demo-submit" type="submit">
  </form>`;
const challengePage = `
  <script>
    window._cf_chl_opt = {};
    window.cfCallback = async (token) => {
      await fetch('/verify', { method: 'POST', body: token });
      location.reload();
    };
  </script>`;
let passed = 0;

/** Run each case in an isolated browser context with every request intercepted. */
async function test(name, callback) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/*', (route) => route.abort());
    await callback(await context.newPage(), context);
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}

/** Serve a local form and simulate the server's response to submission. */
async function recaptchaCase(page, body, status = 200) {
  await page.route(targetURL, async (route) => {
    const submitted = route.request().method() === 'POST';
    if (submitted) assert.match(route.request().postData(), /g-recaptcha-response=test-token/);
    await route.fulfill({
      status: submitted ? status : 200,
      contentType: 'text/html; charset=utf-8',
      body: submitted ? body : recaptchaForm
    });
  });
  await page.goto(targetURL);
  return submitAndVerifyRecaptchaV2(page, 'test-token', { timeout: 1500 });
}

async function geeTestCase(page, version, result = 'success') {
  const endpoint = `https://verification.test/api/v1/captcha-demo/gee-test${version === 4 ? '-v4' : ''}/verify`;
  const solution =
    version === 4
      ? {
          captcha_id: 'captcha-id',
          lot_number: 'lot-number',
          pass_token: 'pass-token',
          gen_time: '123456',
          captcha_output: 'captcha-output'
        }
      : { challenge: 'challenge', validate: 'validate', seccode: 'seccode' };
  await page.route(endpoint, async (route) => {
    const expectedPayload =
      version === 4
        ? solution
        : {
            geetest_challenge: solution.challenge,
            geetest_validate: solution.validate,
            geetest_seccode: solution.seccode
          };
    assert.deepEqual(route.request().postDataJSON(), expectedPayload);
    const response = version === 4 ? { result } : { success: result === 'success' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route(targetURL, (route) => route.fulfill({ contentType: 'text/html', body: '' }));
  await page.goto(targetURL);
  return verifyGeeTestDemo(page, version, solution);
}

async function yandexCase(page, body) {
  const form = `
    <form method="POST">
      <input name="smart-token">
      <input id="smartcaptcha-demo-submit" type="submit">
    </form>`;
  await page.route(targetURL, async (route) => {
    const submitted = route.request().method() === 'POST';
    if (submitted) assert.match(route.request().postData(), /smart-token=test-token/);
    await route.fulfill({ contentType: 'text/html', body: submitted ? body : form });
  });
  await page.goto(targetURL);
  return submitAndVerifyYandex(page, 'test-token', { timeout: 1500 });
}

async function tencentCase(page) {
  await installTencentInterceptor(page);
  await page.route(targetURL, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>
        window.TencentCaptcha = class {
          constructor(appId, callback) { window.demoCallback = callback; }
          show() {}
        };
        new window.TencentCaptcha('123456', (result) => {
          window.tbs_external.nativeCall('jsSendCaptchaResult', [JSON.stringify(result)]);
          document.body.textContent = result.ret === 0 ? 'Tencent accepted' : 'Tencent rejected';
        }).show();
      </script>`
    })
  );
  await page.goto(targetURL);
  const solution = { appid: '123456', ret: 0, ticket: 'ticket', randstr: 'randstr' };
  await applyAndVerifyTencent(page, solution, { timeout: 1500 });
  assert.equal(await page.locator('body').innerText(), 'Tencent accepted');
}

/** Model callback verification followed by reloading the protected document. */
async function challengeCase(page, context, options = {}) {
  let submitted = false;
  if (options.oldCookie) {
    await context.addCookies([{ name: 'cf_clearance', value: 'old', url: targetURL }]);
  }
  await page.route('https://verification.test/verify', async (route) => {
    assert.equal(route.request().postData(), 'test-token');
    await options.beforeVerification?.();
    submitted = true;
    await route.fulfill({
      status: 200,
      headers:
        options.cookie === false
          ? {}
          : { 'set-cookie': 'cf_clearance=fresh; Path=/; Secure; HttpOnly' },
      body: 'verified'
    });
  });
  await page.route(targetURL, (route) =>
    route.fulfill({
      status: submitted ? (options.status ?? 200) : 403,
      contentType: 'text/html',
      headers: submitted && options.challengeHeader ? { 'cf-mitigated': 'challenge' } : {},
      body: submitted
        ? (options.body ?? '<h1>Protected content</h1>')
        : options.historyChange
          ? challengePage.replace(
              "await fetch('/verify'",
              "history.replaceState({}, '', '#checking'); await fetch('/verify'"
            )
          : challengePage
    })
  );
  await page.goto(targetURL);
  return applyAndVerifyTurnstileChallenge(page, 'test-token', { timeout: 5000 });
}

try {
  await test('Google accepts only the explicit success message', (page) =>
    recaptchaCase(page, '<div class="recaptcha-success">Verification Success... Hooray!</div>'));
  await test('Google accepts the Russian confirmation observed on the real demo', async (page) => {
    await recaptchaCase(page, '<div class="recaptcha-success">Проверка прошла успешно… Ура!</div>');
    assert.equal(
      await page.locator('.recaptcha-success').innerText(),
      'Проверка прошла успешно… Ура!'
    );
  });
  await test('Google rejects an empty success container', async (page) => {
    await assert.rejects(
      recaptchaCase(page, '<div class="recaptcha-success"> </div>'),
      /did not confirm token acceptance/
    );
  });
  await test('Google rejects a loaded form without success', async (page) => {
    await assert.rejects(recaptchaCase(page, recaptchaForm), /did not confirm token acceptance/);
  });
  await test('Google rejects an HTTP error even with success text', async (page) => {
    await assert.rejects(
      recaptchaCase(page, '<div class="recaptcha-success">Verification Success</div>', 500),
      /HTTP 500/
    );
  });
  await test('GeeTest v3 requires the demo verification response', (page) => geeTestCase(page, 3));
  await test('GeeTest v4 requires the demo verification response', (page) => geeTestCase(page, 4));
  await test('GeeTest rejects a failed demo verification response', async (page) => {
    await assert.rejects(geeTestCase(page, 4, 'fail'), /demo rejected the solution/);
  });
  await test('Yandex submits the token and requires a success message', (page) =>
    yandexCase(page, '<div class="greeting">Hello, user!</div>'));
  await test('Yandex rejects a response without a success message', async (page) => {
    await assert.rejects(
      yandexCase(page, '<div class="error">Captcha validation failed</div>'),
      /did not confirm token acceptance/
    );
  });
  await test('Tencent passes the solution through the page callback', (page) => tencentCase(page));
  await test('Turnstile waits for asynchronous verification and document loading', async (page, context) => {
    let release;
    let reached;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      reached = resolve;
    });
    let settled = false;
    const verification = challengeCase(page, context, {
      beforeVerification: async () => {
        reached();
        await pending;
      }
    }).finally(() => {
      settled = true;
    });
    try {
      await started;
      assert.equal(settled, false);
      assert.equal(page.isClosed(), false);
      assert.equal(await page.evaluate(() => Boolean(window._cf_chl_opt)), true);
    } finally {
      release();
      await verification;
    }
    assert.equal(await page.locator('h1').innerText(), 'Protected content');
  });
  await test('Turnstile ignores a same-document transition before the protected page reloads', async (page, context) => {
    await challengeCase(page, context, { historyChange: true });
    assert.equal(await page.locator('h1').innerText(), 'Protected content');
  });
  await test('Turnstile rejects a repeated HTTP 403 challenge', async (page, context) => {
    await assert.rejects(challengeCase(page, context, { status: 403 }), /HTTP 403/);
  });
  await test('Turnstile rejects a challenge header on HTTP 200', async (page, context) => {
    await assert.rejects(
      challengeCase(page, context, { challengeHeader: true }),
      /did not confirm/
    );
  });
  await test('Turnstile rejects challenge markup even with a clearance cookie', async (page, context) => {
    await assert.rejects(challengeCase(page, context, { body: challengePage }), /did not confirm/);
  });
  await test('Turnstile rejects a successful document without clearance', async (page, context) => {
    await assert.rejects(challengeCase(page, context, { cookie: false }), /did not confirm/);
  });
  await test('Turnstile does not accept an old clearance cookie as new proof', async (page, context) => {
    await assert.rejects(
      challengeCase(page, context, { cookie: false, oldCookie: true }),
      /did not confirm/
    );
  });
  await test('Turnstile rejects a callback that never navigates', async (page) => {
    await page.route(targetURL, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<script>window.cfCallback = () => {};</script>'
      })
    );
    await page.goto(targetURL);
    await assert.rejects(
      applyAndVerifyTurnstileChallenge(page, 'test-token', { timeout: 250 }),
      /Timeout/
    );
  });
  console.log(`${passed} local browser tests passed.`);
} finally {
  await browser.close();
}
