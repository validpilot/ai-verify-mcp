'use strict';

// SSH 工具模块（从 mcp-server/scripts/utils/ssh.js 移植）
// 基础设施访问工具，供开源版本使用
// 依赖：ssh2 库

const fs = require('fs');
const path = require('path');
const os = require('os');

let Client = null;
try {
  Client = require('ssh2').Client;
} catch (e) {
  console.warn('[silent:ssh] ssh2 module not installed, backend SSH tools unavailable');
}

/**
 * Default SSH key locations (in priority order).
 * Windows: C:/Users/<user>/.ssh/  |  Linux/macOS: ~/.ssh/
 */
function getDefaultKeyPaths() {
  const home = os.homedir();
  const sshDir = path.join(home, '.ssh');
  return [
    path.join(sshDir, 'id_rsa'),
    path.join(sshDir, 'id_ed25519'),
    path.join(sshDir, 'id_ecdsa'),
    path.join(sshDir, 'id_dsa'),
  ];
}

/**
 * Find the first available private key in default locations.
 * @returns {string|null} Absolute key path, or null if none found
 */
function findDefaultPrivateKey() {
  for (const keyPath of getDefaultKeyPaths()) {
    try {
      const stat = fs.statSync(keyPath);
      if (stat.isFile() && stat.size > 0) return keyPath;
    } catch (e) { /* try next */ }
  }
  return null;
}

/**
 * Build SSH configuration from environment variables + automatic key discovery.
 *
 * Authentication priority:
 *   1. SSH_PASS (password) — if set
 *   2. SSH_PRIVATE_KEY / SSH_KEY_PATH — explicit key path
 *   3. Auto-discovered default key (id_rsa / id_ed25519 / id_ecdsa / id_dsa)
 *   4. ssh-agent via SSH_AUTH_SOCK (if available)
 *
 * Environment variables:
 *   SSH_HOST         - Remote host (default: localhost)
 *   SSH_USER         - SSH username (default: root)
 *   SSH_PASS         - SSH password (optional)
 *   SSH_PRIVATE_KEY  - Inline private key content (multiline OK)
 *   SSH_KEY_PATH     - Explicit path to private key file
 *   SSH_KEY_PASSPHRASE - Passphrase for encrypted keys (optional)
 *   SSH_PORT         - SSH port (default: 22)
 *   SSH_TIMEOUT      - Connection ready timeout in ms (default: 8000)
 */
function getSSHConfig() {
  const config = {
    host: process.env.SSH_HOST || 'localhost',
    port: parseInt(process.env.SSH_PORT, 10) || 22,
    username: process.env.SSH_USER || 'root',
    readyTimeout: parseInt(process.env.SSH_TIMEOUT, 10) || 8000,
  };

  // 1. Password auth
  if (process.env.SSH_PASS) {
    config.password = process.env.SSH_PASS;
    return config;
  }

  // 2. Inline private key
  if (process.env.SSH_PRIVATE_KEY) {
    config.privateKey = process.env.SSH_PRIVATE_KEY;
    if (process.env.SSH_KEY_PASSPHRASE) config.passphrase = process.env.SSH_KEY_PASSPHRASE;
    return config;
  }

  // 3. Explicit key path
  const explicitKey = process.env.SSH_KEY_PATH;
  if (explicitKey && fs.existsSync(explicitKey)) {
    config.privateKey = fs.readFileSync(explicitKey);
    if (process.env.SSH_KEY_PASSPHRASE) config.passphrase = process.env.SSH_KEY_PASSPHRASE;
    return config;
  }

  // 4. Auto-discover default key
  const defaultKey = findDefaultPrivateKey();
  if (defaultKey) {
    try {
      config.privateKey = fs.readFileSync(defaultKey);
      if (process.env.SSH_KEY_PASSPHRASE) config.passphrase = process.env.SSH_KEY_PASSPHRASE;
      return config;
    } catch (e) { /* fall through to agent */ }
  }

  // 5. ssh-agent via SSH_AUTH_SOCK (ssh2 picks this up automatically)
  return config;
}

/**
 * Connect to a remote SSH server.
 * @param {object} [customConfig] - Override default SSH config
 * @param {number} [timeout=12000] - Connection timeout in ms
 * @returns {Promise<Client>} Connected SSH client
 */
function connectSSH(customConfig, timeout = 12000) {
  if (!Client) {
    return Promise.reject(new Error('ssh2 module not installed. Run: npm install ssh2'));
  }
  const config = { ...getSSHConfig(), ...customConfig };
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect(config);
    setTimeout(() => reject(new Error('SSH connection timeout')), timeout);
  });
}

/**
 * Execute a command on a connected SSH client.
 * @param {Client} conn - Connected SSH client
 * @param {string} cmd - Command to execute
 * @param {number} [t=30000] - Timeout in ms
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function sshExec(conn, cmd, t = 30000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', d => stdout += d.toString());
      stream.stderr.on('data', d => stderr += d.toString());
      stream.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    });
    setTimeout(() => reject(new Error('Command execution timeout')), t);
  });
}

/**
 * Escape a shell argument to prevent command injection.
 * Uses single-quote wrapping: 'value' with internal quotes escaped as '\'' 
 * @param {string} s - String to escape
 * @returns {string} Shell-safe quoted string
 */
function escapeShellArg(s) {
  if (s === null || s === undefined) return "''";
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

module.exports = {
  connectSSH,
  sshExec,
  getSSHConfig,
  findDefaultPrivateKey,
  getDefaultKeyPaths,
  escapeShellArg,
  isAvailable: () => !!Client
};
