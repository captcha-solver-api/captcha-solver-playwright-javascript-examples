import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve Google reCAPTCHA v2 without using a proxy. It opens the demo
 * page, extracts the site key, sends the task to the service, inserts the returned token into the
 * form, and verifies that the page accepts it. It uses Tasks.RecaptchaV2Proxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and update the site-key selector.
 * Token fields, callbacks, form submission, and success indicators are site-specific, so inspect
 * and debug the target page before adapting the token application step.
 *
 * How it works:
 * STEP-01 - Configure the target and create the SDK client.
 * STEP-02 - Launch Chromium and open the target page.
 * STEP-03 - Extract the reCAPTCHA site key from the page.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and inject its token into the form.
 * STEP-06 - Submit the form and verify that the page accepts the token.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target URL and create the SDK client.
const websiteURL = process.env.RECAPTCHA_V2_TARGET_URL;
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
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
  // STEP-03: Extract the public site key rendered by the reCAPTCHA widget.
  .then(() => page.locator('#recaptcha-demo').getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('reCAPTCHA site key not found.');

    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.RecaptchaV2Proxyless({
      websiteURL,
      websiteKey,
      isInvisible: false
    });

    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log the solution and inject its token into the form.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Put the token into the field that the demo form sends to Google.
    return page.locator('#g-recaptcha-response').evaluate((element, token) => {
      element.value = token;
    }, solution.gRecaptchaResponse);
  })
  // STEP-06: Submit the form and verify that the page accepts the token.
  .then(() =>
    Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#recaptcha-demo-submit').click()
    ])
  )
  .then(([response]) => {
    if (!response?.ok()) throw new Error(`Demo returned HTTP ${response?.status()}.`);

    // Require the demo page's explicit success message; a token alone is not proof of acceptance.
    return page.locator('.recaptcha-success').filter({ hasText: /\S/ }).innerText();
  })
  .then((message) => {
    // Print the page confirmation to the console.
    console.log(`Page confirmation: ${message.trim()}`);
  })
  // STEP-07: Handle errors and always close Chromium.
  .catch(console.error)
  .finally(() => {
    return browser?.close();
  });
