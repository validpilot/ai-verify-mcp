'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ChromeMCPAdapter {
  constructor(options = {}) {
    this.browser = null;
    this.pages = new Map();
    this.defaultPage = null;
    this._engine = null; // 'puppeteer' or 'playwright'
    this.options = {
      headless: options.headless !== false,
      executablePath: options.executablePath || null,
      cdpPort: options.cdpPort || 9222,
      ...options
    };
  }

  async launch(options = {}) {
    const mergedOptions = { ...this.options, ...options };

    // Try puppeteer-core first
    try {
      const puppeteer = require('puppeteer-core');
      this.browser = await puppeteer.launch({
        headless: mergedOptions.headless !== false ? 'new' : false,
        executablePath: mergedOptions.executablePath || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this._engine = 'puppeteer';
      return this.browser;
    } catch (e) {
      // Fall through to Playwright approach
    }

    // Fall back to Playwright Chromium (already available as a dependency)
    try {
      const { chromium } = require('playwright');
      this.browser = await chromium.launch({
        headless: mergedOptions.headless !== false,
        executablePath: mergedOptions.executablePath || undefined
      });
      this._engine = 'playwright';
      return this.browser;
    } catch (e) {
      throw new Error(
        `ChromeMCPAdapter: Cannot launch browser. ` +
        `Install puppeteer-core or ensure Playwright is available. Error: ${e.message}`
      );
    }
  }

  async newPage(options = {}) {
    if (!this.browser) {
      throw new Error('ChromeMCPAdapter: Browser not launched. Call launch() first.');
    }

    let page;

    if (this._engine === 'puppeteer') {
      page = await this.browser.newPage();
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }
    } else {
      // Playwright
      page = await this.browser.newPage({
        viewport: options.viewport || { width: 1440, height: 900 }
      });
    }

    // Generate a unique page name if none provided (使用加密安全的随机数)
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const pageName = options.name || `page_${Date.now()}_${randomSuffix}`;
    this.pages.set(pageName, { page, name: pageName, createdAt: new Date().toISOString() });

    if (!this.defaultPage) {
      this.defaultPage = page;
    }

    return page;
  }

  async close() {
    // Close all pages
    for (const [name, entry] of this.pages) {
      try {
        if (entry.page && typeof entry.page.close === 'function') {
          await entry.page.close();
        }
      } catch (e) {
        // Ignore errors closing individual pages
      }
    }
    this.pages.clear();
    this.defaultPage = null;

    // Close browser
    if (this.browser && typeof this.browser.close === 'function') {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore errors closing browser
      }
    }
    this.browser = null;
    this._engine = null;
  }

  getPage(name = null) {
    if (!this.browser) {
      throw new Error('ChromeMCPAdapter: Browser not launched. Call launch() first.');
    }

    if (name === null) {
      if (!this.defaultPage) {
        throw new Error('ChromeMCPAdapter: No default page. Call newPage() first.');
      }
      return this.defaultPage;
    }

    const entry = this.pages.get(name);
    if (!entry || !entry.page) {
      throw new Error(`ChromeMCPAdapter: Page '${name}' not found.`);
    }
    return entry.page;
  }

  async goto(url, options = {}) {
    const page = this.getPage();
    const waitUntil = options.waitUntil || 'domcontentloaded';

    if (this._engine === 'puppeteer') {
      await page.goto(url, { waitUntil, timeout: options.timeout || 30000 });
    } else {
      await page.goto(url, { waitUntil, timeout: options.timeout || 30000 });
    }

    return page;
  }

  async screenshot(options = {}) {
    const page = this.getPage();
    const screenshotOptions = { fullPage: options.fullPage !== false, type: options.type || 'png' };

    if (options.path) {
      screenshotOptions.path = options.path;
    }

    if (this._engine === 'puppeteer') {
      return await page.screenshot(screenshotOptions);
    } else {
      // Playwright returns Buffer
      return await page.screenshot(screenshotOptions);
    }
  }

  async evaluate(pageFunction, ...args) {
    const page = this.getPage();

    if (this._engine === 'puppeteer') {
      return await page.evaluate(pageFunction, ...args);
    } else {
      return await page.evaluate(pageFunction, ...args);
    }
  }

  async waitForSelector(selector, options = {}) {
    const page = this.getPage();
    const timeout = options.timeout || 10000;

    if (this._engine === 'puppeteer') {
      return await page.waitForSelector(selector, { timeout, visible: options.visible !== false });
    } else {
      return await page.waitForSelector(selector, {
        timeout,
        state: options.visible !== false ? 'visible' : 'attached'
      });
    }
  }

  async click(selector, options = {}) {
    const page = this.getPage();

    if (this._engine === 'puppeteer') {
      await page.waitForSelector(selector, { timeout: options.timeout || 10000 });
      return await page.click(selector);
    } else {
      await page.waitForSelector(selector, {
        timeout: options.timeout || 10000,
        state: 'visible'
      });
      return await page.click(selector);
    }
  }

  async type(selector, text, options = {}) {
    const page = this.getPage();

    if (this._engine === 'puppeteer') {
      await page.waitForSelector(selector, { timeout: options.timeout || 10000 });
      await page.click(selector, { clickCount: 3 }); // Select all existing text
      return await page.type(selector, text, { delay: options.delay || 0 });
    } else {
      await page.waitForSelector(selector, {
        timeout: options.timeout || 10000,
        state: 'visible'
      });
      await page.click(selector, { clickCount: 3 }); // Select all existing text
      return await page.type(selector, text, { delay: options.delay || 0 });
    }
  }

  isConnected() {
    if (!this.browser) {
      return false;
    }

    try {
      // Playwright/Puppeteer: browser.isConnected()
      if (typeof this.browser.isConnected === 'function') {
        return this.browser.isConnected();
      }
      // Fallback: if browser exists and no error thrown, assume connected
      return true;
    } catch (e) {
      return false;
    }
  }

  static detectChromePath() {
    const platform = os.platform();

    if (platform === 'win32') {
      const winPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Chromium\\Application\\chrome.exe'
      ];
      for (const p of winPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }

      // Try registry lookup
      try {
        const { execSync } = require('child_process');
        const regQuery = execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve 2>nul',
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const match = regQuery.match(/([A-Z]:\\[^\r\n]+\.exe)/i);
        if (match && fs.existsSync(match[1])) {
          return match[1];
        }
      } catch (e) {
        // Registry query failed
      }
    }

    if (platform === 'darwin') {
      const macPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ];
      for (const p of macPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    }

    if (platform === 'linux') {
      const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
      ];
      for (const p of linuxPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }

      // Try which command
      try {
        const { execSync } = require('child_process');
        const names = ['google-chrome', 'chromium-browser', 'chromium'];
        for (const name of names) {
          try {
            const result = execSync(`which ${name} 2>/dev/null`, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
            if (result && fs.existsSync(result)) {
              return result;
            }
          } catch (e) {
            // Command not found
          }
        }
      } catch (e) {
        // which command failed
      }
    }

    return null;
  }
}

