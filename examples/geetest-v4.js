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
 *
 * How it works:
 * STEP-01 - Configure the target, timeout, and SDK client.
 * STEP-02 - Launch Chromium and open the target page.
 * STEP-03 - Extract the GeeTest captcha ID from the loader script.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log and submit the solution to the verification endpoint.
 * STEP-06 - Verify that the endpoint accepts the solution.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target and timeout, then create the SDK client.
const websiteURL = process.env.GEETEST_V4_TARGET_URL || 'https://example.com/page_with_geetest_v4';
const solverTimeout = 300_000;
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
    // Create a new browser page.
    return browser.newPage();
  })
  .then((openedPage) => {
    page = openedPage;
    // Open the configured page containing GeeTest v4.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // STEP-03: Extract captcha_id from the GeeTest v4 loader script URL.
  .then(() => page.locator('script[src*="captcha_id="]').first().getAttribute('src'))
  .then((scriptURL) => {
    const captchaId = scriptURL ? new URL(scriptURL).searchParams.get('captcha_id') : null;
    if (!captchaId) throw new Error('GeeTest v4 captcha ID not found.');

    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.GeeTestProxyless({
      websiteURL,
      version: 4,
      initParameters: { captcha_id: captchaId }
    });

    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log and submit the solution to the verification endpoint.
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
    // STEP-06: Require successful HTTP and application-level acceptance.
    if (!ok || body.result !== 'success') throw new Error('Demo rejected the GeeTest v4 solution.');
    // Print the successful page verification to the console.
    console.log('Page confirmation: GeeTest v4 solution accepted.');
  })
  // STEP-07: Handle errors and always close Chromium.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
