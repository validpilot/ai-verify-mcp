'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  ChromeMCPAdapter,
  ensureDir,
  safeName,
  toFileUrl,
  redactString,
  truncate,
  summarizeEntries,
  summarizeResult
} = require('../engines/chrome_mcp_adapter');

// ========== 辅助函数：创建 mock browser/page ==========
function createMockBrowser(overrides = {}) {
  return {
    isConnected: () => true,
    close: async () => {},
    newPage: async () => createMockPage(),
    ...overrides
  };
}

function createMockPage(overrides = {}) {
  return {
    goto: async () => {},
    screenshot: async () => Buffer.from('fake'),
    evaluate: async (fn, ...args) => {
      if (typeof fn === 'function') return fn(...args);
      return null;
    },
    waitForSelector: async () => ({}),
    click: async () => {},
    type: async () => {},
    setViewport: async () => {},
    close: async () => {},
    ...overrides
  };
}

// ========== 1. 纯函数测试 ==========
describe('chrome_mcp_adapter 纯函数', () => {
  describe('toFileUrl', () => {
    it('http URL 原样返回', () => {
      assert.equal(toFileUrl('https://example.com'), 'https://example.com');
    });

    it('file URL 原样返回', () => {
      assert.equal(toFileUrl('file:///C:/test.html'), 'file:///C:/test.html');
    });

    it('普通路径转换为 file URL', () => {
      const result = toFileUrl('./test.html');
      assert.ok(result.startsWith('file://'));
      assert.ok(result.includes('test.html'));
    });

    it('空值处理', () => {
      const result = toFileUrl('');
      assert.ok(result.startsWith('file://'));
    });

    it('null 处理', () => {
      const result = toFileUrl(null);
      assert.ok(result.startsWith('file://'));
    });
  });

  describe('safeName', () => {
    it('合法名称原样返回', () => {
      assert.equal(safeName('test-file_1.png'), 'test-file_1.png');
    });

    it('特殊字符替换为下划线', () => {
      assert.equal(safeName('test file!!'), 'test_file__');
    });

    it('空值生成 artifact- 前缀', () => {
      const result = safeName('');
      assert.ok(result.startsWith('artifact-'));
    });

    it('null 生成 artifact- 前缀', () => {
      const result = safeName(null);
      assert.ok(result.startsWith('artifact-'));
    });
  });

  describe('ensureDir', () => {
    it('创建目录并返回路径', () => {
      const tmpDir = path.join(os.tmpdir(), `vp-cma-${Date.now()}`);
      const result = ensureDir(tmpDir);
      assert.equal(result, tmpDir);
      assert.ok(fs.existsSync(tmpDir));
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('默认使用 ARTIFACT_DIR', () => {
      const result = ensureDir();
      assert.ok(typeof result === 'string');
      assert.ok(fs.existsSync(result));
    });

    it('已存在目录不报错', () => {
      const tmpDir = path.join(os.tmpdir(), `vp-cma-${Date.now()}`);
      ensureDir(tmpDir);
      assert.doesNotThrow(() => ensureDir(tmpDir));
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('redactString', () => {
    it('脱敏 Bearer token', () => {
      const result = redactString('Bearer abc123xyz456');
      assert.ok(result.includes('******'));
      assert.ok(!result.includes('abc123xyz456'));
    });

    it('脱敏 api_key', () => {
      const result = redactString('api_key=sk_test_12345678abcdef');
      assert.ok(result.includes('******'));
    });

    it('脱敏 token', () => {
      const result = redactString('token: mysecrettoken1234');
      assert.ok(result.includes('******'));
    });

    it('普通文本不脱敏', () => {
      assert.equal(redactString('hello world'), 'hello world');
    });

    it('截断超长文本到 2000 字符', () => {
      const longText = 'a'.repeat(3000);
      assert.equal(redactString(longText).length, 2000);
    });

    it('null 返回空字符串', () => {
      assert.equal(redactString(null), '');
    });
  });

  describe('truncate', () => {
    it('短文本原样返回', () => {
      assert.equal(truncate('short', 500), 'short');
    });

    it('长文本截断并添加省略号', () => {
      const longText = 'a'.repeat(600);
      const result = truncate(longText, 500);
      assert.equal(result.length, 503);
      assert.ok(result.endsWith('...'));
    });

    it('无 max 参数时不截断（redactString 长度 < undefined → NaN 比较 false）', () => {
      // truncate(value, max) — max 为 undefined 时 redactString(value).length > undefined → false
      const result = truncate('normal text');
      assert.equal(result, 'normal text');
    });
  });

  describe('summarizeEntries', () => {
    it('空数组返回空数组', () => {
      assert.deepStrictEqual(summarizeEntries([], 10), []);
    });

    it('null 返回空数组', () => {
      assert.deepStrictEqual(summarizeEntries(null, 10), []);
    });

    it('提取关键字段并过滤空值', () => {
      const entries = [
        { source: 'console', type: 'error', text: 'err', url: '', status: undefined }
      ];
      const result = summarizeEntries(entries, 10);
      assert.equal(result.length, 1);
      assert.equal(result[0].source, 'console');
      assert.equal(result[0].type, 'error');
      assert.ok(!('url' in result[0]));
      assert.ok(!('status' in result[0]));
    });

    it('text/message/errorText/url 优先级', () => {
      const entries = [
        { source: 'net', text: '', message: 'msg', errorText: 'err', url: 'http://x' }
      ];
      const result = summarizeEntries(entries, 10);
      assert.equal(result[0].text, 'msg');
    });

    it('limit 取最后 N 条', () => {
      const entries = Array.from({ length: 15 }, (_, i) => ({
        source: 'console', type: 'log', text: `msg${i}`
      }));
      const result = summarizeEntries(entries, 5);
      assert.equal(result.length, 5);
      assert.equal(result[0].text, 'msg10');
    });

    it('failed 字段传递', () => {
      const entries = [{ source: 'net', failed: true, text: 'fail' }];
      const result = summarizeEntries(entries, 10);
      assert.equal(result[0].failed, true);
    });
  });

  describe('summarizeResult', () => {
    it('有 passed/failed/skipped 时计算 passRate', () => {
      const result = summarizeResult({ passed: 8, failed: 2, skipped: 0 });
      assert.equal(result.status, 'fail');
      assert.equal(result.passed, 8);
      assert.equal(result.failed, 2);
      assert.equal(result.passRate, '80%');
      assert.ok(result.summary.includes('Passed 8'));
    });

    it('全部通过时 status=pass', () => {
      const result = summarizeResult({ passed: 10, failed: 0 });
      assert.equal(result.status, 'pass');
      assert.equal(result.passRate, '100%');
    });

    it('全部为 0 时 status=unknown', () => {
      const result = summarizeResult({ passed: 0, failed: 0, skipped: 0 });
      assert.equal(result.status, 'unknown');
      assert.equal(result.passRate, '0%');
    });

    it('默认参数', () => {
      const result = summarizeResult();
      assert.equal(result.status, 'unknown');
      assert.equal(result.passed, 0);
      assert.equal(result.failed, 0);
      assert.equal(result.passRate, '0%');
    });

    it('skipped 计入 total', () => {
      const result = summarizeResult({ passed: 5, failed: 0, skipped: 5 });
      assert.equal(result.passRate, '50%');
    });

    it('保留额外字段', () => {
      const result = summarizeResult({ passed: 1, failed: 0, custom: 'extra' });
      assert.equal(result.custom, 'extra');
    });
  });
});

// ========== 2. ChromeMCPAdapter 类测试 ==========
describe('ChromeMCPAdapter 类', () => {
  describe('constructor', () => {
    it('默认选项', () => {
      const adapter = new ChromeMCPAdapter();
      assert.equal(adapter.browser, null);
      assert.equal(adapter.defaultPage, null);
      assert.equal(adapter._engine, null);
      assert.ok(adapter.pages instanceof Map);
      assert.ok(adapter.options.headless);
      assert.equal(adapter.options.cdpPort, 9222);
      assert.equal(adapter.options.executablePath, null);
    });

    it('自定义选项', () => {
      const adapter = new ChromeMCPAdapter({ headless: false, cdpPort: 9333, executablePath: '/usr/bin/chrome' });
      assert.equal(adapter.options.headless, false);
      assert.equal(adapter.options.cdpPort, 9333);
      assert.equal(adapter.options.executablePath, '/usr/bin/chrome');
    });
  });

  describe('isConnected', () => {
    it('无 browser 返回 false', () => {
      const adapter = new ChromeMCPAdapter();
      assert.equal(adapter.isConnected(), false);
    });

    it('browser 有 isConnected 方法时调用它', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = { isConnected: () => true };
      assert.equal(adapter.isConnected(), true);
    });

    it('browser 无 isConnected 方法时返回 true', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = {}; // 无 isConnected 方法
      assert.equal(adapter.isConnected(), true);
    });

    it('isConnected 抛错时返回 false', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = { isConnected: () => { throw new Error('disconnected'); } };
      assert.equal(adapter.isConnected(), false);
    });
  });

  describe('getPage', () => {
    it('无 browser 抛错', () => {
      const adapter = new ChromeMCPAdapter();
      assert.throws(() => adapter.getPage(), /Browser not launched/);
    });

    it('无 default page 抛错', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      assert.throws(() => adapter.getPage(), /No default page/);
    });

    it('返回 default page', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      const mockPage = createMockPage();
      adapter.defaultPage = mockPage;
      assert.equal(adapter.getPage(), mockPage);
    });

    it('按名称返回 page', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      const mockPage = createMockPage();
      adapter.pages.set('test-page', { page: mockPage, name: 'test-page' });
      assert.equal(adapter.getPage('test-page'), mockPage);
    });

    it('名称不存在抛错', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      assert.throws(() => adapter.getPage('nonexistent'), /not found/);
    });

    it('entry 无 page 属性抛错', () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.pages.set('bad', { name: 'bad' }); // 无 page
      assert.throws(() => adapter.getPage('bad'), /not found/);
    });
  });

  describe('newPage', () => {
    it('无 browser 抛错', async () => {
      const adapter = new ChromeMCPAdapter();
      await assert.rejects(() => adapter.newPage(), /Browser not launched/);
    });

    it('puppeteer 引擎创建页面', async () => {
      const adapter = new ChromeMCPAdapter();
      const mockPage = createMockPage();
      adapter.browser = {
        newPage: async () => mockPage
      };
      adapter._engine = 'puppeteer';
      const page = await adapter.newPage({ viewport: { width: 800, height: 600 } });
      assert.equal(page, mockPage);
      assert.ok(adapter.defaultPage); // 首个页面设为 default
    });

    it('playwright 引擎创建页面', async () => {
      const adapter = new ChromeMCPAdapter();
      const mockPage = createMockPage();
      adapter.browser = {
        newPage: async (opts) => {
          assert.ok(opts.viewport);
          return mockPage;
        }
      };
      adapter._engine = 'playwright';
      const page = await adapter.newPage({});
      assert.equal(page, mockPage);
    });

    it('自定义名称注册到 pages Map', async () => {
      const adapter = new ChromeMCPAdapter();
      const mockPage = createMockPage();
      adapter.browser = { newPage: async () => mockPage };
      adapter._engine = 'playwright';
      await adapter.newPage({ name: 'my-page' });
      assert.ok(adapter.pages.has('my-page'));
      assert.equal(adapter.pages.get('my-page').page, mockPage);
    });

    it('无名称时自动生成', async () => {
      const adapter = new ChromeMCPAdapter();
      const mockPage = createMockPage();
      adapter.browser = { newPage: async () => mockPage };
      adapter._engine = 'playwright';
      await adapter.newPage({});
      assert.equal(adapter.pages.size, 1);
      const [name] = adapter.pages.keys();
      assert.ok(name.startsWith('page_'));
    });

    it('首个页面设为 defaultPage', async () => {
      const adapter = new ChromeMCPAdapter();
      const mockPage1 = createMockPage();
      const mockPage2 = createMockPage();
      adapter.browser = { newPage: async () => mockPage1 };
      adapter._engine = 'playwright';
      await adapter.newPage({});
      assert.equal(adapter.defaultPage, mockPage1);
      // 第二个页面不覆盖 defaultPage
      adapter.browser.newPage = async () => mockPage2;
      await adapter.newPage({ name: 'second' });
      assert.equal(adapter.defaultPage, mockPage1);
    });
  });

  describe('goto', () => {
    it('导航到 URL', async () => {
      const adapter = new ChromeMCPAdapter();
      let gotoUrl, gotoOpts;
      adapter.browser = createMockBrowser();
      adapter.defaultPage = createMockPage({
        goto: async (url, opts) => { gotoUrl = url; gotoOpts = opts; }
      });
      await adapter.goto('https://example.com', { timeout: 5000 });
      assert.equal(gotoUrl, 'https://example.com');
      assert.equal(gotoOpts.timeout, 5000);
      assert.equal(gotoOpts.waitUntil, 'domcontentloaded');
    });

    it('默认 timeout 30000', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.defaultPage = createMockPage({
        goto: async (url, opts) => { assert.equal(opts.timeout, 30000); }
      });
      await adapter.goto('https://x.com');
    });
  });

  describe('screenshot', () => {
    it('截图默认全页', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let shotOpts;
      adapter.defaultPage = createMockPage({
        screenshot: async (opts) => { shotOpts = opts; return Buffer.from('img'); }
      });
      const result = await adapter.screenshot({});
      assert.ok(Buffer.isBuffer(result));
      assert.equal(shotOpts.fullPage, true);
      assert.equal(shotOpts.type, 'png');
    });

    it('指定 path 时传入', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let shotOpts;
      adapter.defaultPage = createMockPage({
        screenshot: async (opts) => { shotOpts = opts; return Buffer.from('img'); }
      });
      await adapter.screenshot({ path: '/tmp/shot.png', fullPage: false });
      assert.equal(shotOpts.path, '/tmp/shot.png');
      assert.equal(shotOpts.fullPage, false);
    });
  });

  describe('evaluate', () => {
    it('执行页面函数', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.defaultPage = createMockPage({
        evaluate: async (fn, ...args) => fn(...args)
      });
      const result = await adapter.evaluate((a, b) => a + b, 1, 2);
      assert.equal(result, 3);
    });
  });

  describe('waitForSelector', () => {
    it('puppeteer 引擎使用 visible 选项', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let waitOpts;
      adapter.defaultPage = createMockPage({
        waitForSelector: async (sel, opts) => { waitOpts = opts; }
      });
      adapter._engine = 'puppeteer';
      await adapter.waitForSelector('#el', { timeout: 5000 });
      assert.equal(waitOpts.timeout, 5000);
      assert.equal(waitOpts.visible, true);
    });

    it('playwright 引擎使用 state 选项', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let waitOpts;
      adapter.defaultPage = createMockPage({
        waitForSelector: async (sel, opts) => { waitOpts = opts; }
      });
      adapter._engine = 'playwright';
      await adapter.waitForSelector('#el', { visible: false });
      assert.equal(waitOpts.state, 'attached');
    });

    it('默认 timeout 10000', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let waitOpts;
      adapter.defaultPage = createMockPage({
        waitForSelector: async (sel, opts) => { waitOpts = opts; }
      });
      adapter._engine = 'playwright';
      await adapter.waitForSelector('#el');
      assert.equal(waitOpts.timeout, 10000);
    });
  });

  describe('click', () => {
    it('puppeteer 引擎先 wait 再 click', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      const callOrder = [];
      adapter.defaultPage = createMockPage({
        waitForSelector: async () => { callOrder.push('wait'); },
        click: async () => { callOrder.push('click'); }
      });
      adapter._engine = 'puppeteer';
      await adapter.click('#btn');
      assert.deepStrictEqual(callOrder, ['wait', 'click']);
    });

    it('playwright 引擎使用 state=visible', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      let waitOpts;
      adapter.defaultPage = createMockPage({
        waitForSelector: async (sel, opts) => { waitOpts = opts; },
        click: async () => {}
      });
      adapter._engine = 'playwright';
      await adapter.click('#btn', { timeout: 3000 });
      assert.equal(waitOpts.state, 'visible');
      assert.equal(waitOpts.timeout, 3000);
    });
  });

  describe('type', () => {
    it('puppeteer 引擎 type 流程', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      const callOrder = [];
      adapter.defaultPage = createMockPage({
        waitForSelector: async () => { callOrder.push('wait'); },
        click: async () => { callOrder.push('click'); },
        type: async () => { callOrder.push('type'); }
      });
      adapter._engine = 'puppeteer';
      await adapter.type('#input', 'hello', { delay: 50 });
      assert.deepStrictEqual(callOrder, ['wait', 'click', 'type']);
    });

    it('playwright 引擎 type 流程', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.defaultPage = createMockPage({
        waitForSelector: async () => {},
        click: async () => {},
        type: async (sel, text, opts) => {
          assert.equal(text, 'test');
          assert.equal(opts.delay, 0);
        }
      });
      adapter._engine = 'playwright';
      await adapter.type('#input', 'test');
    });
  });

  describe('close', () => {
    it('关闭所有页面和浏览器', async () => {
      const adapter = new ChromeMCPAdapter();
      let pageClosed = 0;
      let browserClosed = false;
      const mockPage = createMockPage({
        close: async () => { pageClosed++; }
      });
      adapter.browser = {
        close: async () => { browserClosed = true; }
      };
      adapter.pages.set('p1', { page: mockPage, name: 'p1' });
      adapter.pages.set('p2', { page: mockPage, name: 'p2' });
      adapter.defaultPage = mockPage;
      adapter._engine = 'playwright';

      await adapter.close();
      assert.equal(pageClosed, 2);
      assert.ok(browserClosed);
      assert.equal(adapter.pages.size, 0);
      assert.equal(adapter.defaultPage, null);
      assert.equal(adapter.browser, null);
      assert.equal(adapter._engine, null);
    });

    it('page close 抛错被忽略', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.pages.set('p1', {
        page: { close: async () => { throw new Error('fail'); } },
        name: 'p1'
      });
      await assert.doesNotReject(() => adapter.close());
    });

    it('browser close 抛错被忽略', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = { close: async () => { throw new Error('fail'); } };
      await assert.doesNotReject(() => adapter.close());
      assert.equal(adapter.browser, null);
    });

    it('无 browser 时不报错', async () => {
      const adapter = new ChromeMCPAdapter();
      await assert.doesNotReject(() => adapter.close());
    });

    it('page 无 close 方法时跳过', async () => {
      const adapter = new ChromeMCPAdapter();
      adapter.browser = createMockBrowser();
      adapter.pages.set('p1', { page: {}, name: 'p1' }); // 无 close 方法
      await assert.doesNotReject(() => adapter.close());
    });
  });

  describe('detectChromePath (静态方法)', () => {
    it('返回字符串或 null', () => {
      const result = ChromeMCPAdapter.detectChromePath();
      assert.ok(result === null || typeof result === 'string');
    });

    it('在 Windows 上检测 Chrome（可能为 null 如果未安装）', () => {
      // 这个测试验证方法不抛错
      const result = ChromeMCPAdapter.detectChromePath();
      if (os.platform() === 'win32') {
        // 在 Windows 上，可能返回路径或 null（如果未安装 Chrome）
        assert.ok(result === null || result.endsWith('.exe'));
      }
    });
  });
});
