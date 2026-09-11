// browser.js - Browser Setup Helpers
const { chromium } = require('playwright');

const BASE_URL = process.env.TEST_BASE_URL || 'https://dev.davidfruin.com';

async function launchBrowser() {
  return await chromium.launch({ headless: true });
}

async function newPage(browser) {
  const context = await browser.newContext();
  return await context.newPage();
}

async function navigateTo(page, hash) {
  await page.goto(`${BASE_URL}#${hash}`);
}

async function waitForSelector(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { timeout, state: 'visible' });
}

async function getText(page, selector) {
  return await page.textContent(selector);
}

async function click(page, selector) {
  await page.click(selector);
}

async function fill(page, selector, value) {
  await page.fill(selector, value);
}

async function isVisible(page, selector) {
  return await page.isVisible(selector);
}

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
