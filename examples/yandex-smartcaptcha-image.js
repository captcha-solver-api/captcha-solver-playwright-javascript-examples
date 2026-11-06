import { readFileSync } from 'node:fs';

import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';

/**
 * This example shows how to solve the image-selection stage of Yandex SmartCaptcha. It reads the
 * challenge and instruction images, sends them to the service as a coordinate task, and prints
 * the returned click coordinates. It uses Tasks.CoordinatesTask and CaptchaClient.solve().
 *
 * How it works:
 * STEP-01 - Create the SDK client.
 * STEP-02 - Read both images and create the coordinate task.
 * STEP-03 - Send the task and wait for the solver result.
 * STEP-04 - Print the click coordinates or report an error.
 */

// STEP-01: Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

// STEP-02: Read the challenge and instruction images, then create the coordinate task.
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
  // STEP-03: Send the coordinate task and wait for the solver result.
  .solve(task)
  .then((solution) => {
    // STEP-04: Print the received click coordinates to the console.
    console.log(solution.coordinates);
    // Use browser automation to click the challenge image at each returned x/y coordinate.
  })
  // STEP-04: Report errors raised while solving the CAPTCHA.
  .catch(console.error);
