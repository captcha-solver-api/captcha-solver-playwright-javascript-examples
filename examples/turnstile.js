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
 */

// Read the target URL from .env; replace the example.com placeholder before running.
const websiteURL = process.env.TURNSTILE_TARGET_URL || 'https://example.com/page_with_turnstile';
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
    // Open the configured page containing Turnstile.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // Read the public site key from the Turnstile container.
  .then(() => page.locator('#cf-turnstile').getAttribute('data-sitekey'))
  .then((websiteKey) => {
    if (!websiteKey) throw new Error('Turnstile site key not found.');

    // Build the task from the extracted site key.
    const task = new Tasks.TurnstileProxyless({ websiteURL, websiteKey });
    // Send the task to the service and wait for the solution.
    return client.solve(task);
  })
  .then((solution) => {
    // Print the received solution to the console.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Turnstile forms submit the token through cf-turnstile-response.
    return page.locator('input[name="cf-turnstile-response"]').evaluate((element, token) => {
      element.value = token;
    }, solution.token);
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
