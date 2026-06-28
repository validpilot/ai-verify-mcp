'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureDir, listArtifacts, cleanupOld } = require('../core/artifacts');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-artifacts-'));
}

test('artifacts.ensureDir - creates directory', () => {
  const tmp = makeTempDir();
  const target = path.join(tmp, 'sub', 'nested');
  const result = ensureDir(target);
  assert.equal(result, target);
  assert.ok(fs.existsSync(target));
  fs.rmSync(tmp, { recursive: true });
});

test('artifacts.listArtifacts - empty dir returns empty array', () => {
  const tmp = makeTempDir();
  const result = listArtifacts(tmp);
  assert.deepEqual(result, []);
  fs.rmSync(tmp, { recursive: true });
});

test('artifacts.listArtifacts - lists files with size and mtime', () => {
  const tmp = makeTempDir();
  const file = path.join(tmp, 'test.txt');
  fs.writeFileSync(file, 'hello');
  const result = listArtifacts(tmp);
  assert.equal(result.length, 1);
  assert.equal(result[0].size, 5);
  assert.ok(result[0].mtimeMs > 0);
  assert.ok(result[0].path.endsWith('test.txt'));
  fs.rmSync(tmp, { recursive: true });
});

test('artifacts.listArtifacts - recursive and sorted by mtime desc', () => {
  const tmp = makeTempDir();
  const sub = path.join(tmp, 'sub');
  fs.mkdirSync(sub);
  const oldFile = path.join(tmp, 'old.txt');
  const newFile = path.join(sub, 'new.txt');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(newFile, 'new');
  fs.utimesSync(oldFile, new Date(0), new Date(0));
  fs.utimesSync(newFile, new Date(0), new Date(Date.now()));
  const result = listArtifacts(tmp);
  assert.equal(result.length, 2);
  assert.ok(result[0].mtimeMs > result[1].mtimeMs);
  fs.rmSync(tmp, { recursive: true });
});

test('artifacts.listArtifacts - nonexistent dir returns empty', () => {
  const result = listArtifacts('/nonexistent/path/12345');
  assert.deepEqual(result, []);
});

test('artifacts.cleanupOld - removes old files', () => {
  const tmp = makeTempDir();
  const oldFile = path.join(tmp, 'old.txt');
  const newFile = path.join(tmp, 'new.txt');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(newFile, 'new');
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, oldDate, oldDate);
  const result = cleanupOld(tmp, 7);
  assert.equal(result.removed, 1);
  assert.ok(!fs.existsSync(oldFile));
  assert.ok(fs.existsSync(newFile));
  fs.rmSync(tmp, { recursive: true });
});

test('artifacts.cleanupOld - nonexistent dir returns zero', () => {
  const result = cleanupOld('/nonexistent/path/12345', 7);
  assert.equal(result.removed, 0);
  assert.deepEqual(result.files, []);
});
