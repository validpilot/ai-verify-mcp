'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'validpilot.js');
const PKG = require(path.resolve(__dirname, '..', 'package.json'));

describe('CLI: parseArgs (via dispatch behavior)', () => {
  it('--version outputs package version', () => {
    const result = spawnSync('node', [CLI, '--version'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), PKG.version);
  });

  it('-v outputs package version', () => {
    const result = spawnSync('node', [CLI, '-v'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), PKG.version);
  });

  it('--help prints usage', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Usage:'));
    assert.ok(result.stdout.includes('health'));
    assert.ok(result.stdout.includes('validate'));
    assert.ok(result.stdout.includes('run'));
  });

  it('no args prints help', () => {
    const result = spawnSync('node', [CLI], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Usage:'));
  });

  it('unknown command prints error', () => {
    const result = spawnSync('node', [CLI, 'bogus'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('Unknown command'));
    assert.ok(result.stderr.includes('bogus'));
  });

  it('validate requires --url', () => {
    const result = spawnSync('node', [CLI, 'validate'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('validate requires --url'));
  });

  it('run requires --flow', () => {
    const result = spawnSync('node', [CLI, 'run'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('run requires --flow'));
  });

  it('--ai-provider sets env var', () => {
    const result = spawnSync('node', [CLI, '--ai-provider', 'openai', '--version'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), PKG.version);
  });
});
