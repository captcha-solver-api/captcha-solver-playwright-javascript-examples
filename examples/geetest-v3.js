import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve GeeTest v3 without using a proxy. It opens the page, captures a
 * fresh gt/challenge pair, sends the task to the service, and submits the returned solution to the
 * demo verification endpoint. It uses Tasks.GeeTestProxyless and CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and verify how that page provides the
 * gt and challenge values. GeeTest solution fields, submission, and success indicators are
 * site-specific, so inspect and debug the target page before applying the solution.
 */

// Read the target URL from .env; replace the example.com placeholder before running.
const websiteURL = process.env.GEETEST_V3_TARGET_URL || 'https://example.com/page_with_geetest_v3';
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

    // Install the interceptor before navigation so the page cannot call initGeetest first.
    return page.addInitScript(() => {
      Object.defineProperty(window, 'initGeetest', {
        configurable: true,
        set(originalInitGeetest) {
          Object.defineProperty(window, 'initGeetest', {
            configurable: true,
            value: (config, callback) => {
              window.__geetestConfig = config;
              window.__originalInitGeetest = originalInitGeetest;
              window.__originalGeeTestCallback = callback;
            }
          });
        }
      });
    });
  })
  .then(() => {
    // Open the configured page containing GeeTest v3.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // GeeTest v3 generates a fresh gt/challenge pair for every page load.
  .then(() => page.waitForFunction(() => window.__geetestConfig ?? null))
  // Convert the captured browser value into task parameters in Node.js.
  .then((handle) => handle.jsonValue())
  .then((config) => {
    // Build the task from the captured parameters.
    const task = new Tasks.GeeTestProxyless({
      websiteURL,
      gt: config.gt,
      challenge: config.challenge,
      geetestApiServerSubdomain: config.api_server || 'api.geetest.com'
    });

    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Solution submission is site-specific; adapt this step to the target page.
    // This public demo verifies the three GeeTest v3 values through its own endpoint.
    return page.evaluate(
      (result) =>
        fetch('/api/v1/captcha-demo/gee-test/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            geetest_challenge: result.challenge,
            geetest_validate: result.validate,
            geetest_seccode: result.seccode
          })
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
    if (!ok || body.success !== true) throw new Error('Demo rejected the GeeTest v3 solution.');
    // Print the successful page verification to the console.
    console.log('Page confirmation: GeeTest v3 solution accepted.');
  })
  // Handle errors raised during browser automation or CAPTCHA solving.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
