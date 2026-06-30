'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');

function ensureDir(dirPath = loadConfig().artifactDir) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function listArtifacts(rootDir = loadConfig().artifactDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = [];
  for (const name of fs.readdirSync(rootDir)) {
    const fullPath = path.join(rootDir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...listArtifacts(fullPath));
    } else {
      entries.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function cleanupOld(rootDir = loadConfig().artifactDir, retentionDays = 7) {
  if (!fs.existsSync(rootDir)) return { removed: 0, files: [] };
  const cutoff = Date.now() - Number(retentionDays) * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const artifact of listArtifacts(rootDir)) {
    if (artifact.mtimeMs < cutoff) {
      fs.unlinkSync(artifact.path);
      removed.push(artifact.path);
    }
  }
  return { removed: removed.length, files: removed };
}

module.exports = {
  ensureDir,
  listArtifacts,
  cleanupOld
};
