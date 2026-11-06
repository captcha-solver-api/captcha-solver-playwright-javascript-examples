import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve Yandex SmartCaptcha without using a proxy. It opens the demo
 * page, extracts the site key, sends the task to the service, inserts the returned token into the
 * form, and verifies that the page accepts it. It uses Tasks.YandexSmartCaptchaTaskProxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and update the widget and form
 * selectors. Token fields, callbacks, submission, and success indicators are site-specific, so
 * inspect and debug the target page before adapting the token application step.
 */

// Read the target page URL from the local .env file.
const websiteURL = process.env.YANDEX_TARGET_URL;
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
    // Open the configured page containing SmartCaptcha.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // The public site key is stored on the SmartCaptcha container.
  .then(() => page.locator('[data-sitekey]').first().getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('SmartCaptcha site key not found.');

    // Build the task from the extracted site key.
    const task = new Tasks.YandexSmartCaptchaTaskProxyless({ websiteURL, websiteKey });
    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Fill the same hidden field that the SmartCaptcha widget normally fills.
    return page.locator('input[name="smart-token"]').evaluate((element, token) => {
      element.value = token;
    }, solution.token);
  })
  // Submit the form and wait for the page navigation to finish.
  .then(() =>
    Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#smartcaptcha-demo-submit').click()
    ])
  )
  // Confirm acceptance through the greeting rendered by the demo after submission.
  .then(() => page.locator('.greeting').filter({ hasText: /\S/ }).innerText())
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
