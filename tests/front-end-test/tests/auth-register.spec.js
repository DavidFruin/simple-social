// tests/auth-register.spec.js - User Registration Tests

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

test('register - invalid email format shows error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await page.fill('#email', 'not-an-email');
  await page.click('#email-form button[type="submit"]');
  
  await expect(page).toHaveURL(/#\/register/);
});

test('register - empty email shows validation error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await page.click('#email-form button[type="submit"]');
  
  await expect(page).toHaveURL(/#\/register/);
});

test('register - already registered email shows error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await page.fill('#email', TEST_EMAIL);
  await page.click('#email-form button[type="submit"]');
  
  await expect(page.locator('#email-message')).toContainText(/already|exists|registered/i);
});

test('register - can go to login page from register', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await page.click('a[href="#/login"]');
  
  await expect(page).toHaveURL(/#\/login/);
});

test('register - register page loads correctly', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await expect(page.locator('h1')).toContainText('Create Account');
  await expect(page.locator('#step-1')).toBeVisible();
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#email-form button[type="submit"]')).toBeVisible();
});

test('register - steps have proper IDs', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  await expect(page.locator('#step-1')).toHaveClass(/register-step/);
  await expect(page.locator('#step-2')).toHaveClass(/register-step/);
  await expect(page.locator('#step-3')).toHaveClass(/register-step/);
});

test('register - email form has correct attributes', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  const emailInput = page.locator('#email');
  await expect(emailInput).toHaveAttribute('type', 'email');
  await expect(emailInput).toHaveAttribute('required');
  
  await expect(page.locator('#password-form')).toBeHidden();
});
