'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const tools = ['browser_data_compare'];

async function handle(name, args, deps) {
  const { text, findElement, log, resetRuntimeLogs, path, fs, logger, stateManager, ensurePage } = deps;
    
    if (name === 'browser_data_compare') {
      const { 
        session, 
        compareMode = 'dom_vs_api',
        selector,
        apiEndpoint,
        apiMethod = 'GET',
        apiBody,
        storageKey,
        expectedData,
        baselineName,
        extractMode = 'table',
        keyFields = [],
        ignoreFields = [],
        strictMode = false
      } = args;

      const { target } = await ensurePage(args);
      let sourceData = [];
      let targetData = [];
      let sourceType = '';
      let targetType = '';

      try {
        switch (compareMode) {
          case 'dom_vs_api':
            sourceData = await extractDomData(target, selector, extractMode);
            sourceType = 'dom';
            targetData = await fetchApiData(apiEndpoint, apiMethod, apiBody);
            targetType = 'api';
            break;
          case 'dom_vs_storage':
            sourceData = await extractDomData(target, selector, extractMode);
            sourceType = 'dom';
            targetData = await extractStorageData(target, storageKey);
            targetType = 'storage';
            break;
          case 'dom_vs_expected':
            sourceData = await extractDomData(target, selector, extractMode);
            sourceType = 'dom';
            targetData = expectedData || [];
            targetType = 'expected';
            break;
          case 'api_vs_storage':
            sourceData = await fetchApiData(apiEndpoint, apiMethod, apiBody);
            sourceType = 'api';
            targetData = await extractStorageData(target, storageKey);
            targetType = 'storage';
            break;
          case 'api_vs_expected':
            sourceData = await fetchApiData(apiEndpoint, apiMethod, apiBody);
            sourceType = 'api';
            targetData = expectedData || [];
            targetType = 'expected';
            break;
          case 'storage_vs_expected':
            sourceData = await extractStorageData(target, storageKey);
            sourceType = 'storage';
            targetData = expectedData || [];
            targetType = 'expected';
            break;
          case 'baseline_compare':
            sourceData = await extractDomData(target, selector, extractMode);
            sourceType = 'dom';
            targetData = await loadBaseline(baselineName || 'default');
            targetType = 'baseline';
            break;
          default:
            throw new Error(`未知比对模式: ${compareMode}`);
        }

        const compareResult = compareData(sourceData, targetData, keyFields, ignoreFields, strictMode);
        
        const currentUrl = await target.url();
        
        const result = {
          success: true,
          compareMode,
          totalRecords: sourceData.length,
          matchCount: compareResult.matchCount,
          partialMatchCount: compareResult.partialMatchCount,
          mismatchCount: compareResult.mismatchCount,
          missingCount: compareResult.missingCount,
          extraCount: compareResult.extraCount,
          matchRate: sourceData.length > 0 ? (compareResult.matchCount + compareResult.partialMatchCount * 0.5) / sourceData.length : 0,
          details: compareResult.details,
          summary: generateSummary(compareResult, sourceType, targetType),
          suggestions: generateSuggestions(compareResult),
          nextSteps: [
            '查看 details 了解具体差异',
            '根据 suggestions 修复数据不一致问题',
            '如需保存当前数据为基线，请调用 contract { mode: \'baseline\' } save',
            '修复后重新运行 browser_data_compare 验证'
          ],
          dataSnapshot: {
            sourceType,
            sourceData,
            timestamp: new Date().toISOString(),
            url: currentUrl
          }
        };
        
        return text(JSON.stringify(result, null, 2));
        
      } catch (error) {
        return text(JSON.stringify({
          success: false,
          compareMode,
          error: error.message,
          details: [],
          summary: `比对失败: ${error.message}`,
          suggestions: ['检查参数是否正确', '确保API端点可访问', '验证选择器是否存在'],
          nextSteps: ['检查错误信息', '确认数据源配置正确', '重新执行比对']
        }, null, 2));
      }
    }

    throw new Error(`未知工具: ${name}`);}

