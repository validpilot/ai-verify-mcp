'use strict';

function buildResult(options = {}) {
  const ok = options.ok ?? options.passed ?? false;
  const passed = options.passed ?? ok;
  return {
    ok: Boolean(ok),
    passed: Boolean(passed),
    summary: options.summary || (passed ? 'pass' : 'fail'),
    data: options.data || null,
    artifacts: Array.isArray(options.artifacts) ? options.artifacts : [],
    errors: Array.isArray(options.errors) ? options.errors : []
  };
}

function pass(summary = 'pass', data = null, artifacts = []) {
  return buildResult({ ok: true, passed: true, summary, data, artifacts });
}

function fail(summary = 'fail', errors = [], data = null, artifacts = []) {
  return buildResult({ ok: false, passed: false, summary, errors: Array.isArray(errors) ? errors : [errors], data, artifacts });
}

module.exports = {
  buildResult,
  result: buildResult,
  pass,
  fail
};
