// tests/auth-login.spec.js - Login Authentication Tests
// Test user login functionality

// Test cases:
// 1. Login with valid credentials redirects to feed
// 2. Login with invalid credentials shows error message
// 3. Login with empty fields shows validation error

const { test, expect } = require('@playwright/test');

test('login - valid credentials redirects to feed', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/#\/feed/);
  await expect(page.locator('h1')).toContainText('News Feed');
});

test('login - invalid credentials shows error', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  
  await page.fill('#email', 'wrong@test.com');
  await page.fill('#password', 'wrongpassword');
  await page.click('button[type="submit"]');
  
  await expect(page.locator('#login-message')).toContainText('Invalid');
});

test('login - empty fields blocked by HTML5 validation', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  
  // Try to submit empty form
  await page.click('button[type="submit"]');
  
  // Verify we're still on login page - form didn't submit due to HTML5 validation
  await expect(page).toHaveURL(/#\/login/);
});