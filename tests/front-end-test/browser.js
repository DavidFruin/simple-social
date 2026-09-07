// browser.js - Browser Setup Helpers
const { chromium } = require('playwright');

/**
 * Launch a new browser instance
 * @returns {Promise<Browser>}
 */
async function launchBrowser() {
  return await chromium.launch({ headless: true });
}

/**
 * Create a new page context
 * @param {Browser} browser 
 * @returns {Promise<Page>}
 */
async function newPage(browser) {
  const context = await browser.newContext();
  return await context.newPage();
}

/**
 * Navigate to a specific hash route
 * @param {Page} page 
 * @param {string} hash - e.g., '/login', '/feed'
 */
async function navigateTo(page, hash) {
  await page.goto(`http://dev.davidfruin.com/#${hash}`);
}

/**
 * Wait for an element to be visible
 * @param {Page} page 
 * @param {string} selector
 * @param {number} timeout
 */
async function waitForSelector(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { timeout, state: 'visible' });
}

/**
 * Get text content of an element
 * @param {Page} page 
 * @param {string} selector
 */
async function getText(page, selector) {
  return await page.textContent(selector);
}

/**
 * Click an element
 * @param {Page} page 
 * @param {string} selector
 */
async function click(page, selector) {
  await page.click(selector);
}

/**
 * Fill an input field
 * @param {Page} page 
 * @param {string} selector
 * @param {string} value
 */
async function fill(page, selector, value) {
  await page.fill(selector, value);
}

/**
 * Check if element is visible
 * @param {Page} page 
 * @param {string} selector
 */
async function isVisible(page, selector) {
  return await page.isVisible(selector);
}

/**
 * Get current URL hash
 * @param {Page} page 
 */
async function getCurrentHash(page) {
  return await page.evaluate(() => window.location.hash);
}

module.exports = {
  launchBrowser,
  newPage,
  navigateTo,
  waitForSelector,
  getText,
  click,
  fill,
  isVisible,
  getCurrentHash,
};
