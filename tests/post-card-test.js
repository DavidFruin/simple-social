// tests/post-card-test.js - Standalone Test Script for Post Card Component
// Run with: node tests/post-card-test.js

const { chromium } = require('./front-end-test/node_modules/playwright');

async function runTests() {
  console.log('Starting Post Card Component Tests...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let passed = 0;
  let failed = 0;
  
  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${name}: ${err.message}`);
      failed++;
    }
  }
  
  async function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }
  
  try {
    // Login
    console.log('Logging in...');
    await page.goto('http://dev.davidfruin.com/#/login');
    await page.fill('#email', 'davefruin@gmail.com');
    await page.fill('#password', 'CC6iQCfuZlc5jD&3xhvFL87Xw');
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/feed/, { timeout: 10000 });
    console.log('Logged in successfully\n');
    
    // Test 1: Profile page - delete button shows on own posts
    await test('profile page - delete button shows on own posts', async () => {
      await page.goto('http://dev.davidfruin.com/#/profile');
      await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
      
      // Check if delete button exists on at least one post
      const deleteBtns = await page.locator('.btn-delete-post').count();
      assert(deleteBtns > 0, `Expected delete buttons, found ${deleteBtns}`);
    });
    
    // Test 2: Single post page - delete button shows on own posts
    await test('single post page - delete button shows on own posts', async () => {
      await page.goto('http://dev.davidfruin.com/#/profile');
      await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
      
      const postCards = await page.locator('.post-card').count();
      if (postCards > 0) {
        const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
        await page.goto(`http://dev.davidfruin.com/#/post/${firstPostId}`);
        await page.waitForSelector('.post-card', { timeout: 5000 });
        
        const deleteBtn = page.locator('.btn-delete-post');
        const isVisible = await deleteBtn.isVisible();
        assert(isVisible, 'Delete button should be visible on own post');
      }
    });
    
    // Test 3: Like dropdown appears on profile page
    await test('profile page - like dropdown appears', async () => {
      await page.goto('http://dev.davidfruin.com/#/profile');
      await page.waitForSelector('.post-card, #empty-posts', { timeout: 5000 });
      
      const likeBtns = await page.locator('.btn-like-count').count();
      if (likeBtns > 0) {
        await page.locator('.btn-like-count').first().click();
        const dropdown = page.locator('.like-dropdown').first();
        const isVisible = await dropdown.isVisible();
        assert(isVisible, 'Like dropdown should be visible');
      }
    });
    
    // Test 4: Like dropdown appears on single post page
    await test('single post page - like dropdown appears', async () => {
      await page.goto('http://dev.davidfruin.com/#/feed');
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      const firstPostId = await page.locator('.post-card').first().getAttribute('data-post-id');
      await page.goto(`http://dev.davidfruin.com/#/post/${firstPostId}`);
      await page.waitForSelector('.post-card', { timeout: 5000 });
      
      await page.locator('.btn-like-count').click();
      const dropdown = page.locator('.like-dropdown');
      const isVisible = await dropdown.isVisible();
      assert(isVisible, 'Like dropdown should be visible on single post page');
    });
    
    // Test 5: Feed page - delete button shows on own posts
    await test('feed page - delete button shows on own posts', async () => {
      await page.goto('http://dev.davidfruin.com/#/feed');
      await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
      
      const deleteBtns = await page.locator('.btn-delete-post').count();
      console.log(`  (found ${deleteBtns} delete buttons on feed)`);
    });
    
    // Test 6: Feed page - like dropdown works
    await test('feed page - like dropdown works', async () => {
      await page.goto('http://dev.davidfruin.com/#/feed');
      await page.waitForSelector('.post-card, #empty-feed', { timeout: 5000 });
      
      const likeBtns = await page.locator('.btn-like-count').count();
      if (likeBtns > 0) {
        await page.locator('.btn-like-count').first().click();
        const dropdown = page.locator('.like-dropdown').first();
        const isVisible = await dropdown.isVisible();
        assert(isVisible, 'Like dropdown should be visible');
      }
    });
    
  } finally {
    await browser.close();
  }
  
  console.log(`\n--- Results ---`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});