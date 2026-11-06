import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve score-based Google reCAPTCHA v3 without using a proxy. It opens
 * the page, extracts the site key and action, sends the task to the service, passes the returned
 * token to the page callback, and checks the confirmation. It uses Tasks.RecaptchaV3Proxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and verify how the site key, action,
 * and minimum score are configured. The callback and verification flow are site-specific, so
 * inspect and debug the target page to determine how its token must be applied.
 *
 * How it works:
 * STEP-01 - Configure the target, task options, and SDK client.
 * STEP-02 - Launch Chromium and open the target page.
 * STEP-03 - Extract the reCAPTCHA site key and action from the page.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and pass its token to the page callback.
 * STEP-06 - Verify that the page accepts the token.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target and task options, then create the SDK client.
const websiteURL =
  process.env.RECAPTCHA_V3_TARGET_URL || 'https://example.com/page_with_recaptcha_v3';
const solverTimeout = 180_000;
const minimumScore = 0.3;
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY',
  timeout: solverTimeout
});

let browser;
let page;

// STEP-02: Launch Chromium and open the configured target page.
chromium
  .launch({ headless: process.env.HEADLESS === 'true' })
  .then((instance) => {
    browser = instance;
    return browser.newPage();
  })
  .then((openedPage) => {
    page = openedPage;
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // STEP-03: Extract the site key and action from grecaptcha.execute(); v3 has no widget.
  .then(() =>
    page.waitForFunction(() => {
      const source = [...document.scripts].map((script) => script.textContent || '').join('\n');
      const match = source.match(
        /grecaptcha\.execute\s*\(\s*['"](?<websiteKey>[^'"]+)['"]\s*,\s*\{[^}]*action\s*:\s*['"](?<pageAction>[^'"]+)/i
      );
      return match?.groups ?? null;
    })
  )
  // Convert the extracted browser value into task parameters in Node.js.
  .then((handle) => handle.jsonValue())
  .then(({ websiteKey, pageAction }) => {
    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.RecaptchaV3Proxyless({
      websiteURL,
      websiteKey,
      pageAction,
      minScore: minimumScore
    });

    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log the solution and pass its token to the page callback.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // The demo exposes a callback that submits the token to its verification endpoint.
    return page.evaluate((token) => window.verifyRecaptcha(token), solution.gRecaptchaResponse);
  })
  // STEP-06: Verify that the page accepts the token through its success message.
  .then(() => page.locator('p[class*="successMessage"]').filter({ hasText: /\S/ }).innerText())
  .then((message) => {
    // Print the page confirmation to the console.
    console.log(`Page confirmation: ${message.trim()}`);
  })
  // STEP-07: Handle errors and always close Chromium.
  .catch(console.error)
  .finally(() => {
    return browser?.close();
  });