async function extractDomData(target, selector, extractMode) {
  const extractionScript = `
    (function(sel, mode) {
      const data = [];
      let elements = [];
      
      if (sel) {
        elements = Array.from(document.querySelectorAll(sel));
      } else {
        switch(mode) {
          case 'table':
            elements = Array.from(document.querySelectorAll('table'));
            break;
          case 'cards':
            elements = Array.from(document.querySelectorAll('[class*="card"], [class*="Card"], .card, .Card'));
            break;
          case 'list':
            elements = Array.from(document.querySelectorAll('ul, ol'));
            break;
          default:
            elements = Array.from(document.querySelectorAll('table, [class*="card"], [class*="Card"], ul, ol'));
        }
      }
      
      elements.forEach((el, idx) => {
        if (mode === 'table' || el.tagName === 'TABLE') {
          const rows = Array.from(el.querySelectorAll('tbody tr, tr:not(thead tr)'));
          const headers = Array.from(el.querySelectorAll('thead th, th')).map(th => th.textContent.trim());
          
          rows.forEach((row, rowIdx) => {
            const rowData = {};
            const cells = Array.from(row.querySelectorAll('td'));
            cells.forEach((cell, cellIdx) => {
              const key = headers[cellIdx] || \`col_\${cellIdx}\`;
              rowData[key] = cell.textContent.trim();
            });
            if (Object.keys(rowData).length > 0) {
              rowData._rowSelector = \`table:nth-child(\${idx + 1}) tr:nth-child(\${rowIdx + 1})\`;
              data.push(rowData);
            }
          });
        } else if (mode === 'cards' || el.classList.contains('card') || el.classList.contains('Card') || el.className.includes('card') || el.className.includes('Card')) {
          const cardData = {};
          const title = el.querySelector('[class*="title"], [class*="Title"], .title, .Title, h3, h4')?.textContent?.trim();
          const content = el.querySelector('[class*="content"], [class*="Content"], .content, .Content')?.textContent?.trim();
          const meta = el.querySelectorAll('[class*="meta"], [class*="Meta"], .meta, .Meta, span, p');
          
          if (title) cardData.title = title;
          if (content) cardData.content = content;
          
          meta.forEach((m, mi) => {
            const key = m.className || \`meta_\${mi}\`;
            cardData[key] = m.textContent.trim();
          });
          
          if (Object.keys(cardData).length > 0) {
            cardData._rowSelector = \`.card:nth-child(\${idx + 1})\`;
            data.push(cardData);
          }
        } else if (mode === 'list' || el.tagName === 'UL' || el.tagName === 'OL') {
          const items = Array.from(el.querySelectorAll('li'));
          items.forEach((item, itemIdx) => {
            data.push({
              text: item.textContent.trim(),
              _rowSelector: \`ul:nth-child(\${idx + 1}) li:nth-child(\${itemIdx + 1})\`
            });
          });
        }
      });
      
      return data;
    })('${selector || ''}', '${extractMode}')
  `;
  
  return await target.evaluate(extractionScript);
}

async function fetchApiData(endpoint, method, body) {
  if (!endpoint) {
    throw new Error('API端点不能为空');
  }
  
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : (parsed.data || parsed.items || parsed.results || []));
        } catch {
          resolve([]);
        }
      });
    });
    
    req.on('error', (e) => reject(e));
    
    if (method.toUpperCase() === 'POST' && body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function extractStorageData(target, key) {
  if (!key) {
    throw new Error('存储键名不能为空');
  }
  
  return await target.evaluate((k) => {
    const value = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ value }];
    }
  }, key);
}

async function loadBaseline(name) {
  const baselinePath = path.join(__dirname, '../data/baselines', `${name}.json`);
  if (fs.existsSync(baselinePath)) {
    const content = fs.readFileSync(baselinePath, 'utf8');
    return JSON.parse(content);
  }
  return [];
}

