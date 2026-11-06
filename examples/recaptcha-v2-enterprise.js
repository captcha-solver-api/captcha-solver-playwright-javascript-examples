import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve reCAPTCHA v2 Enterprise without using a proxy. It opens the
 * demo page, extracts the site key, sends the task to the service, inserts the returned token into
 * the form, and checks the page confirmation. It uses Tasks.RecaptchaV2EnterpriseProxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and verify the site key and any
 * enterprise payload required by that page. Token fields, callbacks, submission, and success
 * indicators are site-specific, so inspect and debug the page before applying the token.
 *
 * How it works:
 * STEP-01 - Configure the target and create the SDK client.
 * STEP-02 - Launch Chromium and open the target page.
 * STEP-03 - Extract the Enterprise site key from the page.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and inject its token into the form.
 * STEP-06 - Submit the form and verify that the page accepts the token.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target URL and create the SDK client.
const websiteURL =
  process.env.RECAPTCHA_ENTERPRISE_TARGET_URL ||
  'https://example.com/page_with_recaptcha_v2_enterprise';
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
  // STEP-03: Extract the Enterprise site key exposed through data-sitekey.
  .then(() => page.locator('[data-sitekey]').first().getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('Enterprise site key not found.');

    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.RecaptchaV2EnterpriseProxyless({
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
    // Insert the solved token into the hidden response field used by the form.
    return page.locator('#g-recaptcha-response').evaluate((element, token) => {
      element.value = token;
      element.innerHTML = token;
    }, solution.gRecaptchaResponse);
  })
  // STEP-06: Submit the form and verify that the page accepts the token.
  .then(() => page.locator('button[type="submit"]').click())
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
