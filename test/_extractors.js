export function parseTencentAppId(source) {
  const match = source.match(/\b\w=["'](\d{6,})["'][^;]{0,1500}?search,["']appid["']/i);
  return match?.[1] ?? null;
}

export async function extractTencentParameters(page, websiteURL) {
  const queryAppId = new URL(websiteURL).searchParams.get('appid');
  if (queryAppId) return { appId: queryAppId };

  const bundleURL = await page.locator('script[src*="li_captcha_new"]').first().getAttribute('src');
  if (!bundleURL) throw new Error('Tencent CAPTCHA bundle was not found.');

  const response = await page.request.get(new URL(bundleURL, websiteURL).href);
  if (!response.ok()) {
    throw new Error(`Tencent CAPTCHA bundle returned HTTP ${response.status()}.`);
  }

  const appId = parseTencentAppId(await response.text());
  if (!appId) throw new Error('Tencent appId was not found in the CAPTCHA bundle.');
  return { appId };
}

export async function installTencentInterceptor(page) {
  await page.addInitScript(() => {
    // The public demo normally runs inside a mobile WebView. Capture its native bridge calls in a
    // regular browser so the example can verify that the page forwarded the CAPTCHA result.
    window.tbs_external ??= {
      nativeCall(method, args) {
        window.__tencentNativeCalls ??= [];
        window.__tencentNativeCalls.push({ method, args });
      }
    };

    Object.defineProperty(window, 'TencentCaptcha', {
      configurable: true,
      set(OriginalTencentCaptcha) {
        function WrappedTencentCaptcha(...args) {
          const originalCallback = args[1];
          args[1] = (result) => {
            window.__tencentAcceptedResult = result;
            return originalCallback(result);
          };
          window.__tencentCaptchaCallback = args[1];
          return Reflect.construct(OriginalTencentCaptcha, args, new.target);
        }

        Object.setPrototypeOf(WrappedTencentCaptcha, OriginalTencentCaptcha);
        WrappedTencentCaptcha.prototype = OriginalTencentCaptcha.prototype;
        Object.defineProperty(window, 'TencentCaptcha', {
          configurable: true,
          writable: true,
          value: WrappedTencentCaptcha
        });
      }
    });
  });
}

export function patchTurnstileApi(source) {
  let replacements = 0;
  const patched = source.replace(/window\.turnstile=([A-Za-z_$][\w$]*)/g, (_match, value) => {
    replacements += 1;
    return `window.turnstile=${value},window.__wrapTurnstile?.(window.turnstile)`;
  });

  if (replacements === 0) throw new Error('Turnstile API initialization was not found.');
  return patched;
}

export async function installTurnstileInterceptor(page, captureParameters, injectScript) {
  await page.exposeFunction('__captureTurnstile', captureParameters);
  await page.addInitScript({ content: injectScript });
  await page.route('**/turnstile/**/api.js*', async (route) => {
    const response = await route.fetch();
    const body = patchTurnstileApi(await response.text());
    await route.fulfill({ response, body });
  });
}

export async function installGeeTestV3Interceptor(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'initGeetest', {
      configurable: true,
      get() {
        return undefined;
      },
      set(originalInitGeetest) {
        Object.defineProperty(window, 'initGeetest', {
          configurable: true,
          writable: true,
          value: (config, callback) => {
            window.__freshGeeTestConfig = config;
            window.__originalInitGeetest = originalInitGeetest;
            window.__originalGeeTestCallback = callback;
          }
        });
      }
    });
  });
}

export async function readGeeTestV3Config(page) {
  return page
    .waitForFunction(() => window.__freshGeeTestConfig ?? null)
    .then((handle) => handle.jsonValue());
}
