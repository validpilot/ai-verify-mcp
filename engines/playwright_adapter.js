'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.join(__dirname, '..', 'artifacts', 'phase1');

function ensureDir(dir = ARTIFACT_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name) {
  return String(name || `artifact-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function toFileUrl(input) {
  const value = String(input || '');
  if (/^https?:\/\//i.test(value) || /^file:\/\//i.test(value)) return value;
  return `file://${path.resolve(value).replace(/\\/g, '/')}`;
}

// 注：此处的 redactString 是轻量版本，用于日志输出
// 完整版本在 core/redaction.js 和 server.js 中，支持更多敏感模式
function redactString(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer ******')
    .replace(/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi, '$1******')
    .replace(/(token\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi, '$1******')
    .slice(0, 2000);
}

function truncate(value, max = 500) {
  const text = redactString(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function summarizeEntries(entries = [], limit = 10) {
  return entries.slice(-limit).map(item => {
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

class PlaywrightAdapter {
  constructor(options = {}) {
    this.options = { headless: true, viewport: { width: 1280, height: 800 }, ...options };
    this.browser = null;
    this.page = null;
    this.consoleLogs = [];
    this.networkLogs = [];
    this.pageErrors = [];
    this.artifactDir = options.artifactDir || ARTIFACT_DIR;
  }

  async ensurePage(options = {}) {
    if (!this.browser) {
      let chromium;
      try {
        chromium = require('playwright').chromium;
      } catch (error) {
        throw new Error(`Playwright dependency is unavailable: ${error.message}`);
      }
      this.browser = await chromium.launch({ headless: options.headless ?? this.options.headless });
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage({ viewport: options.viewport || this.options.viewport });
      this.attachListeners(this.page);
    }

    return this.page;
  }

  attachListeners(page) {
    page.on('console', msg => {
      this.consoleLogs.push({
        source: 'console',
        type: msg.type(),
        text: redactString(msg.text()),
        location: msg.location(),
        timestamp: new Date().toISOString()
      });
      this.trimLogs();
    });

    page.on('pageerror', error => {
      this.pageErrors.push({
        source: 'pageerror',
        type: 'error',
        text: truncate(error.message, 800),
        stack: truncate(error.stack, 1200),
        timestamp: new Date().toISOString()
      });
      this.trimLogs();
    });

    page.on('response', response => {
      const request = response.request();
      const status = response.status();
      if (status >= 400) {
        this.networkLogs.push({
          source: 'network',
          url: response.url(),
          status,
          method: request.method(),
          timestamp: new Date().toISOString()
        });
        this.trimLogs();
      }
    });

    page.on('requestfailed', request => {
      this.networkLogs.push({
        source: 'network',
        url: request.url(),
        method: request.method(),
        failed: true,
        errorText: request.failure()?.errorText,
        timestamp: new Date().toISOString()
      });
      this.trimLogs();
    });
  }

  trimLogs() {
    this.consoleLogs = this.consoleLogs.slice(-300);
    this.networkLogs = this.networkLogs.slice(-300);
    this.pageErrors = this.pageErrors.slice(-100);
  }

  async open(args = {}) {
    if (!args.url) throw new Error('browser open requires url');
    const page = await this.ensurePage(args);
    await page.goto(toFileUrl(args.url), { waitUntil: args.waitUntil || 'domcontentloaded', timeout: args.timeout || 30000 });
    return { ok: true, action: 'open', url: page.url(), title: await page.title().catch(() => '') };
  }

  async click(args = {}) {
    const page = await this.ensurePage(args);
    await page.click(args.selector, { timeout: args.timeout || 10000 });
    return { ok: true, action: 'click', selector: args.selector };
  }

  async type(args = {}) {
    const page = await this.ensurePage(args);
    await page.fill(args.selector, String(args.text ?? ''), { timeout: args.timeout || 10000 });
    return { ok: true, action: 'type', selector: args.selector, textLength: String(args.text ?? '').length };
  }

  async wait(args = {}) {
    const page = await this.ensurePage(args);
    if (args.selector) {
      await page.waitForSelector(args.selector, { timeout: args.timeout || 10000, state: args.state || 'visible' });
      return { ok: true, action: 'wait', selector: args.selector, state: args.state || 'visible' };
    }
    if (args.ms || args.timeout) {
      await page.waitForTimeout(Math.min(Number(args.ms || args.timeout), 10000));
      return { ok: true, action: 'wait', ms: Math.min(Number(args.ms || args.timeout), 10000) };
    }
    await page.waitForLoadState(args.state || 'domcontentloaded', { timeout: args.timeout || 10000 }).catch(() => {});
    return { ok: true, action: 'wait', state: args.state || 'domcontentloaded' };
  }

  async eval(args = {}) {
    const page = await this.ensurePage(args);
    const expression = args.expression || args.script;
    if (!expression) throw new Error('eval requires expression');
    const result = await page.evaluate(source => {
      const value = (0, eval)(source);
      return typeof value === 'undefined' ? null : value;
    }, expression);
    const serialized = JSON.stringify(result);
    if (serialized && serialized.length > 2000) {
      const artifactPath = this.writeArtifact('eval-result', result);
      return { ok: true, action: 'eval', resultSummary: truncate(serialized, 500), artifactPath };
    }
    return { ok: true, action: 'eval', result };
  }

  async screenshot(args = {}) {
    const page = await this.ensurePage(args);
    ensureDir(this.artifactDir);
    const filePath = args.path || path.join(this.artifactDir, `${safeName(args.name || 'screenshot')}-${Date.now()}.png`);
    const target = args.selector ? page.locator(args.selector).first() : page;
    await target.screenshot({ path: filePath, fullPage: !args.selector && args.fullPage !== false });
    return { ok: true, action: 'screenshot', artifactPath: filePath, summary: 'screenshot saved; no long image description returned' };
  }

  async batch(args = {}) {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const results = [];
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index] || {};
      const action = step.action || step.type;
      const stepArgs = step.args && typeof step.args === 'object' ? { ...step.args } : {};
      const merged = { ...args, ...stepArgs, ...step, action };
      try {
        const result = await this.runAction(action, merged);
        results.push({ index, action, ok: true, summary: summarizeResult(result), artifactPath: result.artifactPath });
      } catch (error) {
        results.push({ index, action, ok: false, error: truncate(error.message, 300) });
        if (args.stopOnError !== false) break;
      }
    }
    return { ok: results.every(item => item.ok), action: 'batch', stepCount: steps.length, results, evidence: await this.collectEvidenceSummary() };
  }

  async hover(args = {}) {
    const page = await this.ensurePage(args);
    await page.hover(args.selector, { timeout: args.timeout || 10000 });
    return { ok: true, action: 'hover', selector: args.selector };
  }

  async scroll(args = {}) {
    const page = await this.ensurePage(args);
    if (args.selector) {
      await page.$eval(args.selector, el => el.scrollIntoView({ block: args.block || 'center', inline: args.inline || 'center' }));
    } else {
      await page.evaluate(({ x, y }) => window.scrollTo(x || 0, y || 0), { x: args.x || 0, y: args.y || args.distance || 300 });
    }
    return { ok: true, action: 'scroll', selector: args.selector || null };
  }

  async pressKey(args = {}) {
    const page = await this.ensurePage(args);
    if (args.selector) await page.focus(args.selector);
    await page.keyboard.press(args.key);
    return { ok: true, action: 'press_key', key: args.key };
  }

  async errors(args = {}) {
    const includeWarnings = args.includeWarnings === true;
    let filtered = [];
    
    if (includeWarnings) {
      filtered.push(...this.consoleLogs.filter(item => item.type === 'error' || item.type === 'warning'));
    } else {
      filtered.push(...this.consoleLogs.filter(item => item.type === 'error'));
    }
    
    filtered.push(...this.pageErrors);
    filtered.push(...this.networkLogs.filter(item => item.status >= 400 || item.failed));
    
    return { 
      action: 'errors', 
      total: filtered.length, 
      console: this.consoleLogs.length, 
      network: this.networkLogs.length, 
      pageError: this.pageErrors.length,
      errors: summarizeEntries(filtered, args.limit || 20)
    };
  }

  async errorsClear(args = {}) {
    this.consoleLogs = [];
    this.networkLogs = [];
    this.pageErrors = [];
    this.errorCheckpoint = new Date().toISOString();
    return { action: 'errors_clear', checkpoint: this.errorCheckpoint, cleared: true };
  }

  async artifacts(args = {}) {
    const artifactDir = this.artifactDir;
    const files = fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir).slice(-20) : [];
    return { 
      action: 'artifacts', 
      dir: artifactDir, 
      files, 
      count: files.length 
    };
  }

  async runAction(action, args = {}) {
    switch (action) {
      case 'open': return this.open(args);
      case 'navigate': return this.open(args);
      case 'click': return this.click(args);
      case 'type': return this.type(args);
      case 'hover': return this.hover(args);
      case 'scroll': return this.scroll(args);
      case 'press_key': return this.pressKey(args);
      case 'wait': return this.wait(args);
      case 'eval': return this.eval(args);
      case 'screenshot': return this.screenshot(args);
      case 'batch': return this.batch(args);
      case 'errors': return this.errors(args);
      case 'errors_clear': return this.errorsClear(args);
      case 'artifacts': return this.artifacts(args);
      case 'summary': return this.collectEvidenceSummary(args);
      case 'check': return this.checkAction(args);
      case 'collect': return this.collectAction(args);
      case 'report': return this.reportAction(args);
      default: throw new Error(`unsupported browser action: ${action}`);
    }
  }

  async checkAction(args = {}) {
    const checks = Array.isArray(args.checks) ? args.checks : [];
    const evidence = await this.collectEvidenceSummary();
    const violations = [];
    if (args.selector) {
      const page = await this.ensurePage(args);
      const el = await page.$(args.selector);
      if (!el) {
        violations.push({ check: 'selector', selector: args.selector, detail: 'element not found' });
      }
    }
    for (const check of checks) {
      if (check === 'no_top_errors' || check === 'no_errors') {
        if (evidence.topErrors && evidence.topErrors.length > 0) {
          violations.push({ check, detail: `${evidence.topErrors.length} top errors found` });
        }
      }
    }
    return { action: 'check', checks, pass: violations.length === 0, violations };
  }

  async collectAction(args = {}) {
    const evidenceTypes = Array.isArray(args.evidence) ? args.evidence : ['console'];
    const collected = {};
    for (const type of evidenceTypes) {
      if (type === 'console') collected.console = this.consoleLogs.slice(-50);
      else if (type === 'pageerror') collected.pageerror = this.pageErrors.slice(-50);
      else if (type === 'network') collected.network = this.networkLogs.slice(-50);
    }
    return { action: 'collect', evidence: evidenceTypes, collected, summary: summarizeResult(collected) };
  }

  async reportAction(args = {}) {
    const evidence = await this.collectEvidenceSummary();
    const result = {
      action: 'report',
      pass: (evidence.topErrors || []).length === 0,
      mode: args.format || 'short',
      topErrors: evidence.topErrors || [],
      artifacts: evidence.artifactPath ? [evidence.artifactPath] : []
    };
    result.summary = result.pass ? 'pass' : `fail: ${result.topErrors.length} top errors`;
    return result;
  }

  async domSummary(args = {}) {
    const page = await this.ensurePage(args);
    return page.evaluate(() => {
      const text = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim();
      const stableSelectorFor = el => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
        if (testId) return `[data-testid="${testId}"]`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const role = el.getAttribute('role');
        const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim();
        if (role && label) return `[role="${role}"][aria-label="${label.slice(0, 40)}"]`;
        return el.tagName.toLowerCase();
      };
      const controls = Array.from(document.querySelectorAll('button,a,input,textarea,select,[role="button"],[role="link"]')).slice(0, 30).map(el => ({
        selector: stableSelectorFor(el),
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 80),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true'
      }));
      const alerts = Array.from(document.querySelectorAll('[role="alert"],.error,.alert,.toast')).slice(0, 10).map(el => (el.innerText || el.textContent || '').trim().slice(0, 160));
      return { url: location.href, title: document.title, readyState: document.readyState, textSummary: text.slice(0, 1000), controls, alerts };
    });
  }

  async collectEvidenceSummary(args = {}) {
    const dom = this.page && !this.page.isClosed() ? await this.domSummary(args).catch(error => ({ error: error.message })) : null;
    // 使用类内部的存储（开源版）
    return {
      generatedAt: new Date().toISOString(),
      console: { count: this.consoleLogs.length, recent: summarizeEntries(this.consoleLogs, args.limit || 10) },
      network: { count: this.networkLogs.length, recent: summarizeEntries(this.networkLogs, args.limit || 10) },
      pageerror: { count: this.pageErrors.length, recent: summarizeEntries(this.pageErrors, args.limit || 10) },
      dom
    };
  }

  writeArtifact(name, data) {
    ensureDir(this.artifactDir);
    const filePath = path.join(this.artifactDir, `${safeName(name)}-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
    this.page = null;
  }
}

function summarizeResult(result = {}) {
  if (result.summary) return result.summary;
  if (result.action === 'open') return `opened ${result.url}`;
  if (result.action) return `${result.action} ok`;
  return 'ok';
}

const defaultAdapter = new PlaywrightAdapter();

module.exports = {
  PlaywrightAdapter,
  defaultAdapter,
  toFileUrl,
  ensureDir,
  redactString,
  truncate,
  summarizeEntries
};