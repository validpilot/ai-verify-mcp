'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');
const { defaultAdapter, ensureDir, truncate } = require('./../engines/playwright_adapter');

const DIFF_DIR = path.join(__dirname, '..', 'artifacts', 'phase1');

async function collectEvidence(args = {}) {
  const evidence = await defaultAdapter.collectEvidenceSummary(args);
  const artifactPath = defaultAdapter.writeArtifact('evidence-summary', evidence);

  const summary = {
    consoleCount: evidence.console.count,
    networkErrorCount: evidence.network.count,
    pageErrorCount: evidence.pageerror.count,
    title: evidence.dom?.title || '',
    url: evidence.dom?.url || ''
  };

  const fullEvidence = {
    console: evidence.console,
    network: evidence.network,
    pageerror: evidence.pageerror,
    dom: evidence.dom ? {
      url: evidence.dom.url,
      title: evidence.dom.title,
      readyState: evidence.dom.readyState,
      textSummary: truncate(evidence.dom.textSummary, 600),
      controls: (evidence.dom.controls || []).slice(0, 20),
      alerts: (evidence.dom.alerts || []).slice(0, 10)
    } : null
  };

  return {
    ok: true,
    summary,
    evidence: fullEvidence,
    artifactPath
  };
}

async function screenshotDiff(args = {}) {
  ensureDir(DIFF_DIR);
  const baseline = args.baselinePath || args.beforePath;
  let actual = args.actualPath || args.afterPath;

  if (!actual) {
    const shot = await defaultAdapter.screenshot({ name: args.name || 'diff-actual', fullPage: args.fullPage });
    actual = shot.artifactPath;
  }

  const result = {
    ok: true,
    baselinePath: baseline || null,
    actualPath: actual,
    artifactPath: null,
    summary: 'screenshot captured; baseline not provided so pixel diff skipped',
    diffPixels: 0,
    diffRatio: 0
  };

  if (!baseline || !fs.existsSync(baseline) || !actual || !fs.existsSync(actual)) {
    return result;
  }

  const before = PNG.sync.read(fs.readFileSync(baseline));
  const after = PNG.sync.read(fs.readFileSync(actual));
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const beforeCrop = new PNG({ width, height });
  const afterCrop = new PNG({ width, height });
  PNG.bitblt(before, beforeCrop, 0, 0, width, height, 0, 0);
  PNG.bitblt(after, afterCrop, 0, 0, width, height, 0, 0);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(beforeCrop.data, afterCrop.data, diff.data, width, height, { threshold: args.threshold || 0.1 });
  const diffPath = path.join(DIFF_DIR, `screenshot-diff-${Date.now()}.png`);
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    ok: diffPixels === 0,
    baselinePath: baseline,
    actualPath: actual,
    artifactPath: diffPath,
    summary: diffPixels === 0 ? 'no visual pixel difference detected' : `${diffPixels} pixels differ (${((diffPixels / (width * height)) * 100).toFixed(2)}%)`,
    diffPixels,
    diffRatio: Number((diffPixels / (width * height)).toFixed(4)),
    dimensions: { width, height }
  };
}

module.exports = {
  collectEvidence,
  screenshotDiff
};
