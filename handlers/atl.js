'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { learnFromErrors, suggestFixes } = require('../brain/atl_learner');

const tools = ['atl_learn', 'atl_fix'];

async function handle(name, args, deps) {
  const { text, log, resetRuntimeLogs, getUnifiedErrors, stateManager, logger } = deps;
  
  if (name === 'atl_learn') {
    const { errorText, errorUrl, errorType, errorStatus, focus, currentOnly = true, includeWarnings = false } = args;
    
    const errors = getUnifiedErrors({ currentOnly, includeWarnings, urlContains: focus || undefined });
    
    const errorList = [];
    if (errorText) {
      errorList.push({
        text: errorText,
        url: errorUrl,
        type: errorType,
        status: errorStatus
      });
    } else {
      for (const err of errors.consoleErrors || []) {
        if (focus && !String(err.text || '').includes(focus)) continue;
        errorList.push({
          text: err.text,
          url: err.url,
          type: 'console',
          status: err.status
        });
      }
      for (const err of errors.pageErrors || []) {
        if (focus && !String(err.text || '').includes(focus)) continue;
        errorList.push({
          text: err.text,
          url: err.url,
          type: 'pageerror',
          status: err.status
        });
      }
      for (const err of errors.networkErrors || []) {
        if (focus && !String(err.url || '').includes(focus)) continue;
        errorList.push({
          text: err.responseBody || err.errorText || '',
          url: err.url,
          type: 'network',
          status: err.status
        });
      }
      for (const err of errors.silentFailErrors || []) {
        if (focus && !String(err.url || '').includes(focus)) continue;
        errorList.push({
          text: err.errorSnippet || '',
          url: err.url,
          type: 'silentFail',
          status: err.status
        });
      }
    }
    
    const learningResult = learnFromErrors(errorList);
    
    const result = {
      success: true,
      totalErrorGroups: learningResult.totalErrorGroups,
      highConfidenceCount: learningResult.highConfidenceCount,
      results: learningResult.results.map(r => ({
        errorSignature: r.errorSignature,
        errorCount: r.errorCount,
        totalPatterns: r.totalPatterns,
        matchedPatterns: r.matchedPatterns,
        hasHighConfidence: r.hasHighConfidence,
        topMatches: r.topMatches.map(m => ({
          patternId: m.patternId,
          title: m.title,
          score: m.score,
          probability: m.probability,
          rootCause: m.rootCause,
          fix: m.fix,
          matchDetails: m.matchDetails
        })),
        recommendedFix: r.recommendedFix,
        recommendedRootCause: r.recommendedRootCause
      })),
      summary: learningResult.summary,
      nextSteps: [
        '查看 high 置信度的修复建议，优先验证推荐的修复方案',
        '对推荐的修复方案使用 atl_fix 工具执行修复',
        '修复后重新运行 browser_errors 和验证流程确认问题已解决',
        '如果没有高置信度匹配，建议人工分析错误并添加新的修复模式'
      ]
    };
    
    return text(JSON.stringify(result, null, 2));
  }
  
  if (name === 'atl_fix') {
    const { patternId, fixType, targetFile, replacePattern, replaceWith, sqlStatement, command, configKey, configValue, dryRun = false, backup = true } = args;
    
    const changes = [];
    let success = false;
    let message = '';
    
    try {
      if (fixType === 'code' && targetFile && replacePattern && replaceWith) {
        const resolvedPath = path.resolve(targetFile);
        
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`目标文件不存在: ${resolvedPath}`);
        }
        
        let content = fs.readFileSync(resolvedPath, 'utf8');
        
        if (backup && !dryRun) {
          const backupPath = `${resolvedPath}.backup-${Date.now()}`;
          fs.writeFileSync(backupPath, content);
          changes.push({
            type: 'file_backup',
            path: resolvedPath,
            backupPath
          });
        }
        
        const regex = new RegExp(replacePattern, 'g');
        const oldContent = content.match(regex);
        content = content.replace(regex, replaceWith);
        
        if (!dryRun) {
          fs.writeFileSync(resolvedPath, content);
        }
        
        changes.push({
          type: 'file_modified',
          path: resolvedPath,
          oldContent: oldContent ? oldContent.slice(0, 500) : '',
          newContent: replaceWith.slice(0, 500)
        });
        
        success = true;
        message = `代码修复成功，文件已修改: ${resolvedPath}`;
      } else if (fixType === 'config' && targetFile && configKey) {
        const resolvedPath = path.resolve(targetFile);
        
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`目标配置文件不存在: ${resolvedPath}`);
        }
        
        let content = fs.readFileSync(resolvedPath, 'utf8');
        
        if (backup && !dryRun) {
          const backupPath = `${resolvedPath}.backup-${Date.now()}`;
          fs.writeFileSync(backupPath, content);
          changes.push({
            type: 'file_backup',
            path: resolvedPath,
            backupPath
          });
        }
        
        let newContent = content;
        if (resolvedPath.endsWith('.json')) {
          const config = JSON.parse(content);
          config[configKey] = configValue;
          newContent = JSON.stringify(config, null, 2);
        } else if (resolvedPath.endsWith('.env')) {
          const keyRegex = new RegExp(`^${configKey}\\s*=.*`, 'm');
          const newLine = `${configKey}=${configValue}`;
          if (keyRegex.test(content)) {
            newContent = content.replace(keyRegex, newLine);
          } else {
            newContent = content + '\n' + newLine;
          }
        }
        
        if (!dryRun) {
          fs.writeFileSync(resolvedPath, newContent);
        }
        
        changes.push({
          type: 'config_changed',
          path: resolvedPath,
          oldContent: content.slice(0, 300),
          newContent: newContent.slice(0, 300)
        });
        
        success = true;
        message = `配置已更新: ${configKey}=${configValue}`;
      } else if (fixType === 'command' && command) {
        changes.push({
          type: 'command_executed',
          path: command,
          oldContent: '',
          newContent: '命令执行中...'
        });
        
        if (!dryRun) {
          const output = execSync(command, { timeout: 30000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          changes[changes.length - 1].newContent = output.slice(0, 1000);
        }
        
        success = true;
        message = dryRun ? `命令预览: ${command}` : `命令执行成功`;
      } else if (fixType === 'database' && sqlStatement) {
        changes.push({
          type: 'sql_executed',
          path: sqlStatement.slice(0, 100),
          oldContent: '',
          newContent: dryRun ? 'SQL预览模式' : 'SQL执行中...'
        });
        
        if (!dryRun) {
          message = 'SQL执行需要数据库连接配置，当前版本仅支持预览模式';
        } else {
          message = `SQL预览: ${sqlStatement.slice(0, 200)}`;
        }
        
        success = dryRun;
      } else {
        throw new Error('缺少必要参数，请检查 fixType 和对应参数');
      }
    } catch (error) {
      success = false;
      message = `修复失败: ${error.message}`;
    }
    
    const result = {
      success,
      dryRun,
      fixType,
      patternId,
      changes,
      message,
      nextSteps: [
        '查看 changes 确认修改内容正确',
        '如果是代码修复，运行单元测试验证修复效果',
        '重新执行验证流程确认问题已解决',
        '如果修复失败，检查错误信息并手动修复'
      ]
    };
    
    return text(JSON.stringify(result, null, 2));
  }
  
      throw new Error(`未知工具: ${name}`);}

module.exports = { tools, handle };