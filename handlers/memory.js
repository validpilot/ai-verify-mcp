'use strict';

/**
 * memory_recall — 跨会话记忆系统
 *
 * 6 层记忆模型在本工具中的落地：
 *   - 工作记忆（瞬时）：deps.stateManager 的 session 内存（不归本工具持久化）
 *   - 情景记忆（episodic）：每次验证会话的发现快照 → .validpilot/memory/episodic/<id>.json
 *   - 模式记忆（pattern）：从多次情景中提炼的通用修复模式 → .validpilot/memory/pattern/<id>.json
 *   - 程序记忆（procedural）：成功的操作链模板 → .validpilot/memory/procedural/<id>.json
 *
 * 召回算法：
 *   - 文本相似度（Jaccard over tokens，长度≥3）
 *   - tag 匹配加权
 *   - host 匹配加权
 *   - 时间衰减（半衰期 30 天）
 *
 * 项目级隔离：每个项目根目录下 .validpilot/memory/ 独立存储
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMORY_DIR_NAME = '.validpilot';
const MEMORY_SUBDIR = 'memory';
const MEMORY_TYPES = ['episodic', 'pattern', 'procedural'];
const EPISODIC_TTL_DAYS = 90;
const TIME_DECAY_HALF_LIFE_DAYS = 30;

const tools = ['memory_recall'];

async function handle(name, args, deps) {
  const { text, log, resetRuntimeLogs } = deps;

    if (name === 'memory_recall') {
      return await memoryRecall(args, deps);
    }
    return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };}

// ===== 工具函数 =====

function log(level, message) {
  if (typeof globalThis.log === 'function') {
    globalThis.log(level, message);
  } else if (typeof globalThis.logger === 'object' && globalThis.logger) {
    try { globalThis.logger[level.toLowerCase()] && globalThis.logger[level.toLowerCase()](message); } catch (_) {}
  }
}

/**
 * 推断项目根目录与项目ID
 * 优先级：args.projectId > deps.projectRoot > deps.cwd > process.cwd()
 */
function resolveProjectContext(args, deps) {
  const cwd = (deps && deps.cwd) || process.cwd();
  const projectRoot = (deps && deps.projectRoot) || cwd;

  let projectId;
  if (args.projectId) {
    projectId = String(args.projectId);
  } else {
    const baseName = path.basename(path.resolve(projectRoot));
    projectId = baseName || 'default';
  }

  const memoryRoot = path.join(projectRoot, MEMORY_DIR_NAME, MEMORY_SUBDIR);
  return { projectId, projectRoot, memoryRoot };
}

function ensureMemoryDirs(memoryRoot) {
  for (const type of MEMORY_TYPES) {
    const dir = path.join(memoryRoot, type);
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateId(prefix) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${ts}-${rand}`;
}

/**
 * 文本相似度（Jaccard over tokens，长度≥3）
 * 复用 atl_learner.js 的算法思想但独立实现，避免循环依赖
 */
function computeTextSimilarity(text1, text2) {
  const words1 = String(text1 || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  const words2 = String(text2 || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3);

  if (words1.length === 0 || words2.length === 0) return 0.0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0.0;
}

function extractHost(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname || '';
  } catch (_) {
    const match = String(url).match(/^[a-z]+:\/\/([^\/]+)/i);
    if (match) return match[1];
    return String(url).split('/')[0] || '';
  }
}

function detectQueryType(query, queryType) {
  if (queryType && queryType !== 'auto') return queryType;
  const q = String(query || '');
  if (/^https?:\/\//i.test(q)) return 'url';
  if (/error|exception|fail|undefined|cannot|500|404/i.test(q)) return 'error';
  return 'symptom';
}

/**
 * 时间衰减因子：半衰期 30 天
 * 30 天前 = 0.5，60 天前 = 0.25，90 天前 = 0.125
 */
function timeDecayFactor(createdAt) {
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return 0.5;
  const ageDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1.0;
  return Math.pow(0.5, ageDays / TIME_DECAY_HALF_LIFE_DAYS);
}

// ===== 存储层 =====

function loadMemoryEntries(memoryRoot, type) {
  const dir = path.join(memoryRoot, type);
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      entries.push(JSON.parse(raw));
    } catch (err) {
      log('WARN', `[Memory] 加载 ${file} 失败: ${err.message}`);
    }
  }
  return entries;
}

function loadAllMemories(memoryRoot, typeFilter = 'all') {
  const result = [];
  for (const type of MEMORY_TYPES) {
    if (typeFilter !== 'all' && typeFilter !== type) continue;
    const entries = loadMemoryEntries(memoryRoot, type);
    for (const entry of entries) {
      result.push({ ...entry, memoryType: type });
    }
  }
  return result;
}

function saveMemoryEntry(memoryRoot, type, entry) {
  const dir = path.join(memoryRoot, type);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.id}.json`);
  fs.writeFileSync(file, JSON.stringify(entry, null, 2), 'utf8');
}

