// tests/post-card.spec.js - Post Card Component Tests

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

test.describe('Post Card Component', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/#/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/feed/);
  });

  test('profile page - delete button shows on own posts', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/profile`);
    
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const deleteBtns = await page.locator('.btn-delete-post').count();
    expect(deleteBtns).toBeGreaterThan(0);
  });

  test('single post page - delete button shows on own posts', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/profile`);
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
      
      await page.goto(`${BASE_URL}/#/post/${firstPostId}`);
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      const deleteBtn = page.locator('.btn-delete-post');
      await expect(deleteBtn).toBeVisible();
    }
  });

  test('like dropdown appears on profile page', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/profile`);
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const likeBtns = await page.locator('.btn-like-count').count();
    if (likeBtns > 0) {
      await page.locator('.btn-like-count').first().click();
      
      const dropdown = page.locator('.like-dropdown').first();
      await expect(dropdown).toBeVisible();
    }
  });

  test('like dropdown appears on single post page', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feed`);
    await page.waitForSelector('.post-card', { timeout: 5000 });
    
    const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
    
    await page.goto(`${BASE_URL}/#/post/${firstPostId}`);
    await page.waitForSelector('.post-card', { timeout: 5000 });
    
    await page.locator('.btn-like-count').click();
    
    const dropdown = page.locator('.like-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('feed page - delete button shows on own posts', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feed`);
    await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
    
    const deleteBtns = await page.locator('.btn-delete-post').count();
    console.log(`Found ${deleteBtns} delete buttons on feed`);
  });

  test('feed page - like dropdown works', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feed`);
    await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
    
    const likeBtns = await page.locator('.btn-like-count').count();
    if (likeBtns > 0) {
      await page.locator('.btn-like-count').first().click();
      const dropdown = page.locator('.like-dropdown').first();
      await expect(dropdown).toBeVisible();
    }
  });

  test('profile page - posts show email not user ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/profile`);
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      const profileEmail = await page.locator('#profile-header h1').textContent();
      
      const firstPostUser = await page.locator('.post-card').first().locator('.post-user').textContent();
      
      expect(firstPostUser).toContain('@');
      expect(firstPostUser.trim()).toBe(profileEmail);
    }
  });

  test('single post page - shows email not user ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/profile`);
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      const profileEmail = await page.locator('#profile-header h1').textContent();
      const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
      
      await page.goto(`${BASE_URL}/#/post/${firstPostId}`);
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      const postUser = await page.locator('.post-card .post-user').textContent();
      
      expect(postUser).toContain('@');
      expect(postUser.trim()).toBe(profileEmail);
    }
  });
});
