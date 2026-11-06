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
 */

// Read the target URL from .env; replace the example.com placeholder before running.
const websiteURL =
  process.env.RECAPTCHA_ENTERPRISE_TARGET_URL ||
  'https://example.com/page_with_recaptcha_v2_enterprise';
// Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

let browser;
let page;

// Launch Chromium.
chromium
  .launch({ headless: process.env.HEADLESS === 'true' })
  .then((instance) => {
    browser = instance;
    // Create a new browser page.
    return browser.newPage();
  })
  .then((openedPage) => {
    page = openedPage;
    // Open the configured page containing reCAPTCHA v2 Enterprise.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // Enterprise widgets expose their public key through data-sitekey.
  .then(() => page.locator('[data-sitekey]').first().getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('Enterprise site key not found.');

    // Build the task from the extracted site key.
    const task = new Tasks.RecaptchaV2EnterpriseProxyless({
      websiteURL,
      websiteKey,
      isInvisible: false
    });

    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Insert the solved token into the hidden response field used by the form.
    return page.locator('#g-recaptcha-response').evaluate((element, token) => {
      element.value = token;
      element.innerHTML = token;
    }, solution.gRecaptchaResponse);
  })
  // Submit the form containing the injected token.
  .then(() => page.locator('button[type="submit"]').click())
  // Read the success message displayed by the page.
  .then(() => page.locator('p[class*="successMessage"]').filter({ hasText: /\S/ }).innerText())
  .then((message) => {
    // Print the page confirmation to the console.
    console.log(`Page confirmation: ${message.trim()}`);
  })
  // Handle errors raised during browser automation or CAPTCHA solving.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
