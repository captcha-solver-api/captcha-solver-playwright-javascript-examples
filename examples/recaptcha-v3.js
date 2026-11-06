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
 */

// Read the target URL from .env; replace the example.com placeholder before running.
const websiteURL =
  process.env.RECAPTCHA_V3_TARGET_URL || 'https://example.com/page_with_recaptcha_v3';
const solverTimeout = 180_000;
const minimumScore = 0.3;
// Create the SDK client with the API key and a longer timeout for reCAPTCHA v3.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY',
  timeout: solverTimeout
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
    // Open the configured page containing reCAPTCHA v3.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // reCAPTCHA v3 has no widget. Extract the site key and action from grecaptcha.execute().
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
    // Build the task from the extracted site key and action.
    const task = new Tasks.RecaptchaV3Proxyless({
      websiteURL,
      websiteKey,
      pageAction,
      minScore: minimumScore
    });

    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // The demo exposes a callback that submits the token to its verification endpoint.
    return page.evaluate((token) => window.verifyRecaptcha(token), solution.gRecaptchaResponse);
  })
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
