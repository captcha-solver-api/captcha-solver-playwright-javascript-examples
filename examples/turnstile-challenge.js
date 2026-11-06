import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';
import { chromium } from 'playwright';

/**
 * This example shows how to solve a Cloudflare Turnstile Challenge without using a proxy. It
 * intercepts the challenge parameters while the page loads, sends them to the service, passes the
 * returned token to the original page callback, and verifies that a fresh clearance cookie was
 * issued. It uses Tasks.TurnstileProxyless and CaptchaClient.solve().
 *
 * To use this example on another challenge page, change the target URL and verify the interception
 * logic, User-Agent, and clearance requirements. Challenge callbacks and navigation behavior are
 * site-specific, so inspect and debug the page before adapting the token application step.
 *
 * How it works:
 * STEP-01 - Configure the target, User-Agent, timeouts, and SDK client.
 * STEP-02 - Launch Chromium and install the parameter interception hooks.
 * STEP-03 - Open the target and capture its challenge parameters.
 * STEP-04 - Create the task and wait for the solver result.
 * STEP-05 - Log the solution and pass its token to the page callback.
 * STEP-06 - Verify successful navigation and a fresh clearance cookie.
 * STEP-07 - Handle errors and close Chromium.
 */

// STEP-01: Read the settings and create the SDK client.
const websiteURL =
  process.env.TURNSTILE_CHALLENGE_TARGET_URL || 'https://example.com/page_with_turnstile_challenge';
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});
const challengeUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const parameterCaptureTimeout = 30_000;
const challengeNavigationTimeout = 60_000;

let browser;
let page;
let previousClearance;
let parameterCaptureTimer;
let resolveParameters;
// Resolve this promise when the page forwards its intercepted challenge parameters.
const parametersPromise = new Promise((resolve) => {
  resolveParameters = resolve;
});

// STEP-02: Launch Chromium and install the parameter interception hooks.
chromium
  .launch({ headless: process.env.HEADLESS === 'true' })
  .then((instance) => {
    browser = instance;

    // Challenge tokens are tied to the browser User-Agent sent to the solver.
    return browser.newContext({ userAgent: challengeUserAgent });
  })
  .then((context) => {
    // Create a new browser page in the context with the matching User-Agent.
    return context.newPage();
  })
  .then((openedPage) => {
    page = openedPage;
    // Expose a bridge that lets the browser send captured parameters to Node.js.
    return page.exposeFunction('__captureTurnstile', resolveParameters);
  })
  .then(() =>
    // Wrap turnstile.render before the challenge script runs to capture dynamic parameters.
    page.addInitScript(() => {
      window.__wrapTurnstile = (turnstile) => {
        if (!turnstile || turnstile.__captchaSolverIntercepted) return;
        const originalRender = turnstile.render;
        turnstile.render = function (container, options) {
          window.cfCallback = options.callback;
          window.__captureTurnstile({
            websiteKey: options.sitekey,
            websiteURL: window.location.href,
            data: options.cData,
            pagedata: options.chlPageData,
            action: options.action,
            userAgent: navigator.userAgent
          });
          return originalRender.call(this, container, options);
        };
        turnstile.__captchaSolverIntercepted = true;
      };
    })
  )
  .then(() =>
    // Patch the downloaded API script at the moment it assigns window.turnstile.
    page.route('**/turnstile/**/api.js*', (route) =>
      route
        // Download the original Turnstile API script.
        .fetch()
        .then((response) =>
          response
            // Read the script so its initialization can be intercepted.
            .text()
            .then((source) => {
              const body = source.replace(
                /window\.turnstile=(?<turnstileObject>[A-Za-z_$][\w$]*)/g,
                'window.turnstile=$<turnstileObject>,window.__wrapTurnstile?.(window.turnstile)'
              );
              if (body === source) throw new Error('Turnstile initialization was not found.');
              // Deliver the patched script to the browser.
              return route.fulfill({ response, body });
            })
        )
    )
  )
  .then(() => {
    // STEP-03: Open the target page and start its Turnstile Challenge.
    return page.goto(websiteURL, { waitUntil: 'domcontentloaded' });
  })
  // STEP-03: Wait for captured parameters, failing if the page does not provide them in time.
  .then(() =>
    Promise.race([
      parametersPromise,
      new Promise((_, reject) => {
        parameterCaptureTimer = setTimeout(
          () => reject(new Error('Turnstile parameters were not captured.')),
          parameterCaptureTimeout
        );
      })
    ])
      // Cancel the capture timer as soon as parameters arrive or capture fails.
      .finally(() => clearTimeout(parameterCaptureTimer))
  )
  .then((parameters) => {
    // Print the captured parameters before creating the task.
    console.log('Captured parameters:', parameters);
    // STEP-04: Build the task and wait for the solver result.
    const task = new Tasks.TurnstileProxyless(parameters);
    return client.solve(task);
  })
  .then((solution) => {
    // STEP-05: Log the solution before passing its token to the page callback.
    console.log('Solution:', solution);

    // Remember the old cookie: only a fresh cf_clearance proves that the challenge was cleared.
    return page
      .context()
      .cookies(websiteURL)
      .then((cookies) => {
        previousClearance = cookies.find((cookie) => cookie.name === 'cf_clearance')?.value;
        return solution;
      });
  })
  // STEP-05: Pass the token to the callback and wait for challenge navigation.
  .then((solution) =>
    Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().isNavigationRequest() && response.frame() === page.mainFrame(),
        { timeout: challengeNavigationTimeout }
      ),
      // Token injection and submission are site-specific; adapt this step to the target page.
      // Call the original callback with the token returned by the SDK.
      page.evaluate((token) => {
        if (typeof window.cfCallback !== 'function') {
          throw new Error('Turnstile callback is not available.');
        }
        window.cfCallback(token);
      }, solution.token)
    ])
  )
  .then(([response]) => {
    // STEP-06: Verify navigation before reading the updated clearance cookie.
    if (!response.ok()) throw new Error(`Challenge returned HTTP ${response.status()}.`);
    return page.context().cookies(websiteURL);
  })
  .then((cookies) => {
    // STEP-06: Require a fresh cookie instead of accepting old clearance.
    const clearance = cookies.find((cookie) => cookie.name === 'cf_clearance')?.value;
    if (!clearance || clearance === previousClearance) {
      throw new Error('The page did not issue a fresh cf_clearance cookie.');
    }
    // Print the successful challenge verification to the console.
    console.log('Page confirmation: challenge cleared and target page loaded.');
  })
  // STEP-07: Handle errors and always close Chromium.
  .catch(console.error)
  .finally(() => {
    // Always close the browser after the example finishes.
    return browser?.close();
  });
