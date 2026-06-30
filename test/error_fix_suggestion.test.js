'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

// ============================================================
// Schema 验证
// ============================================================

describe('error_fix_suggestion schema', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'error_fix_suggestion.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'error_fix_suggestion');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 errorSummary 为必填，contextFiles/maxSuggestions 为可选', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'error_fix_suggestion.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.errorSummary, '缺少 errorSummary');
    assert.ok(props.contextFiles, '缺少 contextFiles');
    assert.equal(props.contextFiles.type, 'array');
    assert.ok(props.maxSuggestions, '缺少 maxSuggestions');
    assert.equal(props.maxSuggestions.type, 'number');
    assert.ok(props.file, '缺少 file');
  });
});

// ============================================================
// Handler 存在性验证
// ============================================================

describe('error_fix_suggestion handler', () => {
  test('server.js 包含 error_fix_suggestion 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'error_fix_suggestion'"));
  });

  test('handler 返回 JSON 包含 suggestions/matchedPatterns 字段', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes('suggestions: sortedSuggestions'));
    assert.ok(src.includes('matchedPatterns'));
  });
});

// ============================================================
// 模式匹配逻辑测试（复现 server.js 中的核心逻辑）
// ============================================================

describe('error_fix_suggestion 模式匹配逻辑', () => {
  // 复现 server.js 中的模式定义
  const patterns = [
    {
      name: '404_not_found',
      match: /404|not found|无法找到|找不到资源/i,
      suggestions: [
        { suggestion: '检查URL路径是否正确，注意大小写和拼写', severity: 'critical', confidence: 0.9, verifyAction: '在浏览器中直接访问URL，确认是否返回404', relatedTool: 'browser_open' },
        { suggestion: '检查API路由版本是否匹配', severity: 'general', confidence: 0.7, verifyAction: '查看API文档确认路由版本', relatedTool: 'browser_network' },
        { suggestion: '检查资源引用路径（JS/CSS/图片）', severity: 'general', confidence: 0.6, verifyAction: '使用browser_network检查失败的资源请求', relatedTool: 'browser_network' }
      ]
    },
    {
      name: '401_unauthorized',
      match: /401|unauthorized|未授权|无权限登录|身份验证失败/i,
      suggestions: [
        { suggestion: '检查登录状态是否有效', severity: 'critical', confidence: 0.9, verifyAction: '查看当前页面是否需要重新登录', relatedTool: 'browser_cookies' },
        { suggestion: '检查Token或Cookie是否过期', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_cookies查看认证信息', relatedTool: 'browser_cookies' },
        { suggestion: '重新登录获取有效凭证', severity: 'general', confidence: 0.8, verifyAction: '执行登录操作后重试', relatedTool: 'browser_click' }
      ]
    },
    {
      name: '403_forbidden',
      match: /403|forbidden|禁止访问|访问被拒绝/i,
      suggestions: [
        { suggestion: '检查当前用户角色权限是否足够', severity: 'critical', confidence: 0.85, verifyAction: '确认用户角色与资源权限要求', relatedTool: 'browser_cookies' },
        { suggestion: '检查资源访问控制配置', severity: 'general', confidence: 0.7, verifyAction: '查看服务端权限配置', relatedTool: 'browser_network' }
      ]
    },
    {
      name: '5xx_server_error',
      match: /500|502|503|server error|服务器错误|内部错误|服务不可用/i,
      suggestions: [
        { suggestion: '检查后端服务状态是否正常', severity: 'critical', confidence: 0.9, verifyAction: '查看服务健康检查接口', relatedTool: 'browser_network' },
        { suggestion: '稍后重试，可能是临时故障', severity: 'general', confidence: 0.7, verifyAction: '等待一段时间后重新请求', relatedTool: 'browser_wait' },
        { suggestion: '查看服务端日志获取详细错误信息', severity: 'critical', confidence: 0.8, verifyAction: '检查服务日志排查根因', relatedTool: 'browser_diagnose' }
      ]
    },
    {
      name: 'type_error_undefined',
      match: /TypeError|undefined|Cannot read properties|无法读取属性|类型错误/i,
      suggestions: [
        { suggestion: '等待页面JS加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待页面稳定', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".content-loaded", { timeout: 5000 })' },
        { suggestion: '检查目标元素是否存在于DOM中', severity: 'critical', confidence: 0.8, verifyAction: '使用browser_find_element确认元素存在', relatedTool: 'browser_find_element', suggestedCode: 'const el = document.querySelector(".target-element"); console.log("exists:", !!el)' },
        { suggestion: '检查页面数据是否加载完成', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求确认数据返回', relatedTool: 'browser_network' }
      ]
    },
    {
      name: 'cors_cross_origin',
      match: /CORS|cross-origin|跨域|Access-Control|被CORS策略阻止/i,
      suggestions: [
        { suggestion: '检查API服务端CORS配置', severity: 'critical', confidence: 0.9, verifyAction: '查看响应头Access-Control-Allow-Origin', relatedTool: 'browser_network' },
        { suggestion: '检查请求域名是否在白名单中', severity: 'general', confidence: 0.75, verifyAction: '确认服务端配置的允许源', relatedTool: 'browser_network' },
        { suggestion: '使用代理服务器转发请求', severity: 'general', confidence: 0.6, verifyAction: '配置开发代理绕过CORS限制', relatedTool: 'browser_network', suggestedCode: '// dev proxy config\nmodule.exports = { devServer: { proxy: { "/api": { target: "http://localhost:3000" } } } }' }
      ]
    },
    {
      name: 'timeout',
      match: /timeout|timed out|ETIMEDOUT|超时|请求超时/i,
      suggestions: [
        { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.85, verifyAction: '访问其他网站确认网络状态', relatedTool: 'browser_open' },
        { suggestion: '增加请求超时时间', severity: 'general', confidence: 0.8, verifyAction: '调整超时参数后重试', relatedTool: 'browser_wait', suggestedCode: 'await page.goto(url, { timeout: 30000 })' },
        { suggestion: '检查服务端响应速度是否正常', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求耗时分布', relatedTool: 'browser_network' }
      ]
    },
    {
      name: 'element_not_found',
      match: /element not found|no element matched|找不到元素|元素不存在|没有匹配的元素/i,
      suggestions: [
        { suggestion: '检查选择器拼写是否正确', severity: 'critical', confidence: 0.9, verifyAction: '使用browser_dom验证选择器', relatedTool: 'browser_dom' },
        { suggestion: '等待元素加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待元素出现', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".target-element", { timeout: 10000 })' },
        { suggestion: '使用browser_find_element查找元素', severity: 'general', confidence: 0.8, verifyAction: '调用browser_find_element确认元素位置', relatedTool: 'browser_find_element' }
      ]
    },
    {
      name: 'element_not_visible',
      match: /element not visible|not interactable|不可见|不可交互|元素被遮挡/i,
      suggestions: [
        { suggestion: '滚动到元素位置使其可见', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_scroll滚动到元素', relatedTool: 'browser_scroll', suggestedCode: 'await element.scrollIntoView({ behavior: "smooth", block: "center" })' },
        { suggestion: '检查元素是否被其他元素遮挡', severity: 'general', confidence: 0.7, verifyAction: '截图查看元素实际显示状态', relatedTool: 'browser_screenshot' },
        { suggestion: '等待页面动画或过渡完成', severity: 'general', confidence: 0.75, verifyAction: '使用browser_wait等待动画结束', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForTimeout(1000) // 等待动画结束' }
      ]
    },
    {
      name: 'disabled_readonly',
      match: /disabled|readonly|只读|禁用|不可编辑/i,
      suggestions: [
        { suggestion: '检查表单验证条件是否满足', severity: 'critical', confidence: 0.8, verifyAction: '查看表单字段的启用条件', relatedTool: 'browser_diagnose' },
        { suggestion: '检查前置输入是否满足要求', severity: 'general', confidence: 0.7, verifyAction: '确认依赖字段是否已正确填写', relatedTool: 'browser_click' }
      ]
    },
    {
      name: 'network_error_fetch',
      match: /NetworkError|Failed to fetch|网络错误|获取失败|连接失败/i,
      suggestions: [
        { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.9, verifyAction: '访问其他网站确认网络连通性', relatedTool: 'browser_open' },
        { suggestion: '检查API服务是否可用', severity: 'critical', confidence: 0.85, verifyAction: '直接访问API地址确认服务状态', relatedTool: 'browser_network' },
        { suggestion: '检查请求格式是否正确', severity: 'general', confidence: 0.7, verifyAction: '核对请求参数和格式要求', relatedTool: 'browser_network' }
      ]
    }
  ];

  const defaultSuggestions = [
    { suggestion: '使用browser_errors查看完整错误详情', severity: 'general', confidence: 0.7, verifyAction: '调用browser_errors获取完整错误列表', relatedTool: 'browser_errors' },
    { suggestion: '检查浏览器控制台输出', severity: 'general', confidence: 0.6, verifyAction: '使用browser_console查看控制台日志', relatedTool: 'browser_console' },
    { suggestion: '使用browser_diagnose进行综合诊断', severity: 'general', confidence: 0.5, verifyAction: '调用browser_diagnose获取页面健康报告', relatedTool: 'browser_diagnose' }
  ];

  function generateSuggestions(errorSummary, maxSuggestions = 3) {
    const errorText = typeof errorSummary === 'string' ? errorSummary : JSON.stringify(errorSummary);
    const lowerText = errorText.toLowerCase();
    const matchedPatterns = [];
    let allSuggestions = [];

    for (const pattern of patterns) {
      if (pattern.match.test(lowerText)) {
        matchedPatterns.push(pattern.name);
        allSuggestions = allSuggestions.concat(pattern.suggestions);
      }
    }

    if (matchedPatterns.length === 0) {
      allSuggestions = defaultSuggestions;
    }

    return {
      errorSummary,
      matchedPatterns,
      suggestions: allSuggestions.sort((a, b) => b.confidence - a.confidence).slice(0, maxSuggestions),
      totalSuggestions: Math.min(allSuggestions.length, maxSuggestions)
    };
  }

  test('匹配 404 错误', () => {
    const result = generateSuggestions('GET /api/user 404 Not Found');
    assert.ok(result.matchedPatterns.includes('404_not_found'), '应匹配 404_not_found');
    assert.ok(result.suggestions.length > 0, '应返回建议');
    assert.ok(result.suggestions[0].confidence > 0, '建议应有置信度');
    assert.ok(result.suggestions[0].suggestion.includes('URL'), '应包含 URL 相关建议');
  });

  test('匹配 401 unauthorized 错误', () => {
    const result = generateSuggestions('401 Unauthorized - invalid token');
    assert.ok(result.matchedPatterns.includes('401_unauthorized'));
    assert.ok(result.suggestions.length > 0);
  });

  test('匹配 403 forbidden 错误', () => {
    const result = generateSuggestions('403 Forbidden - access denied');
    assert.ok(result.matchedPatterns.includes('403_forbidden'));
    assert.ok(result.suggestions.length > 0);
  });

  test('匹配 5xx 服务器错误', () => {
    const result = generateSuggestions('500 Internal Server Error');
    assert.ok(result.matchedPatterns.includes('5xx_server_error'));
    assert.ok(result.suggestions.some(s => s.relatedTool === 'browser_network'));
  });

  test('匹配 TypeError/undefined 错误', () => {
    const result = generateSuggestions('TypeError: Cannot read properties of undefined');
    assert.ok(result.matchedPatterns.includes('type_error_undefined'));
  });

  test('匹配 CORS 错误', () => {
    const result = generateSuggestions('Access-Control-Allow-Origin: CORS error');
    assert.ok(result.matchedPatterns.includes('cors_cross_origin'));
  });

  test('匹配超时错误', () => {
    const result = generateSuggestions('timeout of 30000ms exceeded');
    assert.ok(result.matchedPatterns.includes('timeout'));
  });

  test('匹配 element not found 错误', () => {
    const result = generateSuggestions('element not found: #submit-btn');
    assert.ok(result.matchedPatterns.includes('element_not_found'));
  });

  test('匹配 element not visible 错误', () => {
    const result = generateSuggestions('element not visible or not interactable');
    assert.ok(result.matchedPatterns.includes('element_not_visible'));
  });

  test('匹配 disabled/readonly 错误', () => {
    const result = generateSuggestions('element is disabled');
    assert.ok(result.matchedPatterns.includes('disabled_readonly'));
  });

  test('匹配 NetworkError/fetch 错误', () => {
    const result = generateSuggestions('Failed to fetch /api/data');
    assert.ok(result.matchedPatterns.includes('network_error_fetch'));
  });

  test('中文错误匹配 - 404', () => {
    const result = generateSuggestions('找不到资源 /api/user');
    assert.ok(result.matchedPatterns.includes('404_not_found'));
  });

  test('中文错误匹配 - 未授权', () => {
    const result = generateSuggestions('未授权访问，请先登录');
    assert.ok(result.matchedPatterns.includes('401_unauthorized'));
  });

  test('中文错误匹配 - 服务器错误', () => {
    const result = generateSuggestions('服务器错误，请稍后重试');
    assert.ok(result.matchedPatterns.includes('5xx_server_error'));
  });

  test('无匹配时返回默认建议', () => {
    const result = generateSuggestions('some unknown error message');
    assert.equal(result.matchedPatterns.length, 0, '不应匹配任何模式');
    assert.ok(result.suggestions.length > 0, '应返回默认建议');
    assert.ok(result.suggestions[0].suggestion.includes('browser_errors'));
  });

  test('限制建议数量（maxSuggestions=2）', () => {
    const result = generateSuggestions('404 Not Found', 2);
    assert.ok(result.suggestions.length <= 2);
    assert.equal(result.totalSuggestions, 2);
  });

  test('错误摘要为对象时能正常处理', () => {
    const result = generateSuggestions({ message: '404 Not Found', code: 'NOT_FOUND' });
    assert.ok(result.matchedPatterns.includes('404_not_found'));
  });

  test('建议按置信度降序排列', () => {
    const result = generateSuggestions('500 Internal Server Error');
    for (let i = 1; i < result.suggestions.length; i++) {
      assert.ok(result.suggestions[i - 1].confidence >= result.suggestions[i].confidence,
        `建议应按置信度降序排列: ${result.suggestions[i - 1].confidence} < ${result.suggestions[i].confidence}`);
    }
  });

  test('每个建议都有 suggestion/severity/confidence/verifyAction/relatedTool 字段', () => {
    const result = generateSuggestions('TypeError: undefined');
    for (const s of result.suggestions) {
      assert.ok(s.suggestion, '缺少 suggestion');
      assert.ok(s.severity, '缺少 severity');
      assert.ok(typeof s.confidence === 'number', 'confidence 应为数字');
      assert.ok(s.verifyAction, '缺少 verifyAction');
      assert.ok(s.relatedTool, '缺少 relatedTool');
    }
  });
});