function compareData(source, target, keyFields, ignoreFields, strictMode) {
  const details = [];
  let matchCount = 0;
  let partialMatchCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  
  const ignoreSet = new Set(ignoreFields);
  
  const targetMap = new Map();
  target.forEach(item => {
    const key = keyFields.length > 0 
      ? keyFields.map(k => item[k]).join('|')
      : JSON.stringify(Object.keys(item).sort().map(k => item[k]));
    targetMap.set(key, item);
  });
  
  source.forEach(sourceItem => {
    const sourceKey = keyFields.length > 0 
      ? keyFields.map(k => sourceItem[k]).join('|')
      : JSON.stringify(Object.keys(sourceItem).filter(k => !ignoreSet.has(k)).sort().map(k => sourceItem[k]));
    
    const targetItem = targetMap.get(sourceKey);
    
    if (!targetItem) {
      missingCount++;
      details.push({
        status: 'missing',
        primaryKey: sourceKey,
        sourceData: sourceItem,
        targetData: null,
        differences: [],
        rowSelector: sourceItem._rowSelector || ''
      });
      return;
    }
    
    targetMap.delete(sourceKey);
    
    const differences = [];
    const allKeys = new Set([...Object.keys(sourceItem), ...Object.keys(targetItem)]);
    
    allKeys.forEach(key => {
      if (ignoreSet.has(key) || key === '_rowSelector') return;
      
      const sourceValue = sourceItem[key];
      const targetValue = targetItem[key];
      
      if (sourceValue === undefined && targetValue === undefined) return;
      
      if (sourceValue === undefined) {
        differences.push({ field: key, sourceValue: undefined, targetValue, diffType: 'missing' });
      } else if (targetValue === undefined) {
        differences.push({ field: key, sourceValue, targetValue: undefined, diffType: 'extra' });
      } else if (strictMode && typeof sourceValue !== typeof targetValue) {
        differences.push({ field: key, sourceValue, targetValue, diffType: 'type' });
      } else if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
        differences.push({ field: key, sourceValue, targetValue, diffType: 'value' });
      }
    });
    
    if (differences.length === 0) {
      matchCount++;
      details.push({
        status: 'match',
        primaryKey: sourceKey,
        sourceData: sourceItem,
        targetData: targetItem,
        differences: [],
        rowSelector: sourceItem._rowSelector || ''
      });
    } else if (differences.length < Object.keys(sourceItem).length / 2) {
      partialMatchCount++;
      details.push({
        status: 'partial',
        primaryKey: sourceKey,
        sourceData: sourceItem,
        targetData: targetItem,
        differences,
        rowSelector: sourceItem._rowSelector || ''
      });
    } else {
      mismatchCount++;
      details.push({
        status: 'mismatch',
        primaryKey: sourceKey,
        sourceData: sourceItem,
        targetData: targetItem,
        differences,
        rowSelector: sourceItem._rowSelector || ''
      });
    }
  });
  
  targetMap.forEach((item, key) => {
    extraCount++;
    details.push({
      status: 'extra',
      primaryKey: key,
      sourceData: null,
      targetData: item,
      differences: [],
      rowSelector: ''
    });
  });
  
  return { details, matchCount, partialMatchCount, mismatchCount, missingCount, extraCount };
}

function generateSummary(result, sourceType, targetType) {
  const { matchCount, partialMatchCount, mismatchCount, missingCount, extraCount } = result;
  const total = matchCount + partialMatchCount + mismatchCount + missingCount;
  
  if (total === 0) {
    return '未找到可比对的数据';
  }
  
  const matchRate = ((matchCount + partialMatchCount * 0.5) / total * 100).toFixed(1);
  
  let summary = `数据比对完成：${total} 条记录，匹配率 ${matchRate}%`;
  
  if (matchCount > 0) summary += `，完全匹配 ${matchCount} 条`;
  if (partialMatchCount > 0) summary += `，部分匹配 ${partialMatchCount} 条`;
  if (mismatchCount > 0) summary += `，不匹配 ${mismatchCount} 条`;
  if (missingCount > 0) summary += `，目标缺失 ${missingCount} 条`;
  if (extraCount > 0) summary += `，目标多余 ${extraCount} 条`;
  
  return summary;
}

function generateSuggestions(result) {
  const suggestions = [];
  
  if (result.mismatchCount > 0) {
    suggestions.push(`发现 ${result.mismatchCount} 条数据不匹配，请检查数据来源和目标数据的一致性`);
  }
  
  if (result.missingCount > 0) {
    suggestions.push(`发现 ${result.missingCount} 条数据在目标中缺失，可能需要同步数据`);
  }
  
  if (result.extraCount > 0) {
    suggestions.push(`发现 ${result.extraCount} 条多余数据，可能是数据过期或重复`);
  }
  
  if (result.partialMatchCount > 0) {
    suggestions.push(`发现 ${result.partialMatchCount} 条部分匹配数据，建议检查字段映射是否正确`);
  }
  
  if (result.matchCount === 0 && result.partialMatchCount === 0) {
    suggestions.push('没有找到匹配的数据，可能需要调整主键字段或选择器');
  }
  
  return suggestions;
}

module.exports = { tools, handle };