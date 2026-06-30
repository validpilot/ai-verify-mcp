'use strict';

const { defaultAdapter } = require('./../engines/playwright_adapter');

async function open(args = {}) {
  return defaultAdapter.open(args);
}

async function click(args = {}) {
  return defaultAdapter.click(args);
}

async function type(args = {}) {
  return defaultAdapter.type(args);
}

async function wait(args = {}) {
  return defaultAdapter.wait(args);
}

async function evalInPage(args = {}) {
  return defaultAdapter.eval(args);
}

async function screenshot(args = {}) {
  return defaultAdapter.screenshot(args);
}

async function batch(args = {}) {
  return defaultAdapter.batch(args);
}

async function navigate(args = {}) {
  return defaultAdapter.open(args);
}

async function summary(args = {}) {
  return defaultAdapter.collectEvidenceSummary(args);
}

async function checkAction(args = {}) {
  return defaultAdapter.checkAction(args);
}

async function collectAction(args = {}) {
  return defaultAdapter.collectAction(args);
}

async function reportAction(args = {}) {
  return defaultAdapter.reportAction(args);
}

module.exports = {
  open,
  navigate,
  click,
  type,
  wait,
  eval: evalInPage,
  screenshot,
  batch,
  summary,
  check: checkAction,
  collect: collectAction,
  report: reportAction,
  adapter: defaultAdapter
};
