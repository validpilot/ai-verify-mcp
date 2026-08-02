'use strict';

// Handler: backend (开源版基础设施工具)
// 下沉自 mcp-server/handlers/premium_backend.js
// 提供 SSH 执行、Docker 管理、SQL 查询能力
// 这些工具不消耗 Credits，属基础设施工具，由开发者自行管理凭据

const sshUtil = require('../core/ssh');
const safety = require('../core/command_safety');

const tools = [
  'backend_ssh_exec',
  'backend_docker_exec',
  'backend_sql_query'
];

/**
 * 解析 psql 命令前缀（支持 Docker-exec 模式和 SSH-remote 模式）
 */
function buildPsqlPrefix(args) {
  const { escapeShellArg } = sshUtil;

  // Docker-exec mode: psql runs inside the postgres container (trust auth)
  if (process.env.SSH_DB_DOCKER_EXEC) {
    const user = process.env.SSH_DB_USER || 'postgres';
    return `docker exec ${escapeShellArg(process.env.SSH_DB_DOCKER_EXEC)} psql -U ${escapeShellArg(user)}`;
  }

  // SSH-remote mode: psql runs on the SSH host
  const host = (args && args.host) || process.env.SSH_DB_HOST || process.env.DB_HOST || 'localhost';
  const port = process.env.SSH_DB_PORT || process.env.DB_PORT || '5432';
  const user = process.env.SSH_DB_USER || process.env.DB_USER || 'postgres';
  const pass = process.env.SSH_PASS || process.env.DB_PASS || '';

  // Bug #18 fix: only set PGPASSWORD when pass is non-empty
  const passPrefix = pass ? `PGPASSWORD=${escapeShellArg(pass)} ` : '';
  return `${passPrefix}psql -h ${escapeShellArg(host)} -p ${escapeShellArg(port)} -U ${escapeShellArg(user)}`;
}

/**
 * 解析目标数据库名
 */
function resolveDbName(args) {
  const raw = (args && args.database) || process.env.SSH_DB_NAME || process.env.DB_NAME || 'postgres';
  return sshUtil.escapeShellArg(raw);
}

/**
 * 简单的 CSV 解析器（用于解析 psql --csv 输出）
 */
function parsePsqlCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [], rowCount: 0 };

  // 简单 CSV 解析（支持引号包裹的字段）
  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows, rowCount: rows.length };
}

/**
 * 脱敏敏感字段（password, token, secret, key 等）
 */
function redactSensitiveFields(headers, rows) {
  const sensitivePatterns = /password|passwd|pwd|token|secret|key|credential|api_key|private_key/i;
  const sensitiveIndices = headers.map((h, i) => sensitivePatterns.test(h) ? i : -1).filter(i => i >= 0);

  if (sensitiveIndices.length === 0) return { headers, rows, redacted: 0 };

  let redactedCount = 0;
  const redactedRows = rows.map(row =>
    row.map((val, i) => {
      if (sensitiveIndices.includes(i) && val) {
        redactedCount++;
        return val.length > 4 ? val.slice(0, 2) + '****' + val.slice(-2) : '****';
      }
      return val;
    })
  );

  return { headers, rows: redactedRows, redacted: redactedCount };
}

