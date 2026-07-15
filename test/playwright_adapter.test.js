'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  PlaywrightAdapter,
  defaultAdapter,
  toFileUrl,
  ensureDir,
  redactString,
  truncate,
  summarizeEntries
} = require('../engines/playwright_adapter');

// safeName 和 summarizeResult 是模块内部函数，未导出，通过 writeArtifact/batch 等方法间接测试

// ========== 辅助函数：创建 mock page ==========
function createMockPage(overrides = {}) {
  const listeners = {};
  return {
    url: () => 'https://example.com/',
    title: async () => 'Test Page',
    isClosed: () => false,
    click: async () => {},
    fill: async () => {},
    hover: async () => {},
    goto: async () => {},
    evaluate: async (fn, ...args) => {
      if (typeof fn === 'function') return fn(...args);
      return null;
    },
    waitForSelector: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    $: async () => ({ tagName: 'div' }),
    $eval: async (sel, fn) => fn({ scrollIntoView: () => {} }),
    screenshot: async () => Buffer.from('fake-image'),
    keyboard: { press: async () => {} },
    focus: async () => {},
    locator: () => ({
      first: () => ({
        screenshot: async () => {}
      })
    }),
    on: (event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    _listeners: listeners,
    ...overrides
  };
}

// ========== 1. 纯函数测试 ==========
describe('playwright_adapter 纯函数', () => {
  describe('toFileUrl', () => {
    it('http URL 原样返回', () => {
      assert.equal(toFileUrl('https://example.com'), 'https://example.com');
      assert.equal(toFileUrl('http://localhost:3000'), 'http://localhost:3000');
    });

    it('file URL 原样返回', () => {
      assert.equal(toFileUrl('file:///C:/test.html'), 'file:///C:/test.html');
    });

    it('普通路径转换为 file URL', () => {
      const result = toFileUrl('./test.html');
      assert.ok(result.startsWith('file://'));
      assert.ok(result.includes('test.html'));
    });

    it('空值返回 file:// + 当前目录', () => {
      const result = toFileUrl('');
      assert.ok(result.startsWith('file://'));
    });

    it('null 返回 file://', () => {
      const result = toFileUrl(null);
      assert.ok(result.startsWith('file://'));
    });
  });

  describe('ensureDir', () => {
    it('创建目录并返回路径', () => {
      const tmpDir = path.join(os.tmpdir(), `vp-test-${Date.now()}`);
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

    it('递归创建已存在目录不报错', () => {
      const tmpDir = path.join(os.tmpdir(), `vp-test-${Date.now()}`);
      ensureDir(tmpDir);
      assert.doesNotThrow(() => ensureDir(tmpDir));
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('redactString', () => {
    it('脱敏 Bearer token', () => {
      const result = redactString('Authorization: Bearer abc123xyz456');
      assert.ok(result.includes('Bearer ******'));
      assert.ok(!result.includes('abc123xyz456'));
    });

    it('脱敏 api_key', () => {
      const result = redactString('api_key=sk_test_12345678abcdef');
      assert.ok(result.includes('******'));
    });

    it('脱敏 token 赋值', () => {
      const result = redactString('token: mysecrettoken1234');
      assert.ok(result.includes('******'));
    });

    it('普通文本不脱敏', () => {
      assert.equal(redactString('hello world'), 'hello world');
    });

    it('截断超长文本到 2000 字符', () => {
      const longText = 'a'.repeat(3000);
      const result = redactString(longText);
      assert.equal(result.length, 2000);
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
      assert.equal(result.length, 503); // 500 + '...'
      assert.ok(result.endsWith('...'));
    });

    it('默认 max=500', () => {
      const longText = 'b'.repeat(600);
      const result = truncate(longText);
      assert.ok(result.endsWith('...'));
      assert.equal(result.length, 503);
    });

    it('脱敏后再截断', () => {
      const text = `Bearer ${'x'.repeat(600)}`;
      const result = truncate(text, 100);
      assert.ok(result.includes('******'));
      assert.ok(result.length <= 103);
    });
  });

  describe('summarizeEntries', () => {
    it('空数组返回空数组', () => {
      assert.deepStrictEqual(summarizeEntries([], 10), []);
    });

    it('undefined 返回空数组', () => {
      assert.deepStrictEqual(summarizeEntries(undefined, 10), []);
    });

    it('提取关键字段并过滤空值', () => {
      const entries = [
        { source: 'console', type: 'error', text: 'error msg', url: '', status: undefined, method: '' }
      ];
      const result = summarizeEntries(entries, 10);
      assert.equal(result.length, 1);
      assert.equal(result[0].source, 'console');
      assert.equal(result[0].type, 'error');
      assert.equal(result[0].text, 'error msg');
      assert.ok(!('url' in result[0]));
      assert.ok(!('status' in result[0]));
      assert.ok(!('method' in result[0]));
    });

    it('使用 text/message/errorText/url 优先级', () => {
      const entries = [
        { source: 'network', text: '', message: 'msg', errorText: 'err', url: 'http://x.com' }
      ];
      const result = summarizeEntries(entries, 10);
      assert.equal(result[0].text, 'msg');
    });

    it('limit 限制返回条数（取最后 N 条）', () => {
      const entries = Array.from({ length: 15 }, (_, i) => ({
        source: 'console', type: 'log', text: `msg${i}`
      }));
      const result = summarizeEntries(entries, 5);
      assert.equal(result.length, 5);
      assert.equal(result[0].text, 'msg10');
      assert.equal(result[4].text, 'msg14');
    });

    it('failed 字段正确传递', () => {
      const entries = [{ source: 'network', failed: true, text: 'fail' }];
      const result = summarizeEntries(entries, 10);
      assert.equal(result[0].failed, true);
    });
  });

});

// ========== 2. PlaywrightAdapter 类测试 ==========
describe('PlaywrightAdapter 类', () => {
  describe('constructor', () => {
    it('默认选项', () => {
      const adapter = new PlaywrightAdapter();
      assert.ok(adapter.options.headless);
      assert.deepStrictEqual(adapter.options.viewport, { width: 1280, height: 800 });
      assert.equal(adapter.browser, null);
      assert.equal(adapter.page, null);
      assert.deepStrictEqual(adapter.consoleLogs, []);
      assert.deepStrictEqual(adapter.networkLogs, []);
      assert.deepStrictEqual(adapter.pageErrors, []);
    });

    it('自定义选项合并', () => {
      const adapter = new PlaywrightAdapter({ headless: false, viewport: { width: 1920, height: 1080 } });
      assert.equal(adapter.options.headless, false);
      assert.deepStrictEqual(adapter.options.viewport, { width: 1920, height: 1080 });
    });

    it('artifactDir 可自定义', () => {
      const adapter = new PlaywrightAdapter({ artifactDir: '/tmp/test' });
      assert.equal(adapter.artifactDir, '/tmp/test');
    });
  });

  describe('trimLogs', () => {
    it('截断超长日志数组', () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = Array.from({ length: 500 }, () => ({ text: 'x' }));
      adapter.networkLogs = Array.from({ length: 500 }, () => ({ url: 'x' }));
      adapter.pageErrors = Array.from({ length: 200 }, () => ({ text: 'x' }));
      adapter.trimLogs();
      assert.equal(adapter.consoleLogs.length, 300);
      assert.equal(adapter.networkLogs.length, 300);
      assert.equal(adapter.pageErrors.length, 100);
    });

    it('短数组不受影响', () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [{ text: 'a' }, { text: 'b' }];
      adapter.trimLogs();
      assert.equal(adapter.consoleLogs.length, 2);
    });
  });

  describe('errors', () => {
    it('返回所有错误（不含 warning）', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [
        { source: 'console', type: 'error', text: 'err1' },
        { source: 'console', type: 'warning', text: 'warn1' },
        { source: 'console', type: 'log', text: 'log1' }
      ];
      adapter.pageErrors = [{ source: 'pageerror', type: 'error', text: 'page_err' }];
      adapter.networkLogs = [
        { source: 'network', url: 'http://x.com', status: 404 },
        { source: 'network', url: 'http://y.com', status: 200 }
      ];
      const result = await adapter.errors({});
      assert.equal(result.total, 3); // 1 console error + 1 pageerror + 1 network 404
      assert.equal(result.console, 3);
      assert.equal(result.network, 2);
      assert.equal(result.pageError, 1);
    });

    it('includeWarnings 包含 warning', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [
        { source: 'console', type: 'error', text: 'err' },
        { source: 'console', type: 'warning', text: 'warn' }
      ];
      const result = await adapter.errors({ includeWarnings: true });
      assert.equal(result.total, 2);
    });

    it('network failed 请求也包含在错误中', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.networkLogs = [
        { source: 'network', url: 'http://x.com', failed: true, status: undefined }
      ];
      const result = await adapter.errors({});
      assert.equal(result.total, 1);
    });

    it('limit 限制返回条数', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = Array.from({ length: 50 }, (_, i) => ({
        source: 'console', type: 'error', text: `err${i}`
      }));
      const result = await adapter.errors({ limit: 5 });
      assert.equal(result.errors.length, 5);
    });
  });

  describe('errorsClear', () => {
    it('清空所有日志数组并设置 checkpoint', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [{ text: 'a' }];
      adapter.networkLogs = [{ url: 'b' }];
      adapter.pageErrors = [{ text: 'c' }];
      const result = await adapter.errorsClear({});
      assert.equal(result.cleared, true);
      assert.ok(result.checkpoint);
      assert.equal(adapter.consoleLogs.length, 0);
      assert.equal(adapter.networkLogs.length, 0);
      assert.equal(adapter.pageErrors.length, 0);
      assert.ok(adapter.errorCheckpoint);
    });
  });

  describe('artifacts', () => {
    it('返回目录文件列表', async () => {
      const tmpDir = path.join(os.tmpdir(), `vp-art-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'a.png'), 'x');
      fs.writeFileSync(path.join(tmpDir, 'b.json'), 'y');
      const adapter = new PlaywrightAdapter({ artifactDir: tmpDir });
      const result = await adapter.artifacts({});
      assert.equal(result.action, 'artifacts');
      assert.equal(result.dir, tmpDir);
      assert.equal(result.count, 2);
      assert.ok(result.files.length <= 20);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('目录不存在时返回空列表', async () => {
      const adapter = new PlaywrightAdapter({ artifactDir: '/nonexistent/path/xyz' });
      const result = await adapter.artifacts({});
      assert.equal(result.count, 0);
      assert.deepStrictEqual(result.files, []);
    });
  });

  describe('writeArtifact', () => {
    it('写入 JSON 文件并返回路径', () => {
      const tmpDir = path.join(os.tmpdir(), `vp-write-${Date.now()}`);
      const adapter = new PlaywrightAdapter({ artifactDir: tmpDir });
      const filePath = adapter.writeArtifact('test-artifact', { key: 'value' });
      assert.ok(fs.existsSync(filePath));
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(content.key, 'value');
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('runAction', () => {
    it('open 映射到 this.open', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.open = async () => ({ ok: true, action: 'open', url: 'test' });
      const result = await adapter.runAction('open', { url: 'test' });
      assert.equal(result.action, 'open');
    });

    it('navigate 映射到 this.open', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.open = async () => ({ ok: true, action: 'open' });
      const result = await adapter.runAction('navigate', {});
      assert.ok(result.ok);
    });

    it('未知 action 抛出错误', async () => {
      const adapter = new PlaywrightAdapter();
      await assert.rejects(
        () => adapter.runAction('unknown_action', {}),
        /unsupported browser action: unknown_action/
      );
    });

    it('所有已知 action 不抛错', async () => {
      const adapter = new PlaywrightAdapter();
      const actions = ['click', 'type', 'hover', 'scroll', 'press_key', 'wait', 'eval', 'screenshot', 'batch', 'errors', 'errors_clear', 'artifacts', 'summary', 'check', 'collect', 'report'];
      for (const action of actions) {
        // mock 所有方法避免实际浏览器调用
        adapter[action === 'press_key' ? 'pressKey' : action] = async () => ({ ok: true, action });
        if (action === 'summary') adapter.collectEvidenceSummary = async () => ({ console: { count: 0 } });
        if (action === 'check') adapter.checkAction = async () => ({ pass: true });
        if (action === 'collect') adapter.collectAction = async () => ({ collected: {} });
        if (action === 'report') adapter.reportAction = async () => ({ pass: true });
      }
      for (const action of actions) {
        const result = await adapter.runAction(action, {});
        assert.ok(result, `action ${action} should return result`);
      }
    });
  });

  describe('checkAction', () => {
    it('无 selector 无 top errors 时通过', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.page = null; // 无页面，collectEvidenceSummary 返回 null dom
      const result = await adapter.checkAction({ checks: [] });
      assert.equal(result.pass, true);
      assert.equal(result.violations.length, 0);
    });

    it('no_errors 检查发现 top errors 时失败', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.collectEvidenceSummary = async () => ({
        topErrors: [{ text: 'error1' }, { text: 'error2' }]
      });
      const result = await adapter.checkAction({ checks: ['no_errors'] });
      assert.equal(result.pass, false);
      assert.equal(result.violations.length, 1);
      assert.ok(result.violations[0].detail.includes('2 top errors'));
    });

    it('no_top_errors 检查同 no_errors', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.collectEvidenceSummary = async () => ({
        topErrors: [{ text: 'err' }]
      });
      const result = await adapter.checkAction({ checks: ['no_top_errors'] });
      assert.equal(result.pass, false);
    });
  });

  describe('collectAction', () => {
    it('默认收集 console 证据', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [{ source: 'console', text: 'log1' }];
      const result = await adapter.collectAction({});
      assert.ok(result.collected.console);
      assert.equal(result.collected.console.length, 1);
    });

    it('收集指定类型证据', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = [{ source: 'console', text: 'c' }];
      adapter.pageErrors = [{ source: 'pageerror', text: 'p' }];
      adapter.networkLogs = [{ source: 'network', url: 'n' }];
      const result = await adapter.collectAction({ evidence: ['console', 'pageerror', 'network'] });
      assert.ok(result.collected.console);
      assert.ok(result.collected.pageerror);
      assert.ok(result.collected.network);
    });

    it('limit 50 条', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.consoleLogs = Array.from({ length: 100 }, (_, i) => ({ text: `log${i}` }));
      const result = await adapter.collectAction({ evidence: ['console'] });
      assert.equal(result.collected.console.length, 50);
    });
  });

  describe('reportAction', () => {
    it('无 top errors 时 pass', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.collectEvidenceSummary = async () => ({ topErrors: [] });
      const result = await adapter.reportAction({});
      assert.equal(result.pass, true);
      assert.equal(result.summary, 'pass');
    });

    it('有 top errors 时 fail', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.collectEvidenceSummary = async () => ({
        topErrors: [{ text: 'e1' }, { text: 'e2' }]
      });
      const result = await adapter.reportAction({});
      assert.equal(result.pass, false);
      assert.ok(result.summary.includes('2 top errors'));
    });

    it('format 参数传递', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.collectEvidenceSummary = async () => ({ topErrors: [], artifactPath: '/tmp/x.png' });
      const result = await adapter.reportAction({ format: 'long' });
      assert.equal(result.mode, 'long');
      assert.ok(result.artifacts.includes('/tmp/x.png'));
    });
  });

  describe('close', () => {
    it('关闭浏览器并清理引用', async () => {
      const adapter = new PlaywrightAdapter();
      let closed = false;
      adapter.browser = { close: async () => { closed = true; } };
      adapter.page = createMockPage();
      await adapter.close();
      assert.equal(closed, true);
      assert.equal(adapter.browser, null);
      assert.equal(adapter.page, null);
    });

    it('无浏览器时不报错', async () => {
      const adapter = new PlaywrightAdapter();
      await assert.doesNotReject(() => adapter.close());
    });

    it('browser.close 抛错时被 catch', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.browser = { close: async () => { throw new Error('close failed'); } };
      await assert.doesNotReject(() => adapter.close());
      assert.equal(adapter.browser, null);
    });
  });

  describe('collectEvidenceSummary', () => {
    it('无页面时 dom 为 null', async () => {
      const adapter = new PlaywrightAdapter();
      const result = await adapter.collectEvidenceSummary({});
      assert.equal(result.dom, null);
      assert.ok(result.console);
      assert.ok(result.network);
      assert.ok(result.pageerror);
      assert.ok(result.generatedAt);
    });

    it('有页面时返回 dom 摘要', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.browser = {}; // 非 null
      adapter.page = createMockPage({
        evaluate: async (fn) => {
          if (typeof fn === 'function') {
            // 模拟 page.evaluate 在浏览器上下文中执行
            return { url: 'https://x.com', title: 'Test', readyState: 'complete', textSummary: 'text', controls: [], alerts: [] };
          }
          return null;
        }
      });
      const result = await adapter.collectEvidenceSummary({});
      assert.ok(result.dom);
      assert.equal(result.dom.title, 'Test');
    });

    it('domSummary 抛错时 dom 包含 error', async () => {
      const adapter = new PlaywrightAdapter();
      adapter.browser = {};
      adapter.page = createMockPage({
        evaluate: async () => { throw new Error('eval failed'); }
      });
      const result = await adapter.collectEvidenceSummary({});
      assert.ok(result.dom);
      assert.ok(result.dom.error);
    });
  });
});

// ========== 3. PlaywrightAdapter 带 mock page 的方法测试 ==========
describe('PlaywrightAdapter 带浏览器方法', () => {
  let adapter;

  beforeEach(() => {
    adapter = new PlaywrightAdapter();
    // 直接设置 mock page 避免调用 ensurePage（需要真实 playwright）
    adapter.browser = { close: async () => {} };
    adapter.page = createMockPage();
  });

  describe('open', () => {
    it('成功打开 URL', async () => {
      const result = await adapter.open({ url: 'https://example.com' });
      assert.equal(result.ok, true);
      assert.equal(result.action, 'open');
      assert.equal(result.url, 'https://example.com/');
      assert.equal(result.title, 'Test Page');
    });

    it('缺少 url 抛错', async () => {
      await assert.rejects(() => adapter.open({}), /browser open requires url/);
    });
  });

  describe('click', () => {
    it('成功点击', async () => {
      const result = await adapter.click({ selector: '#btn' });
      assert.equal(result.ok, true);
      assert.equal(result.action, 'click');
      assert.equal(result.selector, '#btn');
    });
  });

  describe('type', () => {
    it('成功输入文本', async () => {
      const result = await adapter.type({ selector: '#input', text: 'hello' });
      assert.equal(result.ok, true);
      assert.equal(result.textLength, 5);
    });

    it('text 为 null 时长度为 0', async () => {
      const result = await adapter.type({ selector: '#input' });
      assert.equal(result.textLength, 0);
    });
  });

  describe('wait', () => {
    it('等待 selector', async () => {
      const result = await adapter.wait({ selector: '#el' });
      assert.equal(result.action, 'wait');
      assert.equal(result.selector, '#el');
      assert.equal(result.state, 'visible');
    });

    it('等待指定毫秒', async () => {
      const result = await adapter.wait({ ms: 5000 });
      assert.equal(result.action, 'wait');
      assert.equal(result.ms, 5000);
    });

    it('等待超时上限 10000ms', async () => {
      const result = await adapter.wait({ ms: 50000 });
      assert.equal(result.ms, 10000);
    });

    it('默认等待 domcontentloaded', async () => {
      const result = await adapter.wait({});
      assert.equal(result.action, 'wait');
      assert.equal(result.state, 'domcontentloaded');
    });
  });

  describe('eval', () => {
    it('缺少 expression 抛错', async () => {
      await assert.rejects(() => adapter.eval({}), /eval requires expression/);
    });

    it('执行表达式返回结果', async () => {
      adapter.page = createMockPage({
        evaluate: async (fn, source) => {
          // 模拟 eval 执行
          if (source === '1+1') return 2;
          return null;
        }
      });
      const result = await adapter.eval({ expression: '1+1' });
      assert.equal(result.ok, true);
      assert.equal(result.action, 'eval');
    });
  });

  describe('screenshot', () => {
    it('截图保存到指定路径', async () => {
      const tmpDir = path.join(os.tmpdir(), `vp-shot-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, 'test.png');
      adapter.page = createMockPage({
        screenshot: async (opts) => {
          fs.writeFileSync(opts.path, 'fake');
          return Buffer.from('fake');
        }
      });
      const result = await adapter.screenshot({ path: filePath });
      assert.equal(result.ok, true);
      assert.equal(result.artifactPath, filePath);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('selector 截图', async () => {
      const result = await adapter.screenshot({ selector: '#el' });
      assert.equal(result.ok, true);
    });
  });

  describe('hover', () => {
    it('成功 hover', async () => {
      const result = await adapter.hover({ selector: '#el' });
      assert.equal(result.ok, true);
      assert.equal(result.action, 'hover');
    });
  });

  describe('scroll', () => {
    it('滚动到 selector', async () => {
      const result = await adapter.scroll({ selector: '#el' });
      assert.equal(result.ok, true);
      assert.equal(result.selector, '#el');
    });

    it('滚动指定距离', async () => {
      // scroll 无 selector 时调用 page.evaluate 访问 window，需 mock
      adapter.page = createMockPage({
        evaluate: async () => {} // 不实际执行，避免 window 未定义
      });
      const result = await adapter.scroll({ distance: 500 });
      assert.equal(result.ok, true);
      assert.equal(result.selector, null);
    });
  });

  describe('pressKey', () => {
    it('按键', async () => {
      const result = await adapter.pressKey({ key: 'Enter' });
      assert.equal(result.ok, true);
      assert.equal(result.action, 'press_key');
      assert.equal(result.key, 'Enter');
    });

    it('带 selector 先 focus', async () => {
      const result = await adapter.pressKey({ key: 'Tab', selector: '#input' });
      assert.equal(result.ok, true);
    });
  });

  describe('batch', () => {
    it('批量执行多个步骤', async () => {
      const result = await adapter.batch({
        steps: [
          { action: 'click', args: { selector: '#a' } },
          { action: 'type', args: { selector: '#b', text: 'hi' } }
        ]
      });
      assert.equal(result.action, 'batch');
      assert.equal(result.stepCount, 2);
      assert.ok(result.ok);
      assert.equal(result.results.length, 2);
    });

    it('步骤出错时停止（默认 stopOnError）', async () => {
      adapter.page = createMockPage({
        click: async () => { throw new Error('not found'); }
      });
      const result = await adapter.batch({
        steps: [
          { action: 'click', args: { selector: '#bad' } },
          { action: 'click', args: { selector: '#good' } }
        ]
      });
      assert.equal(result.ok, false);
      assert.equal(result.results.length, 1); // 第一步失败后停止
      assert.equal(result.results[0].ok, false);
    });

    it('stopOnError=false 继续执行', async () => {
      let callCount = 0;
      adapter.page = createMockPage({
        click: async () => {
          callCount++;
          if (callCount === 1) throw new Error('fail');
        }
      });
      const result = await adapter.batch({
        stopOnError: false,
        steps: [
          { action: 'click', args: { selector: '#a' } },
          { action: 'click', args: { selector: '#b' } }
        ]
      });
      assert.equal(result.results.length, 2);
      assert.equal(result.results[0].ok, false);
      assert.equal(result.results[1].ok, true);
    });

    it('空步骤数组', async () => {
      const result = await adapter.batch({ steps: [] });
      assert.equal(result.stepCount, 0);
      assert.equal(result.results.length, 0);
      assert.ok(result.ok); // every([]) = true
    });
  });

  describe('attachListeners', () => {
    it('注册 console/pageerror/response/requestfailed 监听器', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      assert.ok(mockPage._listeners['console']);
      assert.ok(mockPage._listeners['pageerror']);
      assert.ok(mockPage._listeners['response']);
      assert.ok(mockPage._listeners['requestfailed']);
    });

    it('console 监听器记录日志', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      // 模拟 console 事件
      mockPage._listeners['console'][0]({
        type: () => 'error',
        text: () => 'test error',
        location: () => ({ url: 'http://x.com' })
      });
      assert.equal(adapter.consoleLogs.length, 1);
      assert.equal(adapter.consoleLogs[0].type, 'error');
      assert.equal(adapter.consoleLogs[0].text, 'test error');
    });

    it('pageerror 监听器记录错误', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      mockPage._listeners['pageerror'][0]({
        message: 'page error',
        stack: 'stack trace'
      });
      assert.equal(adapter.pageErrors.length, 1);
      assert.equal(adapter.pageErrors[0].text, 'page error');
    });

    it('response 监听器记录 4xx/5xx 响应', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      mockPage._listeners['response'][0]({
        status: () => 404,
        url: () => 'http://x.com/missing',
        request: () => ({ method: () => 'GET' })
      });
      assert.equal(adapter.networkLogs.length, 1);
      assert.equal(adapter.networkLogs[0].status, 404);
    });

    it('response 监听器忽略 2xx 响应', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      mockPage._listeners['response'][0]({
        status: () => 200,
        url: () => 'http://x.com/ok',
        request: () => ({ method: () => 'GET' })
      });
      assert.equal(adapter.networkLogs.length, 0);
    });

    it('requestfailed 监听器记录失败请求', () => {
      const adapter = new PlaywrightAdapter();
      const mockPage = createMockPage();
      adapter.attachListeners(mockPage);
      mockPage._listeners['requestfailed'][0]({
        url: () => 'http://x.com/timeout',
        method: () => 'POST',
        failure: () => ({ errorText: 'net::ERR_TIMEOUT' })
      });
      assert.equal(adapter.networkLogs.length, 1);
      assert.equal(adapter.networkLogs[0].failed, true);
      assert.equal(adapter.networkLogs[0].errorText, 'net::ERR_TIMEOUT');
    });
  });
});

// ========== 4. defaultAdapter 导出测试 ==========
describe('defaultAdapter', () => {
  it('是 PlaywrightAdapter 实例', () => {
    assert.ok(defaultAdapter instanceof PlaywrightAdapter);
  });
});
