// tests/create-post.spec.js - Create Post Tests

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

async function login(page) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
}

test('create-post - page loads', async ({ page }) => {
  await login(page);
  
  await page.goto(`${BASE_URL}/#/create-post`);
  await expect(page.locator('h1')).toContainText('Create Post');
  await expect(page.locator('#post-text')).toBeVisible();
});

test('create-post - char counter updates', async ({ page }) => {
  await login(page);
  
  await page.goto(`${BASE_URL}/#/create-post`);
  await page.fill('#post-text', 'Hello world');
  await expect(page.locator('#char-count')).toContainText('11/5000');
});

test('create-post - empty post error', async ({ page }) => {
  await login(page);
  
  await page.goto(`${BASE_URL}/#/create-post`);
  await page.click('button[type="submit"]');
  await expect(page.locator('.error-message')).toContainText('Please enter');
});

test('create-post - success stays on page', async ({ page }) => {
  await login(page);
  
  await page.goto(`${BASE_URL}/#/create-post`);
  await page.fill('#post-text', 'Playwright test post');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success-message')).toContainText('Post created');
  await expect(page.locator('#post-text')).toHaveValue('');
});

test('feed - no composer', async ({ page }) => {
  await login(page);
  
  await expect(page.locator('h1')).toContainText('News Feed');
  await expect(page.locator('.composer')).not.toBeVisible();
});
