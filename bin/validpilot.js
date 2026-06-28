#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validationQuickRun } = require('../hands/verification_runner');
const browserOperator = require('../hands/browser_operator');

const PKG = require('../package.json');

function printHelp() {
  const cmd = 'validpilot';
  const version = PKG.version || '0.1.0';
  console.log(`${cmd} ${version} — AI 编程的最后一公里验证平台

💡 最佳搭配：配合 Trae Skill (browser-dev-full-validation-skill) 使用，形成「生成→验证→修复→复验」闭环。

Usage:
  ${cmd} health                       检查 Playwright 可用性 (exit 0=ok / exit 1=unavailable)
  ${cmd} run     --flow <file>        执行轻量 flow JSON，逐 action 输出结果
  ${cmd} validate --url <url>         快速验证 URL，输出 pass/fail / Top errors / artifact 路径
  ${cmd} --version                    输出版本号
  ${cmd} --help                       显示此帮助

AI 配置选项:
  --ai-provider <provider>           设置 AI 提供商 (openai/deepseek/qwen)
  --ai-api-key <key>                 设置 AI API Key

Examples:
  ${cmd} health
  ${cmd} validate --url examples/demo/index.html
  ${cmd} run     --flow examples/demo/flow.json
  ${cmd} validate --url examples/demo/index.html --ai-provider openai --ai-api-key sk-xxx
`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else if (item.startsWith('-') && item.length === 2 && item !== '--') {
      const key = item.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(item);
    }
  }
  return result;
}

function printLowToken(result) {
  console.log(JSON.stringify({
    pass: result.pass,
    mode: result.mode,
    summary: result.summary,
    topErrors: (result.topErrors || []).slice(0, 5),
    artifacts: result.artifacts || []
  }, null, 2));
}

async function cmdHealth() {
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, name: PKG.name || 'validpilot', version: PKG.version || '0.1.0', error: `Playwright module unavailable: ${error.message}` }, null, 2));
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 15000 });
    await browser.close();
    console.log(JSON.stringify({ ok: true, name: PKG.name || 'validpilot', version: PKG.version || '0.1.0', message: 'Playwright browser is available' }, null, 2));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, name: PKG.name || 'validpilot', version: PKG.version || '0.1.0', error: `Playwright browser failed to launch: ${error.message}` }, null, 2));
    process.exit(1);
  }
}

async function cmdRun(flowPath) {
  if (!flowPath) throw new Error('run requires --flow <file>');

  const resolved = path.resolve(flowPath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));

  // Support both array-format and {steps, goal, stopOnError} format
  let steps, goal, stopOnError;
  if (Array.isArray(raw)) {
    // Array format: [{action: "open", args: {url: "..."}}, ...]
    steps = raw.map(item => {
      const step = { action: item.action };
      if (item.args && typeof item.args === 'object') {
        Object.assign(step, item.args);
      }
      return step;
    });
    goal = 'CLI low-token flow';
    stopOnError = true;
  } else {
    steps = Array.isArray(raw.steps) ? raw.steps : [];
    goal = raw.goal || 'CLI low-token flow';
    stopOnError = raw.stopOnError !== false;
  }

  const result = await browserOperator.batch({ goal, steps, stopOnError });
  console.log(JSON.stringify({
    pass: result.ok,
    summary: `flow steps=${steps.length}`,
    results: result.results,
    topErrors: [],
    artifacts: (result.results || []).map(item => item.artifactPath).filter(Boolean)
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (args['ai-provider']) {
    process.env.AI_PROVIDER = args['ai-provider'];
  }
  if (args['ai-api-key']) {
    // 安全警告：CLI 参数可能泄露到系统日志
    console.warn('[SECURITY] 通过 CLI 参数传递 API 密钥可能泄露到系统日志。建议使用环境变量 MCP_API_KEY 代替。');
    process.env.AI_API_KEY = args['ai-api-key'];
  }

  if (args.version || command === '--version' || command === '-v') {
    console.log(PKG.version || '0.1.0');
    return;
  }
  if (args.help || command === '--help' || command === '-h' || !command) {
    printHelp();
    return;
  }

  if (command === 'health') {
    await cmdHealth();
    return;
  }

  if (command === 'validate') {
    if (!args.url) throw new Error('validate requires --url <url>');
    const result = await validationQuickRun({ url: args.url, headless: true });
    printLowToken(result);
    return;
  }

  if (command === 'run') {
    await cmdRun(args.flow);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(JSON.stringify({ pass: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
