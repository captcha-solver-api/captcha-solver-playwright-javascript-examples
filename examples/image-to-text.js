import { readFileSync } from 'node:fs';

import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';

/**
 * This example shows how to solve an image-to-text CAPTCHA. It reads a local CAPTCHA image,
 * describes the expected answer format, sends the task to the service, and prints the recognized
 * text. It uses Tasks.ImageToText and CaptchaClient.solve().
 */

// Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});
const lettersOnly = 2;

// Load the sample image and describe the expected answer format.
const task = new Tasks.ImageToText({
  body: readFileSync(new URL('../assets/text-captcha.png', import.meta.url)).toString('base64'),
  numeric: lettersOnly,
  minLength: 4,
  maxLength: 6
});

client
  // Send the image-to-text task to the service and wait for the solution.
  .solve(task)
  // Print the recognized text returned in solution.text.
  .then((solution) => {
    console.log(solution.text);
  })
  // Handle errors raised while solving the CAPTCHA.
  .catch(console.error);