const ARTIFACT_DIR = path.join(__dirname, '..', 'artifacts', 'chrome-mcp');

function ensureDir(dir) {
  const targetDir = dir || ARTIFACT_DIR;
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

function safeName(name) {
  return String(name || `artifact-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function toFileUrl(input) {
  const value = String(input || '');
  if (/^https?:\/\//i.test(value) || /^file:\/\//i.test(value)) return value;
  return `file://${path.resolve(value).replace(/\\/g, '/')}`;
}

function redactString(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer ******')
    .replace(/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi, '$1******')
    .replace(/(token\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi, '$1******')
    .slice(0, 2000);
}

function truncate(value, max) {
  return redactString(value).length > max ? `${redactString(value).slice(0, max)}...` : redactString(value);
}

function summarizeEntries(entries, limit) {
  return (entries || []).slice(-(limit || 10)).map(item => {
    const summary = {
      source: item.source,
      type: item.type,
      text: truncate(item.text || item.message || item.errorText || item.url || '', 240),
      url: item.url,
      status: item.status,
      method: item.method,
      failed: item.failed === true,
      timestamp: item.timestamp
    };
    return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined && value !== ''));
  });
}

function summarizeResult(result) {
  result = result || {};
  const { passed = 0, failed = 0, skipped = 0 } = result;
  const total = passed + failed + skipped;
  const pct = total > 0 ? Math.round(passed / total * 100) : 0;
  return {
    status: failed > 0 ? 'fail' : passed > 0 ? 'pass' : 'unknown',
    passed, failed, skipped,
    passRate: pct + '%',
    summary: `Passed ${passed} / Failed ${failed} / Skipped ${skipped}`,
    ...result
  };
}

module.exports = {
  ChromeMCPAdapter,
  ensureDir,
  safeName,
  toFileUrl,
  redactString,
  truncate,
  summarizeEntries,
  summarizeResult,
};
