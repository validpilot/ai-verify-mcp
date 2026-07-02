'use strict';

/**
 * ValidPilot 专业 HTML 报告生成器
 *
 * 为验证结果、冒烟测试、遮挡检测、反事实分析等
 * 生成现代化、响应式、中文友好的 HTML 报告。
 *
 * 用法:
 *   const { buildValidationReportHtml } = require('./core/report-html');
 *   const html = buildValidationReportHtml(contract);
 */

// ============== CSS 样式 ==============
const CSS = `
/* ===== Reset & Base ===== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f5f7fa;--surface:#fff;--text:#1a1a2e;--text-secondary:#6b7280;--border:#e5e7eb;--primary:#4f46e5;--primary-light:#eef2ff;--success:#059669;--success-bg:#ecfdf5;--warning:#d97706;--warning-bg:#fffbeb;--danger:#dc2626;--danger-bg:#fef2f2;--info:#2563eb;--info-bg:#eff6ff;--radius:12px;--shadow:0 1px 3px rgba(0,0,0,0.1),0 1px 2px rgba(0,0,0,0.06);--shadow-lg:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -2px rgba(0,0,0,0.05)}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--text:#e2e8f0;--text-secondary:#94a3b8;--border:#334155;--primary:#818cf8;--primary-light:#1e1b4b;--success:#34d399;--success-bg:#064e3b;--warning:#fbbf24;--warning-bg:#78350f;--danger:#f87171;--danger-bg:#7f1d1d;--info:#60a5fa;--info-bg:#1e3a5f;--shadow:0 1px 3px rgba(0,0,0,0.3);--shadow-lg:0 10px 15px -3px rgba(0,0,0,0.3)}}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans CJK',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:20px}

/* ===== Layout ===== */
.container{max-width:1100px;margin:0 auto}
.header{background:linear-gradient(135deg,var(--primary) 0%,#7c3aed 100%);color:#fff;padding:32px 40px;border-radius:var(--radius);margin-bottom:24px;box-shadow:var(--shadow-lg)}
.header h1{font-size:28px;font-weight:700;letter-spacing:-0.5px}
.header p{opacity:0.9;font-size:14px;margin-top:4px}
.header .meta{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:13px;opacity:0.85}
.header .meta span{background:rgba(255,255,255,0.15);padding:4px 12px;border-radius:20px}

/* ===== Cards ===== */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:16px;box-shadow:var(--shadow)}
.card h2{font-size:18px;font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary);color:var(--text)}
.card h3{font-size:15px;font-weight:600;margin-bottom:8px;color:var(--text)}

/* ===== Summary Stats ===== */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;box-shadow:var(--shadow)}
.stat-card .stat-value{font-size:32px;font-weight:700;line-height:1.2}
.stat-card .stat-label{font-size:13px;color:var(--text-secondary);margin-top:4px}
.stat-card.pass .stat-value{color:var(--success)}
.stat-card.fail .stat-value{color:var(--danger)}
.stat-card.warning .stat-value{color:var(--warning)}
.stat-card.info .stat-value{color:var(--info)}

/* ===== Progress Bar ===== */
.progress-bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin:12px 0}
.progress-bar .fill{height:100%;border-radius:4px;transition:width 0.6s ease}
.progress-bar .fill.pass{background:var(--success)}
.progress-bar .fill.fail{background:var(--danger)}
.progress-bar .fill.warning{background:var(--warning)}

/* ===== Table ===== */
.table-wrap{overflow-x:auto;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid var(--border);padding:10px 12px;text-align:left;white-space:nowrap}
th{background:var(--primary-light);font-weight:600;color:var(--text)}
tr:hover{background:var(--primary-light)}

/* ===== Badges ===== */
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
.badge.pass{background:var(--success-bg);color:var(--success)}
.badge.fail{background:var(--danger-bg);color:var(--danger)}
.badge.warning{background:var(--warning-bg);color:var(--warning)}
.badge.info{background:var(--info-bg);color:var(--info)}
.badge.blocking{background:var(--danger-bg);color:var(--danger)}
.badge.critical{background:var(--warning-bg);color:var(--warning)}
.badge.general{background:var(--primary-light);color:var(--primary)}
.badge.optimization{background:var(--success-bg);color:var(--success)}

/* ===== Overlay Items ===== */
.overlay-item{border:1px solid var(--border);border-radius:8px;padding:16px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.overlay-item .info{flex:1;min-width:200px}
.overlay-item .info .name{font-weight:600;font-size:14px}
.overlay-item .info .detail{font-size:12px;color:var(--text-secondary);margin-top:2px}
.overlay-item .coverage{font-size:20px;font-weight:700}

/* ===== Finding Items ===== */
.finding-item{border-left:4px solid var(--border);padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;background:var(--bg)}
.finding-item.severity-blocking{border-color:var(--danger)}
.finding-item.severity-critical{border-color:var(--warning)}
.finding-item.severity-general{border-color:var(--primary)}
.finding-item.severity-optimization{border-color:var(--success)}
.finding-item .finding-title{font-weight:600;font-size:14px}
.finding-item .finding-desc{font-size:13px;color:var(--text-secondary);margin-top:4px}

/* ===== Hypothesis Cards ===== */
.hypothesis-card{border:1px solid var(--border);border-radius:8px;padding:16px;margin:8px 0}
.hypothesis-card .conf-bar{height:6px;border-radius:3px;margin:8px 0;background:var(--border)}
.hypothesis-card .conf-bar .fill{height:100%;border-radius:3px}
.hypothesis-card .aspect{font-weight:600;font-size:14px}
.hypothesis-card .conclusion{font-size:13px;margin-top:4px;padding:4px 10px;border-radius:6px;display:inline-block}

/* ===== Collapsible ===== */
.collapsible summary{cursor:pointer;font-weight:600;font-size:15px;padding:8px 0;user-select:none}
.collapsible summary:hover{color:var(--primary)}
.collapsible[open]{padding-bottom:12px}

/* ===== Code ===== */
code{background:var(--bg);padding:2px 6px;border-radius:4px;font-size:13px;font-family:'JetBrains Mono','Fira Code','Consolas',monospace;word-break:break-all}
pre{background:var(--bg);padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;margin:8px 0;border:1px solid var(--border)}

/* ===== Responsive ===== */
@media(max-width:640px){.header{padding:20px}.header h1{font-size:22px}.card{padding:16px}.stats{grid-template-columns:1fr 1fr}}

/* ===== Print ===== */
@media print{body{padding:0;background:#fff;color:#000}.header{background:#4f46e5!important;-webkit-print-color-adjust:exact}.badge{-webkit-print-color-adjust:exact}.progress-bar .fill{-webkit-print-color-adjust:exact}}
`;

