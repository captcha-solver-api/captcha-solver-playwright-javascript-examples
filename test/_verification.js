/** Require a successful navigation back to the configured page. */
function verifyResponse(response, targetURL, label) {
  if (!response || !response.ok()) {
    throw new Error(
      `${label}: page verification failed (HTTP ${response?.status() ?? 'unknown'}).`
    );
  }
  const target = new URL(targetURL);
  const actual = new URL(response.url());
  if (actual.origin !== target.origin || actual.pathname !== target.pathname) {
    throw new Error(`${label}: redirected to an unexpected page.`);
  }
}

/** Send a GeeTest solution to the demo's own verification endpoint. */
export async function verifyGeeTestDemo(page, version, solution) {
  const endpoint = `/api/v1/captcha-demo/gee-test${version === 4 ? '-v4' : ''}/verify`;
  const payload =
    version === 4
      ? solution
      : {
          geetest_challenge: solution.challenge,
          geetest_validate: solution.validate,
          geetest_seccode: solution.seccode
        };
  const result = await page.evaluate(
    async ({ endpoint, payload: requestBody }) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      return { ok: response.ok, status: response.status, body: await response.json() };
    },
    { endpoint, payload }
  );

  const accepted =
    version === 4 ? result.body?.result === 'success' : result.body?.success === true;
  if (!result.ok || !accepted) {
    throw new Error(`GeeTest v${version}: the demo rejected the solution (HTTP ${result.status}).`);
  }
  console.log(`Page confirmation: GeeTest v${version} solution accepted.`);
}

/** Submit the Yandex demo form and require its explicit success message. */
export async function submitAndVerifyYandex(page, token, { timeout = 30000 } = {}) {
  const targetURL = page.url();
  await page.locator('input[name="smart-token"]').evaluate((element, value) => {
    element.value = value;
  }, token);

  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }),
    page.locator('#smartcaptcha-demo-submit').click({ timeout })
  ]);
  verifyResponse(response, targetURL, 'Yandex SmartCaptcha');

  const success = page.locator('.greeting').filter({ hasText: /\S/ });
  try {
    await success.waitFor({ state: 'visible', timeout });
    console.log(`Page confirmation: ${(await success.innerText()).trim()}`);
  } catch (cause) {
    throw new Error('Yandex SmartCaptcha: the page did not confirm token acceptance.', { cause });
  }
}

/** Pass a Tencent solution through the callback registered by the target page. */
export async function applyAndVerifyTencent(page, solution, { timeout = 30000 } = {}) {
  if (solution.ret !== 0 || !solution.ticket || !solution.randstr) {
    throw new Error('Tencent CAPTCHA: the solver response is incomplete.');
  }

  await page.evaluate((result) => {
    if (typeof window.__tencentCaptchaCallback !== 'function') {
      throw new Error('Tencent CAPTCHA callback is not available.');
    }
    window.__tencentCaptchaCallback(result);
  }, solution);

  await page.waitForFunction(
    ({ ticket, randstr }) =>
      window.__tencentAcceptedResult?.ret === 0 &&
      window.__tencentAcceptedResult.ticket === ticket &&
      window.__tencentAcceptedResult.randstr === randstr &&
      window.__tencentNativeCalls?.some((call) => {
        if (call.method !== 'jsSendCaptchaResult' || !call.args?.[0]) return false;
        try {
          const forwarded = JSON.parse(call.args[0]);
          return forwarded.ticket === ticket && forwarded.randstr === randstr;
        } catch {
          return false;
        }
      }),
    { ticket: solution.ticket, randstr: solution.randstr },
    { timeout }
  );
  console.log('Page confirmation: Tencent page forwarded the accepted solution.');
}

/** Submit the Google demo form and require its explicit success message. */
export async function submitAndVerifyRecaptchaV2(page, token, { timeout = 30000 } = {}) {
  const targetURL = page.url();
  await page.locator('#g-recaptcha-response').evaluate((element, value) => {
    element.value = value;
  }, token);

  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }),
    page.locator('#recaptcha-demo-submit').click({ timeout })
  ]);
  verifyResponse(response, targetURL, 'reCAPTCHA v2');

  // Google localizes the confirmation text; the success class is language-independent.
  const success = page.locator('.recaptcha-success').filter({ hasText: /\S/ });
  try {
    await success.waitFor({ state: 'visible', timeout });
    console.log(`Page confirmation: ${(await success.innerText()).trim()}`);
  } catch (cause) {
    throw new Error('reCAPTCHA v2: the page did not confirm token acceptance.', { cause });
  }
}

/** Wait for a fresh clearance cookie and the protected document after the callback. */
export async function applyAndVerifyTurnstileChallenge(page, token, { timeout = 60000 } = {}) {
  const targetURL = page.url();
  const previousCookies = await page.context().cookies(targetURL);
  const previousClearance = previousCookies.find((cookie) => cookie.name === 'cf_clearance')?.value;
  const deadline = Date.now() + timeout;
  const remaining = () => Math.max(1, deadline - Date.now());
  // A history/hash change keeps this marker; a new document does not.
  await page.evaluate(() => {
    window.__captchaSolverPendingDocument = true;
  });
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().isNavigationRequest() &&
          candidate.frame() === page.mainFrame() &&
          ![301, 302, 303, 307, 308].includes(candidate.status()),
        { timeout: remaining() }
      ),
      page.evaluate((value) => {
        if (typeof window.cfCallback !== 'function') {
          throw new Error('Turnstile callback is not available.');
        }
        window.cfCallback(value);
      }, token)
    ]);
    verifyResponse(response, targetURL, 'Turnstile Challenge');
    await page.waitForFunction(
      () => !window.__captchaSolverPendingDocument && document.readyState !== 'loading',
      null,
      { timeout: remaining() }
    );

    const stillChallenged =
      (await response.headerValue('cf-mitigated')) === 'challenge' ||
      (await page.evaluate(() => Boolean(window._cf_chl_opt)));
    const cookies = await page.context().cookies(targetURL);
    const clearance = cookies.find((cookie) => cookie.name === 'cf_clearance')?.value;
    if (stillChallenged || !clearance || clearance === previousClearance) {
      throw new Error('Turnstile Challenge: the page did not confirm challenge clearance.');
    }
    console.log('Page confirmation: challenge cleared and target page loaded.');
  } finally {
    await page
      .evaluate(() => {
        delete window.__captchaSolverPendingDocument;
      })
      .catch(() => {});
  }
}
