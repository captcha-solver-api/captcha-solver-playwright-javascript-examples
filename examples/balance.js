import { CaptchaClient } from '@captcha-solver-api/javascript-sdk';

/**
 * This example shows how to check the current Captcha Solver account balance. It creates an API
 * client, requests the balance without creating a CAPTCHA task, and prints the returned amount.
 * It uses CaptchaClient.getBalance().
 */

// Create the SDK client with the API key from CAPTCHA_API_KEY.
const client = new CaptchaClient({
  clientKey: process.env.CAPTCHA_API_KEY || 'YOUR_API_KEY'
});

client
  // Request the current account balance from the service.
  .getBalance()
  // Print the received balance to the console.
  .then((balance) => {
    console.log(balance);
  })
  // Handle errors raised while requesting the balance.
  .catch(console.error);