// ============== HTML Helper ==============
function h(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapHtml(title, bodyContent) {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${h(title)} - ValidPilot Verify</title><style>${CSS}</style></head>
<body><div class="container">${bodyContent}</div></body></html>`;
}

// ============== 1. 验证报告 ==============
function buildValidationReportHtml(contract = {}) {
  const { summary = {}, findings = [], networkEvidence = {}, artifacts = {}, unknowns = {}, toolchain = {} } = contract;
  const conclusionClass = summary.conclusion === 'PASS' ? 'pass' : summary.conclusion === 'BLOCKING' ? 'fail' : 'warning';
  const conclusionText = summary.conclusion === 'PASS' ? '✅ 通过' : summary.conclusion === 'BLOCKING' ? '🚫 阻塞问题' : '❌ 待修复';
  const sevLabels = { blocking: '阻塞', critical: '严重', general: '一般', optimization: '优化' };

  const passRate = summary.total > 0 ? Math.round((summary.passedCount / summary.total) * 100) : 0;

  const statsHtml = `<div class="stats">
    <div class="stat-card pass"><div class="stat-value">${summary.passedCount ?? 0}</div><div class="stat-label">通过</div></div>
    <div class="stat-card fail"><div class="stat-value">${summary.failedCount ?? 0}</div><div class="stat-label">失败</div></div>
    <div class="stat-card info"><div class="stat-value">${summary.total ?? 0}</div><div class="stat-label">总数</div></div>
    <div class="stat-card ${passRate >= 80 ? 'pass' : passRate >= 50 ? 'warning' : 'fail'}">
      <div class="stat-value">${passRate}%</div><div class="stat-label">通过率</div>
    </div>
  </div>`;

  const progressHtml = `<div class="progress-bar"><div class="fill ${passRate >= 80 ? 'pass' : passRate >= 50 ? 'warning' : 'fail'}" style="width:${passRate}%"></div></div>`;

  const findingRows = findings.map(f => `<div class="finding-item severity-${f.severity || 'general'}">
    <div class="finding-title"><span class="badge ${f.severity || 'general'}">${sevLabels[f.severity] || f.severity}</span> ${h(f.name || f.id || '')}</div>
    <div class="finding-desc">${h(f.description || '')}</div>
  </div>`).join('');

  const netErrRows = networkEvidence.errors?.map(e => `<tr>
    <td><span class="badge ${e.status >= 500 ? 'fail' : e.status >= 400 ? 'warning' : 'info'}">${e.status}</span></td>
    <td>${h(e.method)}</td><td><code>${h(e.url)}</code></td><td>${h(e.type || '')}</td>
  </tr>`).join('') || '';

  const links = [
    ...(artifacts.screenshots || []), ...(artifacts.traces || []),
    ...(artifacts.har || []), ...(artifacts.reports || [])
  ];
  const artLinks = links.map(item => {
    const p = String(item.path || item.filePath || '').replace(/\\/g, '/');
    return `<li><a href="file:///${p}" target="_blank">${h(item.relativePath || item.name || p)}</a></li>`;
  }).join('');

  const unknownItems = unknowns.items?.map(u =>
    `<li><strong>${h(u.name)}</strong>：${h(u.description)}</li>`
  ).join('') || '';

  const findingsSection = findings.length
    ? findingRows
    : '<p style="color:var(--success);font-weight:600">✅ 未发现问题。</p>';

  const netSection = networkEvidence.totalRequests > 0
    ? `<p>总请求数：${networkEvidence.totalRequests}；错误请求：${networkEvidence.errorRequests}</p>
       ${networkEvidence.errors?.length
         ? `<div class="table-wrap"><table><thead><tr><th>状态码</th><th>方法</th><th>URL</th><th>类型</th></tr></thead><tbody>${netErrRows}</tbody></table></div>`
         : '<p style="color:var(--success)">✅ 无网络错误。</p>'}`
    : '<p>无网络记录。</p>';

  const artifactsCount = {
    screenshots: artifacts.screenshots?.length || 0,
    traces: artifacts.traces?.length || 0,
    har: artifacts.har?.length || 0,
    reports: artifacts.reports?.length || 0
  };

  const unknownSection = unknowns.count > 0
    ? `<ul>${unknownItems}</ul><p>待分类数量：${unknowns.count}</p>`
    : '<p>无待分类项。</p>';

  return wrapHtml(`验证报告 - ${summary.name || '未命名'}`, `
    <div class="header">
      <h1>🔍 浏览器验证报告</h1>
      <p>${h(summary.name || '未命名验证')} · ${h(summary.type || '未知类型')}</p>
      <div class="meta">
        <span>结论：<strong>${conclusionText}</strong></span>
        <span>📅 ${h(summary.startedAt || '').replace('T', ' ').slice(0, 19)}</span>
        ${summary.runId ? `<span>🆔 ${h(summary.runId)}</span>` : ''}
      </div>
    </div>

    <div class="card">
      <h2>📊 测试摘要</h2>
      ${statsHtml}
      ${progressHtml}
    </div>

    <div class="card">
      <h2>🔧 工具链</h2>
      <p>浏览器：${h(toolchain.browser || '未知')} ${h(toolchain.version || '')}</p>
      <p>使用工具：${toolchain.tools?.length ? toolchain.tools.map(t => `<code>${h(t)}</code>`).join(' ') : '无记录'}</p>
    </div>

    <div class="card">
      <h2>📋 发现问题 (${findings.length})</h2>
      ${findingsSection}
    </div>

    <div class="card">
      <h2>🌐 网络证据</h2>
      ${netSection}
    </div>

    <div class="card">
      <h2>📎 证据产物</h2>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card info"><div class="stat-value">${artifactsCount.screenshots}</div><div class="stat-label">截图</div></div>
        <div class="stat-card info"><div class="stat-value">${artifactsCount.traces}</div><div class="stat-label">Trace</div></div>
        <div class="stat-card info"><div class="stat-value">${artifactsCount.har}</div><div class="stat-label">HAR</div></div>
        <div class="stat-card info"><div class="stat-value">${artifactsCount.reports}</div><div class="stat-label">报告</div></div>
      </div>
      ${links.length ? `<ul>${artLinks}</ul>` : '<p>无产物。</p>'}
      ${artifacts.logFile ? `<p>📄 日志：<code>${h(artifacts.logFile)}</code></p>` : ''}
    </div>

    <details class="card collapsible">
      <summary>📦 待分类项 (${unknowns.count || 0})</summary>
      ${unknownSection}
    </details>
  `);
}

// ============== 2. 冒烟测试报告 ==============
function buildSmokeTestHtml(results = {}) {
  const { items = [], passed = false, url = '', timestamp = new Date().toISOString() } = results;
  const total = items.length;
  const passedCount = items.filter(i => i.passed !== false).length;
  const passRate = total > 0 ? Math.round((passedCount / total) * 100) : 0;

  const itemRows = items.map(item => {
    const status = item.passed !== false ? 'pass' : 'fail';
    const icon = item.passed !== false ? '✅' : '❌';
    return `<div class="finding-item severity-${item.passed !== false ? 'optimization' : 'blocking'}">
      <div class="finding-title">${icon} <span class="badge ${status}">${status === 'pass' ? '通过' : '失败'}</span> ${h(item.name || item.check || '')}</div>
      ${item.detail ? `<div class="finding-desc">${h(item.detail)}</div>` : ''}
    </div>`;
  }).join('');

  return wrapHtml('冒烟测试报告', `
    <div class="header">
      <h1>🔥 冒烟测试报告</h1>
      <p>${h(url || '未知 URL')}</p>
      <div class="meta">
        <span>结论：<strong class="${passed ? 'pass' : 'fail'}">${passed ? '✅ 通过' : '❌ 存在失败项'}</strong></span>
        <span>📅 ${h(timestamp).replace('T', ' ').slice(0, 19)}</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card pass"><div class="stat-value">${passedCount}</div><div class="stat-label">通过</div></div>
      <div class="stat-card fail"><div class="stat-value">${total - passedCount}</div><div class="stat-label">失败</div></div>
      <div class="stat-card info"><div class="stat-value">${total}</div><div class="stat-label">检查项</div></div>
      <div class="stat-card ${passRate >= 80 ? 'pass' : passRate >= 50 ? 'warning' : 'fail'}">
        <div class="stat-value">${passRate}%</div><div class="stat-label">通过率</div>
      </div>
    </div>

    <div class="progress-bar"><div class="fill ${passRate >= 80 ? 'pass' : passRate >= 50 ? 'warning' : 'fail'}" style="width:${passRate}%"></div></div>

    <div class="card">
      <h2>📋 检查详情</h2>
      ${itemRows}
    </div>

    ${!passed ? `<div class="card" style="border-left:4px solid var(--danger)">
      <h3>💡 建议</h3>
      <p>存在失败的检查项，建议：</p>
      <ul style="margin-top:8px;padding-left:20px">
        <li>使用 <code>browser_counterfactual_analyze</code> 分析根因</li>
        <li>使用 <code>browser_errors</code> 查看页面错误详情</li>
        <li>使用 <code>browser_overlay_detect</code> 检查遮挡物</li>
      </ul>
    </div>` : ''}
  `);
}

// ============== 3. 遮挡检测报告 ==============
function buildOverlayHtml(detection = {}) {
  const { overlays = [], totalCoveragePercent = 0, isBlockingOverlay = false, url = '', timestamp = new Date().toISOString() } = detection;

  const overlayItems = overlays.map(o => {
    const coverageColor = o.coveragePercent >= 50 ? 'var(--danger)' : o.coveragePercent >= 20 ? 'var(--warning)' : 'var(--success)';
    return `<div class="overlay-item">
      <div class="info">
        <div class="name"><code>${h(o.tagName || '')}</code>${o.id ? '#' + h(o.id) : ''}${o.className ? '.' + h(o.className).replace(/ /g, '.') : ''}</div>
        <div class="detail">类型：${h(o.overlayType || '未知')} · 层级(z-index)：${o.zIndex ?? 'auto'} · 定位：${h(o.position || '')} · 透明度：${o.opacity ?? 1}</div>
        <div class="detail">位置：(${o.rect?.x ?? 0}, ${o.rect?.y ?? 0}) ${o.rect?.width ?? 0}×${o.rect?.height ?? 0}</div>
        ${o.text ? `<div class="detail">📝 ${h(o.text).slice(0, 200)}</div>` : ''}
      </div>
      <div class="coverage" style="color:${coverageColor}">${o.coveragePercent ?? 0}%</div>
    </div>`;
  }).join('');

  const statusColor = isBlockingOverlay ? 'var(--danger)' : totalCoveragePercent > 0 ? 'var(--warning)' : 'var(--success)';
  const statusText = isBlockingOverlay ? '⚠️ 存在阻塞遮挡物'
    : totalCoveragePercent > 0 ? 'ℹ️ 存在轻微遮挡'
    : '✅ 无遮挡物';

  return wrapHtml('遮挡检测报告', `
    <div class="header" style="background:linear-gradient(135deg,${isBlockingOverlay ? '#dc2626' : '#059669'} 0%,${isBlockingOverlay ? '#7c3aed' : '#4f46e5'} 100%)">
      <h1>👁️ 遮挡物检测报告</h1>
      <p>${h(url || '未知 URL')}</p>
      <div class="meta">
        <span>${statusText}</span>
        <span>📅 ${h(timestamp).replace('T', ' ').slice(0, 19)}</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card ${isBlockingOverlay ? 'fail' : 'pass'}">
        <div class="stat-value" style="color:${statusColor}">${totalCoveragePercent}%</div>
        <div class="stat-label">总覆盖率</div>
      </div>
      <div class="stat-card info"><div class="stat-value">${overlays.length}</div><div class="stat-label">遮挡物数量</div></div>
    </div>

    <div class="progress-bar"><div class="fill ${isBlockingOverlay ? 'fail' : totalCoveragePercent > 0 ? 'warning' : 'pass'}" style="width:${Math.min(totalCoveragePercent, 100)}%"></div></div>

    <div class="card">
      <h2>📋 遮挡物列表（按覆盖率排序）</h2>
      ${overlays.length ? overlayItems : '<p style="color:var(--success);font-weight:600">✅ 未检测到遮挡物。</p>'}
    </div>

    ${isBlockingOverlay ? `<div class="card" style="border-left:4px solid var(--danger)">
      <h3>💡 建议</h3>
      <ul style="padding-left:20px">
        <li>使用 <code>browser_overlay_dismiss</code> 自动关闭遮挡物</li>
        <li>使用 <code>browser_click</code> 手动点击关闭按钮</li>
        <li>重新截图获取无遮挡的页面快照</li>
      </ul>
    </div>` : ''}
  `);
}

// ============== 4. 反事实分析报告 ==============
function buildCounterfactualHtml(analysis = {}) {
  const { hypotheses = [], pageState = {}, failureContext = '', url = '', timestamp = new Date().toISOString() } = analysis;

  if (!hypotheses || hypotheses.length === 0) {
    return wrapHtml('反事实分析报告', `
      <div class="header"><h1>🧠 反事实根因分析</h1><p>无分析结果</p></div>
      <div class="card"><p>无法生成根因假设，请确认页面是否已加载或提供更详细的失败上下文。</p></div>
    `);
  }

  const pageStateHtml = pageState ? `<div class="card">
    <h2>📊 页面状态快照</h2>
    <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="stat-card info"><div class="stat-value">${pageState.jsErrors ?? 0}</div><div class="stat-label">JS 错误</div></div>
      <div class="stat-card info"><div class="stat-value">${pageState.httpErrors ?? 0}</div><div class="stat-label">HTTP 错误</div></div>
      <div class="stat-card info"><div class="stat-value">${pageState.overlays ?? 0}</div><div class="stat-label">遮挡物</div></div>
      <div class="stat-card info"><div class="stat-value">${pageState.interactiveElements ?? 'N/A'}</div><div class="stat-label">交互元素</div></div>
    </div>
  </div>` : '';

  const hypothesisCards = hypotheses.map((h, i) => {
    const conf = h.confidence ?? 0;
    const confColor = conf >= 0.7 ? 'var(--danger)' : conf >= 0.4 ? 'var(--warning)' : 'var(--success)';
    const confLabel = conf >= 0.7 ? '高置信度' : conf >= 0.4 ? '中置信度' : '低置信度';
    const conclusion = h.counterfactualConclusion || '';

    return `<div class="hypothesis-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div class="aspect">#${i + 1} ${h(h.aspect || h.rootCause || '')}</div>
        <span class="badge ${conf >= 0.7 ? 'fail' : conf >= 0.4 ? 'warning' : 'info'}">${confLabel} (${Math.round(conf * 100)}%)</span>
      </div>
      <div class="conf-bar"><div class="fill" style="width:${conf * 100}%;background:${confColor}"></div></div>
      ${h.reason ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${h(h.reason)}</p>` : ''}
      ${conclusion ? `<div class="conclusion" style="background:${conf >= 0.7 ? 'var(--danger-bg)' : 'var(--info-bg)'};color:${conf >= 0.7 ? 'var(--danger)' : 'var(--info)'}">${h(conclusion)}</div>` : ''}
      ${h.verifyWith ? `<p style="font-size:12px;color:var(--text-secondary);margin-top:8px">🔧 验证工具：<code>${h(h.verifyWith)}</code></p>` : ''}
    </div>`;
  }).join('');

  return wrapHtml('反事实分析报告', `
    <div class="header" style="background:linear-gradient(135deg,#7c3aed 0%,#2563eb 100%)">
      <h1>🧠 反事实根因分析</h1>
      <p>${h(url || '未知 URL')}</p>
      <div class="meta">
        <span>假设数：${hypotheses.length}</span>
        <span>📅 ${h(timestamp).replace('T', ' ').slice(0, 19)}</span>
      </div>
    </div>

    ${failureContext ? `<div class="card" style="border-left:4px solid var(--warning)">
      <h3>📝 失败上下文</h3>
      <p>${h(failureContext)}</p>
    </div>` : ''}

    ${pageStateHtml}

    <div class="card">
      <h2>🎯 根因假设（按置信度排序）</h2>
      ${hypothesisCards}
    </div>

    <div class="card">
      <h3>💡 下一步建议</h3>
      <ul style="padding-left:20px">
        ${hypotheses.slice(0, 2).map(h => h.verifyWith
          ? `<li>使用 <code>${h(h.verifyWith)}</code> 验证 "${h(h.aspect || h.rootCause || '')}"</li>`
          : '').filter(Boolean).join('')}
        <li>修复问题后重新运行测试验证</li>
      </ul>
    </div>
  `);
}

