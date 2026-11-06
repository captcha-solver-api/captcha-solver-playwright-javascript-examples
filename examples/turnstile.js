import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve a standalone Cloudflare Turnstile widget without using a proxy.
 * It opens the page, extracts the site key, sends the task to the service, inserts the returned
 * token into the form, and checks the page confirmation. It uses Tasks.TurnstileProxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and update the widget and form
 * selectors. Token fields, callbacks, submission, and acceptance indicators are site-specific, so
 * inspect and debug the target page before adapting the token application step.
 *
 * How it works:
 * STEP-01 - Configure the target and create the SDK client.
 * STEP-02 - Launch Chromium and open the target page.
 * STEP-03 - Extract the Turnstile site key from the page.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and inject its token into the form.
 * STEP-06 - Submit the form and verify that the page accepts the token.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target URL and create the SDK client.
const websiteURL = process.env.TURNSTILE_TARGET_URL || 'https://example.com/page_with_turnstile';
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
    // Create a new browser page.
    return browser.newPage();
  })
  .then((openedPage) => {
    page = openedPage;
    // Open the configured page containing Turnstile.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // STEP-03: Read the public site key from the Turnstile container.
  .then(() => page.locator('#cf-turnstile').getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('Turnstile site key not found.');

    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.TurnstileProxyless({ websiteURL, websiteKey });
    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log the solution and inject its token into the form.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Turnstile forms submit the token through cf-turnstile-response.
    return page.locator('input[name="cf-turnstile-response"]').evaluate((element, token) => {
      element.value = token;
    }, solution.token);
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
    // Always close the browser after the example finishes.
    return browser?.close();
  });
