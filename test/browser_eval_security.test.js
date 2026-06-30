'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * 检测表达式中的潜在恶意模式
 * （与 server.js 中的 detectMaliciousPatterns 保持同步）
 */
function detectMaliciousPatterns(expression) {
  const patterns = [
    // SQL 注入
    { regex: /\bdrop\s+table\b/i, category: 'SQL注入', detail: 'DROP TABLE' },
    { regex: /\binsert\s+into\b/i, category: 'SQL注入', detail: 'INSERT INTO' },
    { regex: /\bdelete\s+from\b/i, category: 'SQL注入', detail: 'DELETE FROM' },
    { regex: /\bupdate\s+\w+\s+set\b/i, category: 'SQL注入', detail: 'UPDATE ... SET' },
    { regex: /\bselect\b.+\bfrom\b/i, category: 'SQL注入', detail: 'SELECT ... FROM' },
    { regex: /\bunion\s+(all\s+)?select\b/i, category: 'SQL注入', detail: 'UNION SELECT' },
    { regex: /\btruncate\s+(table\s+)?\w+/i, category: 'SQL注入', detail: 'TRUNCATE TABLE' },
    // XSS
    { regex: /<script\b/i, category: 'XSS', detail: '<script> 标签' },
    { regex: /\bonerror\s*=/i, category: 'XSS', detail: 'onerror=' },
    { regex: /\bonload\s*=/i, category: 'XSS', detail: 'onload=' },
    { regex: /\bjavascript\s*:/i, category: 'XSS', detail: 'javascript:' },
    { regex: /\bdocument\.cookie\b/i, category: 'XSS', detail: 'document.cookie' },
    { regex: /\blocalStorage\b/i, category: 'XSS', detail: 'localStorage' },
    { regex: /\bsessionStorage\b/i, category: 'XSS', detail: 'sessionStorage' },
    { regex: /\binnerHTML\b/i, category: 'XSS', detail: 'innerHTML' },
    { regex: /\bouterHTML\b/i, category: 'XSS', detail: 'outerHTML' },
    // 原型污染
    { regex: /__proto__/i, category: '原型污染', detail: '__proto__' },
    { regex: /\bconstructor\s*\.\s*prototype\b/i, category: '原型污染', detail: 'constructor.prototype' },
    { regex: /\bObject\s*\.\s*prototype\b/i, category: '原型污染', detail: 'Object.prototype' },
    // 路径遍历
    { regex: /\.\.\//, category: '路径遍历', detail: '../' },
    { regex: /\.\.\\/, category: '路径遍历', detail: '..\\' },
    // 命令注入
    { regex: /\bchild_process\b/i, category: '命令注入', detail: 'child_process' },
    { regex: /\bexecSync\b/i, category: '命令注入', detail: 'execSync' },
    { regex: /\brequire\s*\(/i, category: '命令注入', detail: 'require(' },
    { regex: /\bimport\s*\(/i, category: '命令注入', detail: 'import(' },
  ];

  for (const { regex, category, detail } of patterns) {
    if (regex.test(expression)) {
      return { patternType: category, details: detail };
    }
  }
  return null;
}

// ============ SQL 注入检测（3 个） ============

test('browser_eval 安全 - 拒绝 DROP TABLE', () => {
  const result = detectMaliciousPatterns('DROP TABLE users');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'SQL注入');
});

test('browser_eval 安全 - 拒绝 INSERT INTO', () => {
  const result = detectMaliciousPatterns("INSERT INTO users VALUES ('hacker')");
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'SQL注入');
});

test('browser_eval 安全 - 拒绝 UNION SELECT', () => {
  const result = detectMaliciousPatterns('UNION SELECT password FROM admin');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'SQL注入');
});

// ============ XSS 检测（3 个） ============

test('browser_eval 安全 - 拒绝 <script> 标签', () => {
  const result = detectMaliciousPatterns('<script>alert("xss")</script>');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'XSS');
});

test('browser_eval 安全 - 拒绝 document.cookie', () => {
  const result = detectMaliciousPatterns('document.cookie = "steal"');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'XSS');
});

test('browser_eval 安全 - 拒绝 innerHTML', () => {
  const result = detectMaliciousPatterns('el.innerHTML = "<img src=x onerror=alert(1)>"');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, 'XSS');
});

// ============ 原型污染检测（1 个） ============

test('browser_eval 安全 - 拒绝 __proto__ 原型污染', () => {
  const result = detectMaliciousPatterns('obj.__proto__.isAdmin = true');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, '原型污染');
});

// ============ 路径遍历检测（1 个） ============

test('browser_eval 安全 - 拒绝 ../ 路径遍历', () => {
  const result = detectMaliciousPatterns('fetch("../../../etc/passwd")');
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, '路径遍历');
});

// ============ 命令注入检测（1 个） ============

test('browser_eval 安全 - 拒绝 require( 命令注入', () => {
  const result = detectMaliciousPatterns("require('child_process').exec('rm -rf /')");
  assert.ok(result, '应检测到恶意模式');
  assert.equal(result.patternType, '命令注入');
});

// ============ 正常表达式放行（2 个） ============

test('browser_eval 安全 - 放行 document.querySelector 正常点击', () => {
  const result = detectMaliciousPatterns("document.querySelector('#btn').click()");
  assert.equal(result, null, '正常表达式不应被拦截');
});

test('browser_eval 安全 - 放行 querySelectorAll 计数', () => {
  const result = detectMaliciousPatterns("() => ({ count: document.querySelectorAll('img').length })");
  assert.equal(result, null, '正常表达式不应被拦截');
});
