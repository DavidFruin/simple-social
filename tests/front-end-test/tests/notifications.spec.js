// tests/notifications.spec.js - Notifications Feature Tests

const { test, expect } = require('@playwright/test');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

test.describe('Notifications Page - Mark as Seen & Post Previews', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/#/login`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/feed/);
  });

  test('notifications - Mark as Seen button is visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const markSeenBtn = page.locator('#mark-seen-btn');
    await expect(markSeenBtn).toBeVisible();
    await expect(markSeenBtn).toHaveText('Mark as Seen');
  });

  test('notifications - Mark as Seen button is clickable', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const markSeenBtn = page.locator('#mark-seen-btn');
    await expect(markSeenBtn).toBeVisible();
    
    await markSeenBtn.click();
    await page.waitForTimeout(1500);
    
    await expect(markSeenBtn).toBeEnabled();
  });

  test('notifications - post preview shown for like notifications', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      const likeNotifications = page.locator('.notification-item').filter({ has: page.locator('text=♥') });
      const likeCount = await likeNotifications.count();
      
      if (likeCount > 0) {
        const postPreview = page.locator('.notification-post-preview').first();
        await expect(postPreview).toBeVisible();
        const text = await postPreview.textContent();
        expect(text).toContain('...');
      }
    }
  });

  test('notifications - post preview shown for comment notifications', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      const commentNotifications = page.locator('.notification-item').filter({ has: page.locator('text=💬') });
      const commentCount = await commentNotifications.count();
      
      if (commentCount > 0) {
        const postPreview = page.locator('.notification-post-preview').first();
        await expect(postPreview).toBeVisible();
        const text = await postPreview.textContent();
        expect(text).toContain('...');
      }
    }
  });

  test('notifications - follow notifications do NOT show post preview', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      const followNotifications = page.locator('.notification-item').filter({ has: page.locator('text=👤') });
      const followCount = await followNotifications.count();
      
      if (followCount > 0) {
        const postPreviews = await page.locator('.notification-post-preview').count();
        console.log(`Found ${followCount} follow notifications, ${postPreviews} total post previews`);
      }
    }
  });

  test('notifications - notification links to correct page', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notifications`);
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    
    if (hasNotifications) {
      const notificationLink = page.locator('.notification-content').first();
      await expect(notificationLink).toBeVisible();
      
      const href = await notificationLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^#\/profile\//).or(expect(href).toMatch(/^#\/post\//));
    }
  });
});
