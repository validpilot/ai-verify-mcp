'use strict';

const { redact } = require('./redaction');

function buildJsonReport(data = {}) {
  return {
    generatedAt: new Date().toISOString(),
    ok: data.ok ?? data.pass ?? data.passed ?? false,
    passed: data.passed ?? data.pass ?? data.ok ?? false,
    summary: data.summary || '',
    data: redact(data.data || data),
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    errors: Array.isArray(data.errors) ? data.errors : []
  };
}

function buildHtmlReport(data = {}) {
  const report = buildJsonReport(data);
  // 使用专业 HTML 报告模块
  try {
    const { buildValidationReportHtml, buildSmokeTestHtml, buildMcpErrorHtml } = require('./report-html');
    if (data.items && Array.isArray(data.items)) {
      // 冒烟测试数据
      return buildSmokeTestHtml(data);
    }
    if (data.error || data.isError) {
      // 错误报告
      return buildMcpErrorHtml(data);
    }
    // 通用验证报告
    const summaryStr = typeof data.summary === 'string' ? data.summary : '';
    const extraFindings = summaryStr ? [{ name: '概要', description: summaryStr, severity: 'info' }] : [];
    return buildValidationReportHtml({
      summary: {
        name: data.name || (summaryStr ? summaryStr.slice(0, 50) : '验证报告'),
        type: data.type || 'general',
        passed: report.passed,
        startedAt: data.startedAt || report.generatedAt,
        endedAt: data.endedAt || report.generatedAt,
        generatedAt: report.generatedAt,
        total: data.total || (data.results?.length || 0),
        passedCount: data.passedCount || (Array.isArray(data.results) ? data.results.filter(r => r.passed).length : 0),
        failedCount: data.failedCount || (Array.isArray(data.results) ? data.results.filter(r => !r.passed).length : 0),
        conclusion: report.passed ? 'PASS' : 'FAIL',
        runId: data.runId || ''
      },
      toolchain: data.toolchain || { browser: 'chromium', tools: [], version: '1.0.0' },
      findings: [...extraFindings, ...(data.findings || data.errors || [])],
      networkEvidence: data.networkEvidence || { totalRequests: 0, errorRequests: 0, errors: [] },
      artifacts: data.artifacts || {},
      unknowns: data.unknowns || { count: 0, items: [] }
    });
  } catch (e) {
    // fallback: 基础 HTML
    return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>ValidPilot Report</title></head>
<body>
  <h1>ValidPilot Report</h1>
  <p>Status: ${report.passed ? 'pass' : 'fail'}</p>
  <p>${escapeHtml(report.summary)}</p>
  <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
</body>
</html>`;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  buildJsonReport,
  buildHtmlReport
};
