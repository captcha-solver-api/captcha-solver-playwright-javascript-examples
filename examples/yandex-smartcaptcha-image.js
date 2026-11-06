import { readFileSync } from 'node:fs';

import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';

/**
 * This example shows how to solve the image-selection stage of Yandex SmartCaptcha. It reads the
 * challenge and instruction images, sends them to the service as a coordinate task, and prints
 * the returned click coordinates. It uses Tasks.CoordinatesTask and CaptchaClient.solve().
 */

// Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

// Yandex image challenges use a main image plus a separate instruction image.
const task = new Tasks.CoordinatesTask({
  body: readFileSync(new URL('../assets/yandex-smartcaptcha-main.png', import.meta.url)).toString(
    'base64'
  ),
  imgInstructions: readFileSync(
    new URL('../assets/yandex-smartcaptcha-task.png', import.meta.url)
  ).toString('base64'),
  comment: 'Select objects in the order shown in the instruction image'
});

client
  // Send the coordinate task to the service and wait for the solution.
  .solve(task)
  // Print the received click coordinates to the console.
  .then((solution) => {
    console.log(solution.coordinates);
    // Use browser automation to click the challenge image at each returned x/y coordinate.
  })
  // Handle errors raised while solving the CAPTCHA.
  .catch(console.error);
