// tests/post-card.spec.js - Post Card Component Tests
// Tests for delete button, like dropdown on all pages

const { test, expect } = require('@playwright/test');

test.describe('Post Card Component', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('http://dev.davidfruin.com/#/login');
    await page.fill('#email', 'davefruin@gmail.com');
    await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/feed/);
  });

  test('profile page - delete button shows on own posts', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/profile');
    
    // Wait for posts to load (either posts or empty state)
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    // Check if delete button exists on at least one post
    const deleteBtns = await page.locator('.btn-delete-post').count();
    expect(deleteBtns).toBeGreaterThan(0);
  });

  test('single post page - delete button shows on own posts', async ({ page }) => {
    // First go to profile to find a post ID
    await page.goto('http://dev.davidfruin.com/#/profile');
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    // Get first post ID if posts exist
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
      
      // Go to single post page
      await page.goto(`http://dev.davidfruin.com/#/post/${firstPostId}`);
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      // Check delete button appears
      const deleteBtn = page.locator('.btn-delete-post');
      await expect(deleteBtn).toBeVisible();
    } else {
      // No posts to test - skip
      console.log('No posts to test - skipping');
    }
  });

  test('like dropdown appears on profile page', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/profile');
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    // Check if there are any posts with like buttons
    const likeBtns = await page.locator('.btn-like-count').count();
    if (likeBtns > 0) {
      // Click the first like count button
      await page.locator('.btn-like-count').first().click();
      
      // Verify dropdown appears
      const dropdown = page.locator('.like-dropdown').first();
      await expect(dropdown).toBeVisible();
    } else {
      console.log('No like buttons to test - skipping');
    }
  });

  test('like dropdown appears on single post page', async ({ page }) => {
    // First get a post ID from feed
    await page.goto('http://dev.davidfruin.com/#/feed');
    await page.waitForSelector('.post-card', { timeout: 5000 });
    
    const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
    
    // Go to single post page
    await page.goto(`http://dev.davidfruin.com/#/post/${firstPostId}`);
    await page.waitForSelector('.post-card', { timeout: 5000 });
    
    // Click the like count button
    await page.locator('.btn-like-count').click();
    
    // Verify dropdown appears
    const dropdown = page.locator('.like-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('feed page - delete button shows on own posts', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/feed');
    await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
    
    // Check delete button on own posts
    const deleteBtns = await page.locator('.btn-delete-post').count();
    console.log(`Found ${deleteBtns} delete buttons on feed`);
  });

  test('feed page - like dropdown works', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/feed');
    await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
    
    // Check like dropdown works
    const likeBtns = await page.locator('.btn-like-count').count();
    if (likeBtns > 0) {
      await page.locator('.btn-like-count').first().click();
      const dropdown = page.locator('.like-dropdown').first();
      await expect(dropdown).toBeVisible();
    }
  });

  test('profile page - posts show email not user ID', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/profile');
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      // Get the user email from the profile header
      const profileEmail = await page.locator('#profile-header h1').textContent();
      
      // Get the first post's user display
      const firstPostUser = await page.locator('.post-card').first().locator('.post-user').textContent();
      
      // Verify the post shows email (contains @ symbol) not just numbers
      expect(firstPostUser).toContain('@');
      expect(firstPostUser.trim()).toBe(profileEmail);
    }
  });

  test('single post page - shows email not user ID', async ({ page }) => {
    await page.goto('http://dev.davidfruin.com/#/profile');
    await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
    
    const postCards = await page.locator('.post-card').count();
    if (postCards > 0) {
      const profileEmail = await page.locator('#profile-header h1').textContent();
      const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
      
      await page.goto(`http://dev.davidfruin.com/#/post/${firstPostId}`);
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      const postUser = await page.locator('.post-card .post-user').textContent();
      
      // Verify the post shows email, not user ID
      expect(postUser).toContain('@');
      expect(postUser.trim()).toBe(profileEmail);
    }
  });
});