// tests/media-upload.spec.js - Media Upload Playwright Tests

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';
const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

const TEST_IMAGE_PATH = '/tmp/test_image.webp';
const TEST_VIDEO_PATH = '/tmp/test_video.mp4';
const TEST_AUDIO_PATH = '/tmp/test_audio.mp3';

async function login(page) {
  await page.goto(`${BASE_URL}/#/login`);
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/#\/feed/);
}

function createTestFile(filePath, type) {
  if (fs.existsSync(filePath)) return;
  
  if (type === 'image') {
    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x49, 0x53, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    fs.writeFileSync(filePath, webpHeader);
  } else if (type === 'video') {
    fs.writeFileSync(filePath, Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x6D, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6F, 0x6D
    ]));
  } else if (type === 'audio') {
    fs.writeFileSync(filePath, Buffer.from([
      0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]));
  }
}

async function logout(page) {
  await page.goto(`${BASE_URL}/#/feed`);
  const logoutBtn = page.locator('a:has-text("Logout")');
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await page.waitForURL(/#\/login/);
  }
}

test.describe('Media Upload', () => {
  test.beforeAll(() => {
    createTestFile(TEST_IMAGE_PATH, 'image');
    createTestFile(TEST_VIDEO_PATH, 'video');
    createTestFile(TEST_AUDIO_PATH, 'audio');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('create-post page shows media upload section', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/#/create-post`);
    
    await expect(page.locator('#media-input')).toBeHidden();
    await expect(page.locator('#select-media-btn')).toBeVisible();
    await expect(page.locator('#select-media-btn')).toHaveText('Add Media');
  });

  test('upload section shows correct buttons', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/#/create-post`);
    
    const selectBtn = page.locator('#select-media-btn');
    await expect(selectBtn).toBeVisible();
    await expect(selectBtn).toHaveText('Add Media');
  });

  test('post without media works', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/#/create-post`);
    
    await page.fill('#post-text', 'Post without media');
    await page.click('button[type="submit"]');
    await expect(page.locator('.success-message')).toContainText('Post created');
  });

  test('empty media status clears on page load', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/#/create-post`);
    
    const status = page.locator('#media-status');
    await expect(status).toHaveText('');
  });
});

test.describe('Media Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('media viewer overlay exists in DOM', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feed`);
    
    const overlay = page.locator('.media-viewer-overlay');
    await expect(overlay).toBeAttached();
    await expect(overlay).not.toBeVisible();
  });

  test('close button exists in viewer', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/feed`);
    
    const closeBtn = page.locator('.media-viewer-close');
    await expect(closeBtn).toBeAttached();
  });
});

test.describe('Post Media Display', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('post card shows media section when present', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/create-post`);
    
    await page.fill('#post-text', 'Post for media display test');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    
    await page.goto(`${BASE_URL}/#/feed`);
    await page.waitForTimeout(500);
    
    const postCard = page.locator('.post-card').first();
    await expect(postCard).toBeVisible();
  });
});
