'use strict';

/**
 * Windows 终端编码修复
 *
 * 解决 PowerShell (GBK) 显示 Node.js UTF-8 输出时中文乱码的问题。
 * 在脚本入口处 require 即可生效。
 *
 * 用法:
 *   require('./core/win-encoding');
 */

if (process.platform === 'win32') {
  try {
    // 切换控制台代码页为 UTF-8
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
  } catch (_) {
    // 静默失败，不影响主流程
  }

  // 设置 stdout/stderr 编码为 utf8（确保 pipe 场景也正确）
  if (process.stdout._handle && process.stdout._handle.setBlocking) {
    process.stdout._handle.setBlocking(true);
  }
  if (process.stderr._handle && process.stderr._handle.setBlocking) {
    process.stderr._handle.setBlocking(true);
  }
}
