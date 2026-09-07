// tests/create-post.spec.js - Create Post Tests

const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
}

test('create-post - page loads', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
  
  await page.goto('http://dev.davidfruin.com/#/create-post');
  await expect(page.locator('h1')).toContainText('Create Post');
  await expect(page.locator('#post-text')).toBeVisible();
});

test('create-post - char counter updates', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
  
  await page.goto('http://dev.davidfruin.com/#/create-post');
  await page.fill('#post-text', 'Hello world');
  await expect(page.locator('#char-count')).toContainText('11/5000');
});

test('create-post - empty post error', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
  
  await page.goto('http://dev.davidfruin.com/#/create-post');
  await page.click('button[type="submit"]');
  await expect(page.locator('.error-message')).toContainText('Please enter');
});

test('create-post - success stays on page', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
  
  await page.goto('http://dev.davidfruin.com/#/create-post');
  await page.fill('#post-text', 'Playwright test post');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success-message')).toContainText('Post created');
  await expect(page.locator('#post-text')).toHaveValue('');
});

test('feed - no composer', async ({ page }) => {
  await page.goto('http://dev.davidfruin.com/#/login');
  await page.fill('#email', 'davefruin@gmail.com');
  await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
  
  await expect(page.locator('h1')).toContainText('News Feed');
  await expect(page.locator('.composer')).not.toBeVisible();
});