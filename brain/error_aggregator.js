'use strict';

const { truncate } = require('../engines/playwright_adapter');

const ERROR_PATTERNS = [
  // 原有基础错误模式
  { pattern: /ResizeObserver loop limit exceeded/i, severity: 'warning', category: 'layout', suggestion: '页面存在频繁重排（reflow），检查ResizeObserver回调中的DOM修改操作', affectedTarget: 'CSS布局' },
  { pattern: /Failed to load resource: net::ERR_CONNECTION_REFUSED/i, severity: 'error', category: 'network', suggestion: '后端API服务不可达或未启动，请确认后端服务状态和网络连通性', affectedTarget: '网络请求' },
  { pattern: /MaxListenersExceededWarning/i, severity: 'warning', category: 'memory', suggestion: 'EventEmitter监听器超限，可能存在内存泄漏，检查事件监听器的添加/移除配对', affectedTarget: '事件系统' },
  { pattern: /Cannot read propert(y|ies) of undefined/i, severity: 'error', category: 'runtime', suggestion: '异步数据尚未就绪时尝试访问属性，请添加可选链(?.)或空值检查', affectedTarget: '数据状态' },
  { pattern: /(403 Forbidden|401 Unauthorized)/i, severity: 'error', category: 'network', suggestion: '请求被拒绝(403/401)，请检查认证凭据(API Key/Token)是否有效或权限是否充足', affectedTarget: '认证' },
  { pattern: /Failed to execute 'removeChild' on 'Node'/i, severity: 'error', category: 'dom', suggestion: 'DOM节点操作冲突，常见于React/框架水合(hydration)不匹配，请检查SSR输出与客户端渲染的一致性', affectedTarget: 'DOM操作' },
  { pattern: /Hydration failed/i, severity: 'error', category: 'framework', suggestion: '服务端渲染(SSR)与客户端水合不一致，请检查useEffect/useLayoutEffect中的状态初始化', affectedTarget: 'SSR Hydration' },
  { pattern: /CORS policy.*No 'Access-Control-Allow-Origin'/i, severity: 'error', category: 'network', suggestion: '跨域请求被拦截(CORS)，请在服务端配置Access-Control-Allow-Origin头或使用代理', affectedTarget: '跨域' },
  { pattern: /Mixed Content:/i, severity: 'warning', category: 'security', suggestion: 'HTTPS页面加载了HTTP资源(Mixed Content)，请将所有资源URL升级为HTTPS', affectedTarget: '安全' },
  { pattern: /WebSocket connection.*failed/i, severity: 'error', category: 'network', suggestion: 'WebSocket连接失败，请检查WebSocket服务状态和网络代理设置', affectedTarget: 'WebSocket' },
];

function classifyError(item = {}) {
  const text = item.text || item.message || item.errorText || item.stack || '';
  const url = item.url || '';
  const combined = `${text} ${url}`;
  for (const pat of ERROR_PATTERNS) {
    if (pat.pattern.test(combined)) {
      return {
        category: pat.category,
        suggestion: pat.suggestion,
        affectedTarget: pat.affectedTarget,
        matchedPattern: pat.pattern.source
      };
    }
  }
  return null;
}

function collectRawErrors(input = {}) {
  const sources = [];
  const push = (source, records = []) => {
    if (!Array.isArray(records)) return;
    for (const item of records) sources.push({ source, ...item });
  };

  push('console', input.console?.recent || input.consoleErrors || input.consoleLogs || input.console || []);
  push('network', input.network?.recent || input.networkErrors || input.networkLogs || input.network || []);
  push('silentFail', input.silentFailErrors || []);
  push('pageerror', input.pageerror?.recent || input.pageErrors || input.pageerror || []);
  push('mcp', input.mcpErrors || []);

  if (input.evidence) sources.push(...collectRawErrors(input.evidence));
  if (input.errors) sources.push(...collectRawErrors(input.errors));
  return sources;
}