function deleteMemoryEntry(memoryRoot, type, id) {
  const file = path.join(memoryRoot, type, `${id}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    return true;
  }
  return false;
}

function findEntryById(memoryRoot, id) {
  for (const type of MEMORY_TYPES) {
    const file = path.join(memoryRoot, type, `${id}.json`);
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        return { entry: JSON.parse(raw), type };
      } catch (_) {}
    }
  }
  return null;
}

// ===== 操作实现 =====

/**
 * recall: 检索相似记忆
 */
async function operationRecall(args, memoryRoot, projectId) {
  if (!args.query) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'recall 操作需要 query 参数' }]
    };
  }

  const queryType = detectQueryType(args.query, args.queryType);
  const minScore = typeof args.minScore === 'number' ? args.minScore : 0.3;
  const limit = Math.min(args.limit || 10, 50);
  const memoryType = args.memoryType || 'all';

  let memories = loadAllMemories(memoryRoot, memoryType);

  // 时间过滤
  if (args.since) {
    const since = new Date(args.since).getTime();
    memories = memories.filter(m => new Date(m.createdAt).getTime() >= since);
  }
  if (args.before) {
    const before = new Date(args.before).getTime();
    memories = memories.filter(m => new Date(m.createdAt).getTime() <= before);
  }

  // host 过滤
  if (args.host) {
    memories = memories.filter(m => {
      const mHost = m.host || extractHost(m.target || '');
      return mHost === args.host;
    });
  }

  // tag 过滤（AND）
  if (args.tags && args.tags.length > 0) {
    memories = memories.filter(m => {
      const mTags = m.tags || [];
      return args.tags.every(t => mTags.includes(t));
    });
  }

  const queryHost = queryType === 'url' ? extractHost(args.query) : '';
  const matches = [];

  for (const mem of memories) {
    const matchDetails = [];
    let score = 0;

    // 文本相似度：query vs symptom + title + rootCause
    const symSim = computeTextSimilarity(args.query, mem.symptom || '');
    const titleSim = computeTextSimilarity(args.query, mem.title || '');
    const causeSim = computeTextSimilarity(args.query, mem.rootCause || '');
    const textScore = Math.max(symSim, titleSim * 0.8, causeSim * 0.7);

    if (textScore > 0) {
      score = Math.max(score, textScore);
      if (symSim === textScore) matchDetails.push(`症状文本相似: ${(symSim * 100).toFixed(0)}%`);
      else if (titleSim === textScore) matchDetails.push(`标题相似: ${(titleSim * 100).toFixed(0)}%`);
      else matchDetails.push(`根因相似: ${(causeSim * 100).toFixed(0)}%`);
    }

    // tag 匹配加分
    if (mem.tags && mem.tags.length > 0) {
      const queryTags = String(args.query).toLowerCase().split(/\W+/).filter(w => w.length >= 3);
      let tagHits = 0;
      for (const tag of mem.tags) {
        if (queryTags.includes(tag.toLowerCase())) tagHits++;
      }
      if (tagHits > 0) {
        const tagBoost = Math.min(0.3, tagHits * 0.1);
        score += tagBoost;
        matchDetails.push(`标签命中 ${tagHits} 个: ${mem.tags.filter(t => queryTags.includes(t.toLowerCase())).join(', ')}`);
      }
    }

    // host 匹配加分
    if (queryHost) {
      const memHost = mem.host || extractHost(mem.target || '');
      if (memHost && memHost === queryHost) {
        score += 0.25;
        matchDetails.push(`主机匹配: ${memHost}`);
      }
    }

    // 时间衰减（轻微，避免完全屏蔽老记忆）
    const decay = timeDecayFactor(mem.createdAt);
    score = score * (0.7 + 0.3 * decay);

    // 模式记忆加权（提炼过的更可信）
    if (mem.memoryType === 'pattern') {
      score *= 1.15;
      matchDetails.push('模式记忆(已提炼)');
    }

    // 召回次数加权（被验证过的更可信）
    if (mem.recallCount > 0) {
      score *= Math.min(1.2, 1 + mem.recallCount * 0.05);
    }

    if (score >= minScore) {
      matches.push({
        id: mem.id,
        memoryType: mem.memoryType,
        title: mem.title || '',
        symptom: mem.symptom || '',
        rootCause: mem.rootCause || '',
        fix: mem.fix || '',
        tags: mem.tags || [],
        host: mem.host || extractHost(mem.target || ''),
        createdAt: mem.createdAt,
        score: Math.round(score * 100) / 100,
        matchDetails
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const topMatches = matches.slice(0, limit);

  // 更新召回计数（异步写回，失败不影响返回）
  for (const m of topMatches) {
      const found = findEntryById(memoryRoot, m.id);
      if (found && found.entry) {
        try {
          found.entry.lastRecalledAt = new Date().toISOString();
          found.entry.recallCount = (found.entry.recallCount || 0) + 1;
          saveMemoryEntry(memoryRoot, found.type, found.entry);
        } catch (_) {}
      }
    }

  log('INFO', `[Memory] recall "${args.query.substring(0, 60)}" → ${matches.length} 匹配，返回 ${topMatches.length}`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        operation: 'recall',
        projectId,
        queryType,
        totalCandidates: memories.length,
        totalMatches: matches.length,
        matches: topMatches,
        summary: topMatches.length === 0
          ? `未找到相似度≥${minScore} 的历史记忆（候选 ${memories.length} 条）`
          : `找到 ${matches.length} 条匹配，返回前 ${topMatches.length} 条，最高分 ${topMatches[0].score}`,
        nextSteps: topMatches.length > 0
          ? [`参考最高分记忆: ${topMatches[0].title}`, `若确认根因相同，可复用修复方案: ${topMatches[0].fix?.substring(0, 100) || 'N/A'}`]
          : ['使用 consolidate 操作将本次发现固化为新记忆']
      }, null, 2)
    }]
  };
}

/**
 * consolidate: 固化情景到长期记忆
 */
async function operationConsolidate(args, memoryRoot, projectId) {
  const episode = args.episode || {};
  if (!episode.title && !episode.symptom) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'consolidate 操作需要 episode.title 或 episode.symptom' }]
    };
  }

  ensureMemoryDirs(memoryRoot);

  const now = new Date().toISOString();
  const id = generateId('ep');
  const host = extractHost(episode.target || '');

  const episodicEntry = {
    id,
    memoryType: 'episodic',
    title: episode.title || (episode.symptom || '').slice(0, 80),
    target: episode.target || '',
    host,
    symptom: episode.symptom || '',
    rootCause: episode.rootCause || '',
    fix: episode.fix || '',
    tags: episode.tags || [],
    evidence: episode.evidence || [],
    toolFindings: episode.toolFindings || {},
    createdAt: now,
    lastRecalledAt: now,
    recallCount: 0,
    source: 'manual',
    projectId
  };

  saveMemoryEntry(memoryRoot, 'episodic', episodicEntry);

  // 提炼模式：如果 symptom/rootCause 与现有 pattern 相似度 > 0.5，合并；否则创建新 pattern
  let extractedPatterns = 0;
  let patternId = null;
  if (episode.symptom && episode.rootCause) {
    const existingPatterns = loadMemoryEntries(memoryRoot, 'pattern');
    let bestMatch = null;
    let bestSim = 0;
    for (const p of existingPatterns) {
      const sim = computeTextSimilarity(episode.symptom, p.symptom || '');
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = p;
      }
    }

    if (bestMatch && bestSim >= 0.5) {
      // 合并：增加 occurrences，更新 lastSeen
      bestMatch.occurrences = (bestMatch.occurrences || 1) + 1;
      bestMatch.lastSeen = now;
      if (episode.tags) {
        bestMatch.tags = Array.from(new Set([...(bestMatch.tags || []), ...episode.tags]));
      }
      // 如果新情景有更详细的 fix，追加到 variants
      if (episode.fix && !bestMatch.fix.includes(episode.fix)) {
        bestMatch.fixVariants = bestMatch.fixVariants || [];
        if (!bestMatch.fixVariants.includes(episode.fix)) {
          bestMatch.fixVariants.push(episode.fix);
        }
      }
      saveMemoryEntry(memoryRoot, 'pattern', bestMatch);
      patternId = bestMatch.id;
      extractedPatterns = 1;
      log('INFO', `[Memory] 合并到现有 pattern ${patternId} (相似度 ${bestSim.toFixed(2)})`);
    } else {
      // 创建新 pattern
      patternId = generateId('pat');
      const patternEntry = {
        id: patternId,
        memoryType: 'pattern',
        title: episode.title || (episode.symptom || '').slice(0, 80),
        symptom: episode.symptom,
        rootCause: episode.rootCause,
        fix: episode.fix || '',
        fixVariants: episode.fix ? [episode.fix] : [],
        tags: episode.tags || [],
        host,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
        createdAt: now,
        lastRecalledAt: now,
        recallCount: 0,
        sourceEpisodes: [id],
        projectId
      };
      saveMemoryEntry(memoryRoot, 'pattern', patternEntry);
      extractedPatterns = 1;
      log('INFO', `[Memory] 创建新 pattern ${patternId}`);
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        operation: 'consolidate',
        projectId,
        saved: {
          id,
          memoryType: 'episodic',
          extractedPatterns,
          patternId
        },
        summary: `已固化情景记忆 "${episodicEntry.title}"${extractedPatterns > 0 ? `，并${patternId ? '合并到' : '提炼为新'}模式记忆` : ''}`,
        nextSteps: [
          '下次遇到类似问题时使用 recall 操作自动召回此记忆',
          '可使用 list 操作查看已固化的记忆',
          '可使用 stats 操作查看记忆库统计'
        ]
      }, null, 2)
    }]
  };
}

/**
 * list: 列出记忆条目
 */
async function operationList(args, memoryRoot, projectId) {
  const memoryType = args.memoryType || 'all';
  const limit = Math.min(args.limit || 20, 100);
  let memories = loadAllMemories(memoryRoot, memoryType);

  if (args.since) {
    const since = new Date(args.since).getTime();
    memories = memories.filter(m => new Date(m.createdAt).getTime() >= since);
  }
  if (args.before) {
    const before = new Date(args.before).getTime();
    memories = memories.filter(m => new Date(m.createdAt).getTime() <= before);
  }
  if (args.host) {
    memories = memories.filter(m => (m.host || extractHost(m.target || '')) === args.host);
  }
  if (args.tags && args.tags.length > 0) {
    memories = memories.filter(m => {
      const mTags = m.tags || [];
      return args.tags.every(t => mTags.includes(t));
    });
  }

  memories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const items = memories.slice(0, limit).map(m => ({
    id: m.id,
    memoryType: m.memoryType,
    title: m.title || '',
    tags: m.tags || [],
    host: m.host || extractHost(m.target || ''),
    createdAt: m.createdAt,
    lastRecalledAt: m.lastRecalledAt || '',
    recallCount: m.recallCount || 0
  }));

  log('INFO', `[Memory] list → ${items.length}/${memories.length} 条`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        operation: 'list',
        projectId,
        total: memories.length,
        items,
        summary: `共 ${memories.length} 条记忆，返回 ${items.length} 条`
      }, null, 2)
    }]
  };
}

/**
 * forget: 删除记忆
 */
async function operationForget(args, memoryRoot, projectId) {
  const strategy = args.forgetStrategy || (args.id ? 'byId' : 'expired');
  const deletedIds = [];

  if (strategy === 'byId') {
    if (!args.id) {
      return { isError: true, content: [{ type: 'text', text: 'byId 策略需要 id 参数' }] };
    }
    for (const type of MEMORY_TYPES) {
      if (deleteMemoryEntry(memoryRoot, type, args.id)) {
        deletedIds.push(args.id);
        break;
      }
    }
  } else if (strategy === 'expired') {
    const cutoff = Date.now() - EPISODIC_TTL_DAYS * 24 * 60 * 60 * 1000;
    const episodic = loadMemoryEntries(memoryRoot, 'episodic');
    for (const ep of episodic) {
      if (new Date(ep.createdAt).getTime() < cutoff) {
        if (deleteMemoryEntry(memoryRoot, 'episodic', ep.id)) {
          deletedIds.push(ep.id);
        }
      }
    }
  } else if (strategy === 'byTag') {
    if (!args.tags || args.tags.length === 0) {
      return { isError: true, content: [{ type: 'text', text: 'byTag 策略需要 tags 参数' }] };
    }
    for (const type of MEMORY_TYPES) {
      const entries = loadMemoryEntries(memoryRoot, type);
      for (const e of entries) {
        const eTags = e.tags || [];
        if (args.tags.some(t => eTags.includes(t))) {
          if (deleteMemoryEntry(memoryRoot, type, e.id)) {
            deletedIds.push(e.id);
          }
        }
      }
    }
  } else if (strategy === 'before') {
    if (!args.before) {
      return { isError: true, content: [{ type: 'text', text: 'before 策略需要 before 参数' }] };
    }
    const cutoff = new Date(args.before).getTime();
    for (const type of MEMORY_TYPES) {
      const entries = loadMemoryEntries(memoryRoot, type);
      for (const e of entries) {
        if (new Date(e.createdAt).getTime() < cutoff) {
          if (deleteMemoryEntry(memoryRoot, type, e.id)) {
            deletedIds.push(e.id);
          }
        }
      }
    }
  } else {
    return { isError: true, content: [{ type: 'text', text: `未知 forget 策略: ${strategy}` }] };
  }

  log('INFO', `[Memory] forget(${strategy}) → 删除 ${deletedIds.length} 条`);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        operation: 'forget',
        projectId,
        deleted: {
          count: deletedIds.length,
          ids: deletedIds
        },
        summary: `按 ${strategy} 策略删除 ${deletedIds.length} 条记忆`
      }, null, 2)
    }]
  };
}

/**
 * stats: 统计记忆库状态
 */
async function operationStats(args, memoryRoot, projectId) {
  const all = loadAllMemories(memoryRoot, 'all');

  const byType = {};
  const byHost = {};
  let oldest = null;
  let newest = null;
  let totalRecalls = 0;
  let storageBytes = 0;

  for (const m of all) {
    byType[m.memoryType] = (byType[m.memoryType] || 0) + 1;

    const host = m.host || extractHost(m.target || '') || '(unknown)';
    byHost[host] = (byHost[host] || 0) + 1;

    const created = new Date(m.createdAt).getTime();
    if (!oldest || created < oldest) oldest = created;
    if (!newest || created > newest) newest = created;

    totalRecalls += m.recallCount || 0;

      try {
        const file = path.join(memoryRoot, m.memoryType, `${m.id}.json`);
        if (fs.existsSync(file)) {
          storageBytes += fs.statSync(file).size;
        }
      } catch (_) {}
    }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        operation: 'stats',
        projectId,
        stats: {
          totalMemories: all.length,
          byType,
          byHost,
          oldestMemory: oldest ? new Date(oldest).toISOString() : null,
          newestMemory: newest ? new Date(newest).toISOString() : null,
          totalRecalls,
          storageBytes
        },
        summary: `记忆库 ${all.length} 条 (${byType.episodic || 0} 情景 / ${byType.pattern || 0} 模式 / ${byType.procedural || 0} 程序)，累计召回 ${totalRecalls} 次，存储 ${(storageBytes / 1024).toFixed(1)} KB`
      }, null, 2)
    }]
  };
}

// ===== 主入口 =====

async function memoryRecall(args, deps) {
  const { projectId, memoryRoot } = resolveProjectContext(args, deps);

  try {
    ensureMemoryDirs(memoryRoot);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `无法创建记忆目录 ${memoryRoot}: ${err.message}` }]
    };
  }

  const operation = args.operation;
  log('INFO', `[Memory] operation=${operation} projectId=${projectId}`);

  switch (operation) {
    case 'recall':
      return await operationRecall(args, memoryRoot, projectId);
    case 'consolidate':
      return await operationConsolidate(args, memoryRoot, projectId);
    case 'list':
      return await operationList(args, memoryRoot, projectId);
    case 'forget':
      return await operationForget(args, memoryRoot, projectId);
    case 'stats':
      return await operationStats(args, memoryRoot, projectId);
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `未知操作: ${operation}，支持 recall/consolidate/list/forget/stats` }]
      };
  }
}
module.exports = { tools, handle };
