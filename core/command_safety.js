'use strict';

// 命令安全检查模块（从 mcp-server/core/command_safety.js 移植）
// 红线/黄线/绿线 行为规则 + 环境感知（DEV/STAGING/PROD）
// 红线永远禁止，黄线 DEV 允许+审计/非 DEV 拒绝，绿线允许

// 红线命令模式（永远不允许，即使 Agent 主动尝试）
const RED_LINE_PATTERNS = [
  // 递归删除根目录
  { pattern: /rm\s+-rf?\s+\/(\s|$)/, reason: 'rm -rf / 递归删除根目录' },
  { pattern: /rm\s+-rf?\s+\/\*/, reason: 'rm -rf /* 递归删除根目录' },
  { pattern: /rm\s+-rf?\s+~/, reason: 'rm -rf ~ 递归删除用户目录' },
  { pattern: /rm\s+-rf?\s+\//, reason: 'rm -rf 绝对路径删除' },
  // DROP DATABASE / DROP TABLE / TRUNCATE TABLE
  { pattern: /DROP\s+DATABASE/i, reason: 'DROP DATABASE 不可逆数据丢失' },
  { pattern: /DROP\s+TABLE/i, reason: 'DROP TABLE 不可逆数据丢失' },
  { pattern: /TRUNCATE\s+TABLE/i, reason: 'TRUNCATE TABLE 不可逆数据丢失' },
  // Docker 容器/镜像/卷删除（任何环境都禁止，防止误删）
  { pattern: /docker\s+rm\b/i, reason: 'docker rm 删容器不可逆' },
  { pattern: /docker\s+rmi\b/i, reason: 'docker rmi 删镜像不可逆' },
  { pattern: /docker\s+volume\s+rm\b/i, reason: 'docker volume rm 删卷不可逆' },
  { pattern: /docker\s+network\s+rm\b/i, reason: 'docker network rm 删网络不可逆' },
  // git push --force 到 main/master
  { pattern: /git\s+push\s+(-f|--force)/i, reason: 'git push --force 可能覆盖远程历史' },
  // 云资源删除
  { pattern: /aws\s+rds\s+delete-db-instance/i, reason: 'aws rds delete-db-instance 不可逆基础设施破坏' },
  { pattern: /aws\s+s3\s+rb\s+--force/i, reason: 'aws s3 rb --force 删除 S3 桶' },
  { pattern: /aws\s+ec2\s+terminate-instances/i, reason: 'aws ec2 terminate-instances 终止 EC2' },
  // 凭证文件访问
  { pattern: /cat\s+~\/\.ssh\//, reason: '访问 ~/.ssh 凭证文件' },
  { pattern: /cat\s+~\/\.aws\//, reason: '访问 ~/.aws 凭证文件' },
  { pattern: /cat\s+.*\.env\b/, reason: '访问 .env 凭证文件' },
  { pattern: /cp\s+.*~\/\.ssh\//, reason: '复制 ~/.ssh 凭证文件' },
  // mkfs 文件系统格式化
  { pattern: /mkfs\./, reason: 'mkfs 格式化文件系统不可逆' },
  // dd 写设备
  { pattern: /dd\s+if=.*\s+of=\/dev\//, reason: 'dd 写设备文件不可逆' },
  // shutdown / reboot
  { pattern: /\bshutdown\b/, reason: 'shutdown 关机' },
  { pattern: /\breboot\b/, reason: 'reboot 重启' },
  { pattern: /\bhalt\b/, reason: 'halt 关机' },
  // chmod 777 /
  { pattern: /chmod\s+-R\s+777\s+\//, reason: 'chmod -R 777 / 危险权限' },
  // killall / kill -9 -1
  { pattern: /kill\s+-9\s+-1/, reason: 'kill -9 -1 杀死所有进程' },
  { pattern: /killall\s+-9/, reason: 'killall -9 强制杀死所有匹配进程' },
  // fork bomb
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, reason: 'fork bomb 拒绝服务' }
];

// 黄线命令模式（DEV 允许+审计，STAGING/PROD 需审批）
const YELLOW_LINE_PATTERNS = [
  { pattern: /\bsudo\b/, reason: 'sudo 提权命令', category: 'sudo' },
  { pattern: /DELETE\s+FROM/i, reason: 'DELETE FROM 删数据', category: 'delete' },
  { pattern: /UPDATE\s+.*\s+SET/i, reason: 'UPDATE 更新数据', category: 'update' },
  { pattern: /INSERT\s+INTO/i, reason: 'INSERT 插入数据', category: 'insert' },
  { pattern: /systemctl\s+(restart|stop|start)/, reason: 'systemctl 服务控制', category: 'service' },
  { pattern: /service\s+\w+\s+(restart|stop|start)/, reason: 'service 服务控制', category: 'service' },
  { pattern: /docker\s+(stop|kill|pause)\b/, reason: 'docker stop/kill/pause 容器操作', category: 'docker_control' },
  { pattern: /npm\s+install\b/, reason: 'npm install 安装包', category: 'install' },
  { pattern: /pip\s+install\b/, reason: 'pip install 安装包', category: 'install' },
  { pattern: /iptables\s+/, reason: 'iptables 防火墙修改', category: 'firewall' },
  { pattern: /ufw\s+/, reason: 'ufw 防火墙修改', category: 'firewall' },
  { pattern: /git\s+reset\s+--hard/i, reason: 'git reset --hard 丢弃改动', category: 'git_reset' },
  { pattern: /git\s+clean\s+-fd/i, reason: 'git clean -fd 删除未跟踪文件', category: 'git_clean' }
];

// 审计日志缓冲（最近 N 条）
const AUDIT_LOG_MAX = 200;
const auditLog = [];

/**
 * 判定环境类型
 * @param {string} host - 目标主机名/IP
 * @returns {'dev'|'staging'|'prod'}
 */
function detectEnvironment(host) {
  if (!host || typeof host !== 'string') return 'dev';
  // localhost / 127.x / 内网 IP → DEV
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'dev';
  if (/^127\./.test(host)) return 'dev';
  if (/^192\.168\./.test(host)) return 'dev';
  if (/^10\./.test(host)) return 'dev';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'dev';
  // 关键字判定
  const lower = host.toLowerCase();
  if (/(dev|develop|local|test|stage|staging|qa|sandbox)/.test(lower)) return 'staging';
  if (/(prod|production|live|release|app)/.test(lower)) return 'prod';
  // 默认 DEV（开发者工具定位）
  return 'dev';
}

/**
 * 记录审计日志
 */
function appendAuditLog(entry) {
  auditLog.push({
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (auditLog.length > AUDIT_LOG_MAX) {
    auditLog.splice(0, auditLog.length - AUDIT_LOG_MAX);
  }
  console.warn(`[audit] ${entry.tool} ${entry.environment} ${entry.category || ''} ${entry.result}: ${entry.reason}`);
}

/**
 * 检查命令安全性
 * @param {string} command - 待执行的命令或 SQL
 * @param {object} options - { tool, host, environment }
 * @returns {{ allowed: boolean, blocked?: { reason }, warned?: { reason, category }, environment: string }}
 */
function checkCommandSafety(command, options = {}) {
  const tool = options.tool || 'unknown';
  const host = options.host || '';
  const environment = options.environment || detectEnvironment(host);

  // 红线检查（任何环境都禁止）
  for (const rule of RED_LINE_PATTERNS) {
    if (rule.pattern.test(command)) {
      appendAuditLog({
        tool,
        command: String(command).slice(0, 500),
        environment,
        category: 'red_line',
        reason: rule.reason,
        result: 'blocked'
      });
      return {
        allowed: false,
        blocked: { reason: rule.reason },
        environment
      };
    }
  }

  // 黄线检查
  for (const rule of YELLOW_LINE_PATTERNS) {
    if (rule.pattern.test(command)) {
      // DEV 允许 + 审计
      if (environment === 'dev') {
        appendAuditLog({
          tool,
          command: String(command).slice(0, 500),
          environment,
          category: rule.category,
          reason: rule.reason,
          result: 'allowed_with_warning'
        });
        return {
          allowed: true,
          warned: { reason: rule.reason, category: rule.category },
          environment
        };
      }
      // STAGING/PROD 拒绝
      appendAuditLog({
        tool,
        command: String(command).slice(0, 500),
        environment,
        category: rule.category,
        reason: rule.reason,
        result: 'blocked'
      });
      return {
        allowed: false,
        blocked: { reason: `${rule.reason}（${environment} 环境需审批）` },
        environment
      };
    }
  }

  // 绿线（允许）
  return { allowed: true, environment };
}

/**
 * 获取审计日志
 */
function getAuditLog(filter = {}) {
  let logs = auditLog.slice();
  if (filter.tool) logs = logs.filter(l => l.tool === filter.tool);
  if (filter.environment) logs = logs.filter(l => l.environment === filter.environment);
  if (filter.category) logs = logs.filter(l => l.category === filter.category);
  return logs;
}

module.exports = {
  checkCommandSafety,
  detectEnvironment,
  getAuditLog,
  RED_LINE_PATTERNS,
  YELLOW_LINE_PATTERNS
};
