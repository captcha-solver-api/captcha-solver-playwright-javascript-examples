import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve GeeTest v4 without using a proxy. It opens the page, extracts
 * the captcha ID from the loader script, sends the task to the service, and submits the returned
 * solution to the demo verification endpoint. It uses Tasks.GeeTestProxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and verify how that page provides the
 * captcha ID and other initialization parameters. GeeTest solution fields, submission, and
 * success indicators are site-specific, so inspect and debug the target page before applying the
 * solution.
 */

// Read the target URL from .env; replace the example.com placeholder before running.
const websiteURL = process.env.GEETEST_V4_TARGET_URL || 'https://example.com/page_with_geetest_v4';
const solverTimeout = 300_000;
// Create the SDK client with the API key and a longer timeout for GeeTest.
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
    // Open the configured page containing GeeTest v4.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // GeeTest v4 places captcha_id in the URL of its loader script.
  .then(() => page.locator('script[src*="captcha_id="]').first().getAttribute('src'))
  .then((scriptURL) => {
    const captchaId = scriptURL ? new URL(scriptURL).searchParams.get('captcha_id') : null;
    if (!captchaId) throw new Error('GeeTest v4 captcha ID not found.');

    // Build the task from the extracted captcha ID.
    const task = new Tasks.GeeTestProxyless({
      websiteURL,
      version: 4,
      initParameters: { captcha_id: captchaId }
    });

    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Solution submission is site-specific; adapt this step to the target page.
    // Send the complete v4 solution to the demo's verification endpoint.
    return page.evaluate(
      (result) =>
        fetch('/api/v1/captcha-demo/gee-test-v4/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(result)
        })
          // Decode the verification response and preserve its HTTP success flag.
          .then((response) =>
            response
              .json()
              // Return the parsed body together with the HTTP result.
              .then((body) => ({ ok: response.ok, body }))
          ),
      solution
    );
  })
  .then(({ ok, body }) => {
    // Require both a successful HTTP response and explicit acceptance by the demo.
    if (!ok || body.result !== 'success') throw new Error('Demo rejected the GeeTest v4 solution.');
    // Print the successful page verification to the console.
    console.log('Page confirmation: GeeTest v4 solution accepted.');
  })
  // Handle errors raised during browser automation or CAPTCHA solving.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
