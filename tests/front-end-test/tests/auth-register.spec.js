// tests/auth-register.spec.js - User Registration Tests
// Test user registration functionality with Playwright

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

test('register - invalid email format shows error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Try to submit with invalid email format
  await page.fill('#email', 'not-an-email');
  await page.click('#email-form button[type="submit"]');
  
  // HTML5 validation should block submission (email type validation)
  await expect(page).toHaveURL(/#\/register/);
});

test('register - empty email shows validation error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Submit without filling email
  await page.click('#email-form button[type="submit"]');
  
  // HTML5 required validation should prevent submission
  await expect(page).toHaveURL(/#\/register/);
});

test('register - already registered email shows error', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Use already registered email - should fail BEFORE trying to send email
  await page.fill('#email', TEST_EMAIL);
  await page.click('#email-form button[type="submit"]');
  
  // Should show error about already registered
  await expect(page.locator('#email-message')).toContainText(/already|exists|registered/i);
});

test('register - can go to login page from register', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Click the login link
  await page.click('a[href="#/login"]');
  
  // Should redirect to login
  await expect(page).toHaveURL(/#\/login/);
});

test('register - register page loads correctly', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Verify page title
  await expect(page.locator('h1')).toContainText('Create Account');
  
  // Verify step-1 is visible
  await expect(page.locator('#step-1')).toBeVisible();
  
  // Verify email input exists
  await expect(page.locator('#email')).toBeVisible();
  
  // Verify submit button exists  
  await expect(page.locator('#email-form button[type="submit"]')).toBeVisible();
});

test('register - steps have proper IDs', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Verify all steps exist in DOM
  await expect(page.locator('#step-1')).toHaveClass(/register-step/);
  await expect(page.locator('#step-2')).toHaveClass(/register-step/);
  await expect(page.locator('#step-3')).toHaveClass(/register-step/);
});

test('register - email form has correct attributes', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/register`);
  
  // Check email input attributes
  const emailInput = page.locator('#email');
  await expect(emailInput).toHaveAttribute('type', 'email');
  await expect(emailInput).toHaveAttribute('required');
  
  // Check password form doesn't exist in step 1
  await expect(page.locator('#password-form')).toBeHidden();
});
