'use strict';

const { loadConfig } = require('./config');

function hostMatches(hostname, pattern) {
  const host = String(hostname || '').toLowerCase();
  const rule = String(pattern || '').toLowerCase();
  if (!rule) return false;
  return host === rule || host.endsWith(`.${rule}`);
}

function checkUrl(url, config = loadConfig()) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return { allowed: false, reason: `invalid url: ${error.message}` };
  }

  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
    return { allowed: false, reason: `unsupported protocol: ${parsed.protocol}` };
  }

  if (parsed.protocol === 'file:') {
    // 安全警告：file 协议允许访问本地文件系统
    console.warn('[SECURITY] file:// 协议已启用，允许访问本地文件。请确保目标 URL 来源可信。');
    return { allowed: true, reason: 'file protocol allowed (security warning logged)' };
  }

  const hostname = parsed.hostname;
  if ((config.blockedHosts || []).some(host => hostMatches(hostname, host))) {
    return { allowed: false, reason: `blocked host: ${hostname}` };
  }

  const allowlist = config.allowlist || [];
  if (allowlist.length && !allowlist.some(host => hostMatches(hostname, host))) {
    return { allowed: false, reason: `host not in allowlist: ${hostname}` };
  }

  return { allowed: true, reason: 'allowed' };
}

function safeUrlLog(url) {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.search = parsed.search ? '?…' : '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return String(url || '').slice(0, 200);
  }
}

module.exports = {
  checkUrl,
  safeUrlLog
};