async function handle(name, args, deps) {
  const { text } = deps;

  // ====== backend_ssh_exec ======
  if (name === 'backend_ssh_exec') {
    const { command, timeout = 30000 } = args;
    if (!command) {
      return text(JSON.stringify({ ok: false, error: '缺少 command 参数' }, null, 2));
    }

    if (!sshUtil.isAvailable()) {
      return text(JSON.stringify({
        ok: false,
        error: 'ssh2 模块未安装。请运行: npm install ssh2',
        hint: 'SSH 工具需要 ssh2 依赖。安装后配置 SSH_HOST/SSH_USER/SSH_PASS 等环境变量。'
      }, null, 2));
    }

    // 安全检查：红线/黄线/绿线拦截
    const sshHost = args.host || process.env.SSH_HOST || 'localhost';
    const safetyCheck = safety.checkCommandSafety(command, { tool: 'backend_ssh_exec', host: sshHost });
    if (!safetyCheck.allowed) {
      return text(JSON.stringify({
        ok: false,
        error: '命令被安全策略拦截',
        reason: safetyCheck.blocked.reason,
        environment: safetyCheck.environment,
        command: String(command).slice(0, 200),
        reference: '红线/黄线安全规则'
      }, null, 2));
    }

    const customConfig = {};
    if (args.host) customConfig.host = args.host;
    if (args.username) customConfig.username = args.username;

    let conn;
    try {
      conn = await sshUtil.connectSSH(Object.keys(customConfig).length > 0 ? customConfig : undefined);
    } catch (e) {
      return text(JSON.stringify({
        ok: false,
        error: `SSH 连接失败: ${e.message}`,
        hint: '请检查 SSH_HOST/SSH_USER/SSH_PASS/SSH_KEY_PATH 环境变量是否配置正确'
      }, null, 2));
    }

    try {
      const result = await sshUtil.sshExec(conn, command, timeout);
      conn.end();
      return text(JSON.stringify({
        ok: result.code === 0,
        success: result.code === 0,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        environment: safetyCheck.environment,
        auditWarning: safetyCheck.warned ? safetyCheck.warned.reason : null,
        workflowHint: {
          nextTool: null,
          hint: 'SSH 命令执行完成。检查 stdout 输出，如有错误查看 stderr。如需查看 Docker 容器状态，使用 backend_docker_exec',
          workflowRef: null
        }
      }, null, 2));
    } catch (e) {
      conn.end();
      return text(JSON.stringify({ ok: false, error: `命令执行失败: ${e.message}` }, null, 2));
    }
  }

  // ====== backend_docker_exec ======
  if (name === 'backend_docker_exec') {
    const { command, timeout = 30000 } = args;
    if (!command) {
      return text(JSON.stringify({ ok: false, error: '缺少 command 参数' }, null, 2));
    }

    if (!sshUtil.isAvailable()) {
      return text(JSON.stringify({
        ok: false,
        error: 'ssh2 模块未安装。请运行: npm install ssh2'
      }, null, 2));
    }

    // 构建 Docker 命令
    const dockerCmd = `docker ${command}`;
    const sshHost = args.host || process.env.SSH_HOST || 'localhost';
    const safetyCheck = safety.checkCommandSafety(dockerCmd, { tool: 'backend_docker_exec', host: sshHost });
    if (!safetyCheck.allowed) {
      return text(JSON.stringify({
        ok: false,
        error: 'Docker 命令被安全策略拦截',
        reason: safetyCheck.blocked.reason,
        environment: safetyCheck.environment,
        command: dockerCmd.slice(0, 200)
      }, null, 2));
    }

    const customConfig = {};
    if (args.host) customConfig.host = args.host;

    let conn;
    try {
      conn = await sshUtil.connectSSH(Object.keys(customConfig).length > 0 ? customConfig : undefined);
    } catch (e) {
      return text(JSON.stringify({
        ok: false,
        error: `SSH 连接失败: ${e.message}`
      }, null, 2));
    }

    try {
      const result = await sshUtil.sshExec(conn, dockerCmd, timeout);
      conn.end();
      return text(JSON.stringify({
        ok: result.code === 0,
        success: result.code === 0,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        environment: safetyCheck.environment,
        auditWarning: safetyCheck.warned ? safetyCheck.warned.reason : null,
        workflowHint: {
          nextTool: null,
          hint: 'Docker 命令执行完成。检查容器状态，如需查看容器日志使用 backend_docker_exec { command: "logs -n 50 <container>" }',
          workflowRef: null
        }
      }, null, 2));
    } catch (e) {
      conn.end();
      return text(JSON.stringify({ ok: false, error: `Docker 命令执行失败: ${e.message}` }, null, 2));
    }
  }

  // ====== backend_sql_query ======
  if (name === 'backend_sql_query') {
    const { query, limit = 100, redact = true } = args;
    if (!query) {
      return text(JSON.stringify({ ok: false, error: '缺少 query 参数' }, null, 2));
    }

    if (!sshUtil.isAvailable()) {
      return text(JSON.stringify({
        ok: false,
        error: 'ssh2 模块未安装。请运行: npm install ssh2'
      }, null, 2));
    }

    // 安全检查：DROP DATABASE / TRUNCATE 等红线拦截
    const dbHost = process.env.SSH_DB_HOST || process.env.DB_HOST || 'localhost';
    const safetyCheck = safety.checkCommandSafety(query, { tool: 'backend_sql_query', host: dbHost });
    if (!safetyCheck.allowed) {
      return text(JSON.stringify({
        ok: false,
        error: 'SQL 被安全策略拦截',
        reason: safetyCheck.blocked.reason,
        environment: safetyCheck.environment,
        query: String(query).slice(0, 200)
      }, null, 2));
    }

    const sh = sshUtil;
    const { escapeShellArg } = sh;

    // Resolve DB connection params
    let pgHost = process.env.SSH_DB_HOST || process.env.DB_HOST || 'localhost';
    let pgPort = process.env.SSH_DB_PORT || process.env.DB_PORT || '5432';
    let pgUser = process.env.SSH_DB_USER || process.env.DB_USER || 'postgres';
    let pgPass = process.env.SSH_PASS || process.env.DB_PASS || '';

    const dbUrl = process.env.DB_URL || '';
    if (dbUrl) {
      const m = dbUrl.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
      if (m) { pgUser = m[1]; pgPass = m[2]; pgHost = m[3]; pgPort = m[4]; }
    }

    const dbTarget = resolveDbName(args);
    const safeQuery = escapeShellArg(query);
    const safeLimit = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 100;

    // Docker-exec 模式：优先参数 > 环境变量
    const dockerExec = args.dockerExec || process.env.SSH_DB_DOCKER_EXEC;

    let psqlCmd;
    if (dockerExec) {
      const safePgUser = escapeShellArg(pgUser);
      psqlCmd = `docker exec ${escapeShellArg(dockerExec)} psql -U ${safePgUser} -d ${dbTarget} -c ${safeQuery} --csv`;
    } else {
      const safePgUser = escapeShellArg(pgUser);
      const safePgHost = escapeShellArg(pgHost);
      const safePgPort = escapeShellArg(pgPort);
      const passPrefix = pgPass ? `PGPASSWORD='${pgPass.replace(/'/g, "'\\''")}' ` : '';
      psqlCmd = `${passPrefix}psql -h ${safePgHost} -p ${safePgPort} -U ${safePgUser} -d ${dbTarget} -c ${safeQuery} --csv`;
    }

    let conn;
    try {
      const sshConfig = {};
      if (args.host) sshConfig.host = args.host;
      if (args.username) sshConfig.username = args.username;
      conn = await sh.connectSSH(Object.keys(sshConfig).length > 0 ? sshConfig : undefined);
    } catch (e) {
      return text(JSON.stringify({
        ok: false,
        error: `SSH 连接失败: ${e.message}`,
        hint: '请检查 SSH 环境变量配置或通过 host/username 参数传入'
      }, null, 2));
    }

    try {
      const result = await sh.sshExec(conn, psqlCmd, 30000);
      conn.end();

      if (result.code !== 0) {
        return text(JSON.stringify({
          ok: false,
          error: 'SQL 查询失败',
          stderr: result.stderr,
          stdout: result.stdout.slice(0, 500)
        }, null, 2));
      }

      // 解析 CSV 输出
      const parsed = parsePsqlCSV(result.stdout);

      // 脱敏敏感字段
      let redactInfo = { redacted: 0 };
      let finalRows = parsed.rows;
      if (redact) {
        const redacted = redactSensitiveFields(parsed.headers, parsed.rows);
        finalRows = redacted.rows;
        redactInfo.redacted = redacted.redacted;
      }

      // 转换为对象数组
      const rowsAsObjects = finalRows.map(row => {
        const obj = {};
        parsed.headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });

      return text(JSON.stringify({
        ok: true,
        success: true,
        rowCount: parsed.rowCount,
        headers: parsed.headers,
        rows: rowsAsObjects,
        truncated: parsed.rowCount >= safeLimit,
        redacted: redactInfo.redacted,
        environment: safetyCheck.environment,
        auditWarning: safetyCheck.warned ? safetyCheck.warned.reason : null,
        workflowHint: {
          nextTool: null,
          hint: 'SQL 查询完成。检查 rowCount 和 rows 数据。如需验证数据一致性，使用 correlate_triple_check 或 state_diff_assert',
          workflowRef: null
        }
      }, null, 2));
    } catch (e) {
      conn.end();
      return text(JSON.stringify({ ok: false, error: `SQL 查询执行失败: ${e.message}` }, null, 2));
    }
  }

  return text(JSON.stringify({ error: `未知工具: ${name}` }, null, 2));
}

module.exports = { tools, handle };