function severityOf(item = {}) {
  // CRITICAL: Page-level runtime errors (blocks everything)
  if (item.source === 'pageerror') return 4;
  if (item.failed || Number(item.status || 0) >= 500) return 3;
  
  // HIGH: Silent failures - HTTP 2xx/3xx with error body, or 4xx on critical resources
  if (item.source === 'silentFail') return 3;
  
  // HIGH: 404 on critical resources (JS/CSS that app needs)
  if (Number(item.status || 0) >= 400 && 
      (item.url || '').match(/\.(js|css|jsx|tsx|wasm)($|\?)/i)) {
    return 2;
  }
  
  // MEDIUM: Other 404s (images, fonts, optional resources)
  if (Number(item.status || 0) >= 400) return 1;
  
  if (['error', 'assert'].includes(String(item.type || '').toLowerCase())) return 2;
  if (['warning', 'warn'].includes(String(item.type || '').toLowerCase())) return 1;
  return 0;
}

function signatureOf(item = {}) {
  const status = item.status ? ` ${item.status}` : '';
  const url = item.url ? ` ${String(item.url).replace(/[?#].*$/, '')}` : '';
  const text = item.text || item.message || item.errorText || item.stack || '';
  return `${item.source || 'unknown'}${status}${url} ${String(text).replace(/\d{3,}/g, '#').slice(0, 180)}`.trim();
}

function aggregateErrors(input = {}, options = {}) {
  const raw = collectRawErrors(input).filter(item => severityOf(item) > 0 || item.failed || item.status >= 400);
  const grouped = new Map();
  for (const item of raw) {
    const sig = signatureOf(item);
    const existing = grouped.get(sig) || { signature: sig, count: 0, severity: 0, examples: [] };
    existing.count += 1;
    existing.severity = Math.max(existing.severity, severityOf(item));
    if (existing.examples.length < 2) existing.examples.push({
      source: item.source,
      type: item.type,
      status: item.status,
      method: item.method,
      url: item.url,
      text: truncate(item.text || item.message || item.errorText || item.stack || '', 260),
      timestamp: item.timestamp
    });
    grouped.set(sig, existing);
  }

  const topErrors = Array.from(grouped.values())
    .sort((a, b) => (b.severity - a.severity) || (b.count - a.count))
    .slice(0, options.limit || 5);

  // 对每个 topError 进行模式分类，附加 category/suggestion/affectedTarget
  for (const error of topErrors) {
    const example = error.examples?.[0];
    const classification = classifyError(example || error);
    if (classification) {
      error.category = classification.category;
      error.suggestion = classification.suggestion;
      error.affectedTarget = classification.affectedTarget;
    }
  }

  const totalCount = raw.length;
  const uniqueCount = grouped.size;
  const summary = buildSummary(topErrors, uniqueCount, totalCount);

  return { topErrors, summary, uniqueCount, totalCount };
}

function buildSummary(topErrors, uniqueCount, totalCount) {
  const lines = [
    '## Error Summary',
    `- Status: ${topErrors.length ? 'fail' : 'pass'}`,
    `- Errors: total=${totalCount}, unique=${uniqueCount}`,
    '- Top errors:'
  ];
  if (!topErrors.length) lines.push('  - none');
  for (const error of topErrors.slice(0, 5)) {
    const example = error.examples?.[0] || {};
    lines.push(`  - [${error.count}x/S${error.severity}] ${truncate(error.signature, 160)}`);
    if (example.url) lines.push(`    - url: ${truncate(example.url, 120)}`);
  }
  const md = lines.join('\n');
  return md.length > 500 ? `${md.slice(0, 497)}...` : md;
}

function errorSummaryMd(input = {}, options = {}) {
  const evidence = input.evidence || input;
  const aggregation = evidence.errorAggregation || input.errorAggregation;
  if (aggregation && !input.topErrors) {
    const topErrors = (aggregation.topPatterns || []).map(item => ({
      signature: item.pattern,
      count: item.count || 1,
      severity: 2,
      examples: [{ source: 'aggregate', text: item.pattern }]
    }));
    return buildSummary(topErrors, topErrors.length, aggregation.totalErrors || 0);
  }
  const aggregated = input.topErrors ? input : aggregateErrors(input, options);
  return aggregated.summary || buildSummary(aggregated.topErrors || [], aggregated.uniqueCount || 0, aggregated.totalCount || 0);
}

module.exports = {
  aggregateErrors,
  errorSummaryMd,
  collectRawErrors,
  classifyError,
  ERROR_PATTERNS
};
