import { chromium } from 'playwright';

export async function launchChromium(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("Executable doesn't exist")) throw error;

    console.warn(
      'Playwright Chromium is not installed; using the local Google Chrome installation.'
    );
    return chromium.launch({ ...options, channel: 'chrome' });
  }
}
