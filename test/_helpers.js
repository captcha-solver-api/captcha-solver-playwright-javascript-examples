import { launchChromium } from '../launch-browser.js';

const activeBrowsers = new Set();
let shutdownHandlersInstalled = false;

export function steps(total) {
  let current = 0;
  return (message) => console.log(`[Step ${++current}/${total}] ${message}`);
}

function installShutdownHandlers() {
  if (shutdownHandlersInstalled) return;
  shutdownHandlersInstalled = true;

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await Promise.allSettled([...activeBrowsers].map((browser) => browser.close()));
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
    });
  }
}

export async function closeBrowser(browser) {
  if (!browser || !activeBrowsers.has(browser)) return;
  activeBrowsers.delete(browser);
  await browser.close().catch(() => {});
}

export async function openBrowser(url, log, { beforeNavigation, contextOptions = {} } = {}) {
  installShutdownHandlers();
  log('Launching Chromium');
  const browser = await launchChromium({
    headless: process.env.HEADLESS?.toLowerCase() === 'true'
  });
  activeBrowsers.add(browser);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...contextOptions
    });
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(60000);
    const page = await context.newPage();
    await beforeNavigation?.({ browser, context, page });
    log(`Opening demo: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { browser, context, page };
  } catch (error) {
    await closeBrowser(browser);
    throw error;
  }
}

export async function closeSuccess(browser, log, { verified = false } = {}) {
  log('Closing browser');
  await closeBrowser(browser);
  console.log(verified ? 'CAPTCHA accepted by the demo page.' : 'Solution received successfully.');
}

export function solutionToken(solution) {
  const token = solution.gRecaptchaResponse ?? solution.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Solver response does not contain a token.');
  }
  return token;
}

export async function withTimeout(promise, timeout, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

export function printParameters(parameters) {
  const printable = { ...parameters };
  for (const key of ['body', 'imgInstructions']) {
    if (typeof printable[key] === 'string')
      printable[key] = `[base64: ${printable[key].length} chars]`;
  }
  console.log('Captcha parameters:');
  console.log(JSON.stringify(printable, null, 2));
}

export function printSolution(solution) {
  console.log('Solution:');
  console.log(JSON.stringify(solution, null, 2));
}