// ============== 5. 通用错误报告 ==============
function buildMcpErrorHtml(errorData = {}) {
  const { error = 'EXECUTION_ERROR', message = '', reason = '', suggestion = '', paidUpgradeHint = '', toolName = '' } = errorData;
  return wrapHtml(`错误 - ${error}`, `
    <div class="header" style="background:linear-gradient(135deg,#dc2626 0%,#9333ea 100%)">
      <h1>❌ 工具执行异常</h1>
      <p>${toolName ? `工具：<code>${h(toolName)}</code>` : ''}</p>
    </div>
    <div class="card" style="border-left:4px solid var(--danger)">
      <h3>${h(error)}</h3>
      <p style="margin-top:8px">${h(message || reason || '')}</p>
    </div>
    ${suggestion ? `<div class="card" style="border-left:4px solid var(--info)">
      <h3>💡 建议</h3>
      <p>${h(suggestion)}</p>
    </div>` : ''}
    ${paidUpgradeHint ? `<div class="card" style="border-left:4px solid var(--warning);background:var(--warning-bg)">
      <h3>⭐ 升级提示</h3>
      <p>${h(paidUpgradeHint)}</p>
    </div>` : ''}
  `);
}

// ============== 6. 通用页面布局 ==============
function buildEmptyHtml(title = 'ValidPilot Verify', subtitle = '') {
  return wrapHtml(title, `
    <div class="header">
      <h1>${h(title)}</h1>
      ${subtitle ? `<p>${h(subtitle)}</p>` : ''}
    </div>
  `);
}

module.exports = {
  buildValidationReportHtml,
  buildSmokeTestHtml,
  buildOverlayHtml,
  buildCounterfactualHtml,
  buildMcpErrorHtml,
  buildEmptyHtml,
  CSS
};
