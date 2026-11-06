import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve Tencent CAPTCHA without using a proxy. It opens a page with
 * Tencent CAPTCHA, extracts the app ID, sends the task to the service, and passes the returned
 * solution to the callback registered by the page. It uses Tasks.TencentTaskProxyless and
 * CaptchaClient.solve().
 *
 * To use this example on another page, change the target URL and verify how that page exposes the
 * app ID and registers its result callback. Applying the solution is site-specific, so inspect and
 * debug the target page to determine the correct callback and acceptance check.
 *
 * How it works:
 * STEP-01 - Configure the target, script URL, and SDK client.
 * STEP-02 - Launch Chromium, capture the page callback, and open the target.
 * STEP-03 - Extract the Tencent app ID from the URL or page bundle.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and pass it to the captured callback.
 * STEP-06 - Confirm that the callback receives the solution.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the target settings and create the SDK client.
const websiteURL =
  process.env.TENCENT_TARGET_URL || 'https://example.com/page_with_tencent_captcha';
// Read the CAPTCHA script URL from the local .env file.
const captchaScript = process.env.TENCENT_SCRIPT_URL;
const maximumAppIdSearchDistance = 1500;
const appIdPattern = new RegExp(
  `\\b\\w=["'](?<appId>\\d{6,})["'][^;]{0,${maximumAppIdSearchDistance}}?search,["']appid["']`,
  'i'
);
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

let browser;
let page;

// STEP-02: Launch Chromium, capture the page callback, and open the target.
chromium
  .launch({ headless: process.env.HEADLESS === 'true' })
  .then((instance) => {
    browser = instance;
    // Create a new browser page.
    return browser.newPage();
  })
  .then((openedPage) => {
    page = openedPage;

    // Capture the callback registered by the page before its scripts run.
    return page.addInitScript(() => {
      window.tbs_external ??= {
        nativeCall(method, args) {
          window.__tencentNativeCalls ??= [];
          window.__tencentNativeCalls.push({ method, args });
        }
      };

      Object.defineProperty(window, 'TencentCaptcha', {
        configurable: true,
        set(OriginalTencentCaptcha) {
          function WrappedTencentCaptcha(appId, originalCallback, ...options) {
            const wrappedCallback = (result) => {
              window.__tencentAcceptedResult = result;
              return originalCallback(result);
            };
            window.__tencentCaptchaCallback = wrappedCallback;
            return Reflect.construct(
              OriginalTencentCaptcha,
              [appId, wrappedCallback, ...options],
              new.target
            );
          }
          WrappedTencentCaptcha.prototype = OriginalTencentCaptcha.prototype;
          Object.defineProperty(window, 'TencentCaptcha', {
            configurable: true,
            value: WrappedTencentCaptcha
          });
        }
      });
    });
  })
  .then(() => {
    // Open the configured page containing Tencent CAPTCHA.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // STEP-03: Extract appid from the URL or the demo JavaScript bundle.
  .then(() => {
    const queryAppId = new URL(websiteURL).searchParams.get('appid');
    if (queryAppId) return queryAppId;

    return (
      page
        .locator('script[src*="li_captcha_new"]')
        .first()
        .getAttribute('src')
        .then((bundleURL) => {
          if (!bundleURL) throw new Error('Tencent CAPTCHA bundle not found.');
          // Download the script containing the demo's app ID.
          return page.request.get(new URL(bundleURL, websiteURL).href);
        })
        // Read the downloaded bundle as JavaScript source text.
        .then((response) => {
          if (!response.ok()) throw new Error(`Tencent bundle returned HTTP ${response.status()}.`);
          return response.text();
        })
        // Extract the app ID from the demo's initialization code.
        .then((source) => {
          const appId = source.match(appIdPattern)?.groups?.appId;
          if (!appId) throw new Error('Tencent appId not found.');
          return appId;
        })
    );
  })
  .then((appId) => {
    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.TencentTaskProxyless({
      websiteURL,
      appId,
      captchaScript
    });

    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log the solution and pass it to the captured page callback.
    console.log('Solution:', solution);

    // Token injection and submission are site-specific; adapt this step to the target page.
    // Pass the result through the exact callback registered by the target page.
    return (
      page
        .evaluate((result) => {
          if (typeof window.__tencentCaptchaCallback !== 'function') {
            throw new Error('Tencent callback is not available.');
          }
          window.__tencentCaptchaCallback(result);
        }, solution)
        // Keep the solution available for the acceptance check that follows.
        .then(() => solution)
    );
  })
  // STEP-06: Confirm that the callback received the same ticket and random string.
  // Server-side acceptance requires an additional check specific to your target page.
  .then((solution) =>
    page.waitForFunction(
      ({ ticket, randstr }) =>
        window.__tencentAcceptedResult?.ticket === ticket &&
        window.__tencentAcceptedResult?.randstr === randstr,
      { ticket: solution.ticket, randstr: solution.randstr }
    )
  )
  .then(() => {
    // Print the callback confirmation to the console.
    console.log('Page confirmation: Tencent callback received the solution.');
  })
  // STEP-07: Handle errors and always close Chromium.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
