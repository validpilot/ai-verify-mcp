/**
 * 独立验证脚本：测试 browser_full_regression 是否能捕获 403
 * 模拟阶段 3.5 的 select 独立测试逻辑
 * 
 * 原理：SelectChange → StateChange → NewAPIRequests → PermissionErrors(4xx)
 * 
 * 使用方式：cd .trae\ai-verify-mcp && node test_403.js
 */

const { chromium } = require('playwright');

const TARGET_URL = 'http://192.168.8.4:5173/app.html';

async function main() {
  console.log('=== 403 捕获验证脚本 ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 注册 CDP 监听
  const cdpSession = await context.newCDPSession(page).catch(() => null);
  const errors = { console: [], network: [] };

  if (cdpSession) {
    await cdpSession.send('Network.enable');
    await cdpSession.send('Runtime.enable');

    cdpSession.on('Network.responseReceived', params => {
      const { response } = params;
      if (response.status >= 400) {
        errors.network.push({ url: response.url, status: response.status });
        console.log(`  [CDP] ${response.status} ${response.url}`);
      }
    });

    cdpSession.on('Runtime.consoleAPICalled', params => {
      const msg = params.args.map(a => a.value).join(' ');
      if (/403|forbidden|429|5\d{2}|error/i.test(msg)) {
        errors.console.push(msg);
        console.log(`  [Console] ${msg}`);
      }
    });
  }

  // 注入 JS 拦截器
  await page.addInitScript(() => {
    const origFetch = window.fetch;
    window.fetch = function(...args) {
      return origFetch.apply(this, args).then(resp => {
        if (resp.status >= 400) {
          if (!window.__intercepted) window.__intercepted = [];
          window.__intercepted.push({ url: resp.url, status: resp.status, method: 'fetch' });
        }
        return resp;
      });
    };
  });

  console.log('1. 访问首页...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('   页面加载完成\n');

  // 测试每个角色 select 选项
  const roles = [
    { text: '商家管理员', value: 'merchant_admin', expect: '商家数据' },
    { text: '商家员工', value: 'merchant_staff', expect: '受限' },
    { text: '销售人员', value: 'sales', expect: '销售数据' },
    { text: '达人', value: 'creator', expect: '达人数据' },
    { text: '服务商预览', value: 'service_provider', expect: '服务商' },
    { text: '平台管理预览', value: 'platform_admin', expect: '平台管理' },
  ];

  for (const role of roles) {
    console.log(`2. 测试角色: ${role.text} (${role.value})`);
    
    // 每个角色前等待 3 秒，避免触发限流
    await page.waitForTimeout(3000);

    // 重置到首页基线
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // 清空错误记录
    const preCount = errors.network.length + errors.console.length;
    if (cdpSession) {
      errors.console = [];
      errors.network = [];
    }

    // 选中角色
    try {
      await page.selectOption('#roleSelect', role.value);
      console.log(`   选中成功`);
    } catch (e) {
      console.log(`   选中失败: ${e.message}`);
      continue;
    }

    // 等待 network idle + 额外延迟
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch (_) {}
    await page.waitForTimeout(2000);

    // 读取 JS 拦截器数据
    const intercepted = await page.evaluate(() => {
      const items = window.__intercepted || [];
      return items;
    }).catch(() => []);

    // Performance API 扫描
    const perfErrors = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(e => e.responseStatus >= 400)
        .map(e => ({ url: e.name, status: e.responseStatus }));
    }).catch(() => []);

    const allErrors = [
      ...errors.network.map(e => ({ ...e, source: 'cdp' })),
      ...perfErrors.map(e => ({ ...e, source: 'perf' })),
      ...intercepted.map(e => ({ url: e.url, status: e.status, source: 'js' })),
    ];

    // 去重
    const seen = new Set();
    const unique = allErrors.filter(e => {
      const key = `${e.status}:${e.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 检测错误模式
    const has403 = unique.some(e => e.status === 403);
    const has429 = unique.some(e => e.status === 429);
    const has5xx = unique.some(e => e.status >= 500);
    const consoleErrors = errors.console.length;

    if (unique.length > 0) {
      console.log(`   检测到 ${unique.length} 个网络错误:`);
      for (const e of unique) {
        console.log(`     [${e.source}] ${e.status} ${e.url}`);
      }
    }
    if (consoleErrors > 0) {
      console.log(`   检测到 ${consoleErrors} 个控制台错误:`);
      for (const msg of errors.console) {
        console.log(`     ${msg}`);
      }
    }

    if (has403) console.log(`   >>> 发现 403 权限拒绝!`);
    if (has429) console.log(`   >>> 发现 429 限流`);
    if (has5xx) console.log(`   >>> 发现 5xx 服务端错误`);

    console.log('');
  }

  console.log('=== 验证完成 ===');
  
  // 最终统计
  const finalErrors = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(e => e.responseStatus >= 400)
      .map(e => ({ url: e.name, status: e.responseStatus }));
  }).catch(() => []);

  const final403 = finalErrors.filter(e => e.status === 403);
  const final429 = finalErrors.filter(e => e.status === 429);
  const final5xx = finalErrors.filter(e => e.status >= 500);

  console.log(`\n最终统计：`);
  console.log(`  403 (权限拒绝): ${final403.length}`);
  console.log(`  429 (限流): ${final429.length}`);
  console.log(`  5xx (服务端错误): ${final5xx.length}`);

  for (const e of final403) {
    console.log(`    [403] ${e.url}`);
  }

  await browser.close();
}

main().catch(err => {
  console.error('脚本出错:', err);
  process.exit(1);
});
