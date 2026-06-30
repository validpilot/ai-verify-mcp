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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlReport(data = {}) {
  const report = buildJsonReport(data);
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

module.exports = {
  buildJsonReport,
  buildHtmlReport
};
