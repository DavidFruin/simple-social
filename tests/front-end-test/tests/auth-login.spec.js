// tests/auth-login.spec.js - Login Authentication Tests

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

test('login - valid credentials redirects to feed', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/login`);
  
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/#\/feed/);
  await expect(page.locator('h1')).toContainText('News Feed');
});

test('login - invalid credentials shows error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/login`);
  
  await page.fill('#email', 'wrong@test.com');
  await page.fill('#password', 'wrongpassword');
  await page.click('button[type="submit"]');
  
  await expect(page.locator('#login-message')).toContainText('Invalid');
});

test('login - empty fields blocked by HTML5 validation', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/login`);
  
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/#\/login/);
});
