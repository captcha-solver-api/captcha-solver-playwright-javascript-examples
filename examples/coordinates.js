import { readFileSync } from 'node:fs';

import { CaptchaClient, Tasks } from '@captcha-solver-api/javascript-sdk';

/**
 * This example shows how to solve a coordinate CAPTCHA. It reads a local image, adds an
 * instruction describing which objects to select, sends the task to the service, and prints the
 * returned click coordinates. It uses Tasks.CoordinatesTask and CaptchaClient.solve().
 */

// Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

// The API expects the image as a base64 string without a data-URL prefix.
const task = new Tasks.CoordinatesTask({
  body: readFileSync(new URL('../assets/coordinates-captcha.png', import.meta.url)).toString(
    'base64'
  ),
  comment: 'Click on all squares with street signs'
});

client
  // Send the coordinate task to the service and wait for the solution.
  .solve(task)
  // Print the received click coordinates to the console.
  .then((solution) => {
    console.log(solution.coordinates);
    // Use browser automation to click the target image at each returned x/y coordinate.
  })
  // Handle errors raised while solving the CAPTCHA.
  .catch(console.error);
