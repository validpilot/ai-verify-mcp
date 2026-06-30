'use strict';

const SENSITIVE_KEY_RE = /(password|passwd|pwd|token|secret|authorization|cookie|apikey|api_key|api-key|key)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /ark-[A-Za-z0-9-]{20,}/gi,
  /(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi,
  /(token\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi
];

function redactString(value) {
  let text = String(value ?? '');
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    text = text.replace(pattern, match => {
      const prefix = match.match(/^(api[_-]?key\s*[:=]\s*|token\s*[:=]\s*)/i)?.[0] || '';
      return `${prefix}******`;
    });
  }
  return text;
}

function isSensitiveKey(key = '') {
  return SENSITIVE_KEY_RE.test(String(key));
}

function redact(value, key = '') {
  if (value == null) return value;
  if (isSensitiveKey(key)) return '******';
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redact(item));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
}

module.exports = {
  redactString,
  isSensitiveKey,
  redact
};
