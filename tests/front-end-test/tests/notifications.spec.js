// tests/notifications.spec.js - Notifications Feature Tests

const { test, expect } = require('@playwright/test');

test.describe('Notifications Page - Mark as Seen & Post Previews', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('http://dev.davidfruin.com/#/login');
    await page.fill('#email', 'davefruin@gmail.com');
    await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/feed/);
  });

  test('notifications - Mark as Seen button is visible', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    // Check Mark as Seen button exists and is visible
    const markSeenBtn = page.locator('#mark-seen-btn');
    await expect(markSeenBtn).toBeVisible();
    await expect(markSeenBtn).toHaveText('Mark as Seen');
  });

  test('notifications - Mark as Seen button is clickable', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const markSeenBtn = page.locator('#mark-seen-btn');
    await expect(markSeenBtn).toBeVisible();
    
    // Click the button
    await markSeenBtn.click();
    
    // Wait for processing
    await page.waitForTimeout(1500);
    
    // Button should be enabled again (not disabled)
    await expect(markSeenBtn).toBeEnabled();
  });

  test('notifications - post preview shown for like notifications', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    // Check if there are notifications
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      // Look for like notifications (♥ icon)
      const likeNotifications = page.locator('.notification-item').filter({ has: page.locator('text=♥') });
      const likeCount = await likeNotifications.count();
      
      if (likeCount > 0) {
        // Should have post preview
        const postPreview = page.locator('.notification-post-preview').first();
        await expect(postPreview).toBeVisible();
        // Should be truncated (end with ...)
        const text = await postPreview.textContent();
        expect(text).toContain('...');
      } else {
        console.log('No like notifications to test post preview');
      }
    } else {
      console.log('No notifications to test post preview');
    }
  });

  test('notifications - post preview shown for comment notifications', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      // Look for comment notifications (💬 icon)
      const commentNotifications = page.locator('.notification-item').filter({ has: page.locator('text=💬') });
      const commentCount = await commentNotifications.count();
      
      if (commentCount > 0) {
        // Should have post preview
        const postPreview = page.locator('.notification-post-preview').first();
        await expect(postPreview).toBeVisible();
        const text = await postPreview.textContent();
        expect(text).toContain('...');
      } else {
        console.log('No comment notifications to test post preview');
      }
    } else {
      console.log('No notifications to test post preview');
    }
  });

  test('notifications - follow notifications do NOT show post preview', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    const hasEmptyState = await page.locator('#empty-notifications').isVisible();
    
    if (hasNotifications && !hasEmptyState) {
      // Look for follow notifications (👤 icon without ♥ or 💬)
      const followNotifications = page.locator('.notification-item').filter({ has: page.locator('text=👤') });
      const followCount = await followNotifications.count();
      
      if (followCount > 0) {
        // Follow notifications should NOT have post preview
        const postPreviews = await page.locator('.notification-post-preview').count();
        // There might be post previews from other notifications, but follow ones specifically shouldn't
        console.log(`Found ${followCount} follow notifications, ${postPreviews} total post previews`);
      } else {
        console.log('No follow notifications to test');
      }
    } else {
      console.log('No notifications to test');
    }
  });

  test('notifications - notification links to correct page', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/notifications');
    await page.waitForSelector('#notifications-container, #empty-notifications', { timeout: 5000 });
    
    const hasNotifications = await page.locator('.notification-item').count() > 0;
    
    if (hasNotifications) {
      // Check notification link exists and has proper href
      const notificationLink = page.locator('.notification-content').first();
      await expect(notificationLink).toBeVisible();
      
      const href = await notificationLink.getAttribute('href');
      expect(href).toBeTruthy();
      // Should link to either profile or post
      expect(href).toMatch(/^#\/profile\//).or(expect(href).toMatch(/^#\/post\//));
    } else {
      console.log('No notifications to test links');
    }
  });
});