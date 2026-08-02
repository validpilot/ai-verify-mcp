'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PROMPTS, listPrompts, getPrompt } = require('../handlers/prompts');

describe('prompts handler', () => {
  describe('PROMPTS array', () => {
    it('should expose exactly 7 prompts', () => {
      assert.strictEqual(PROMPTS.length, 7);
    });

    it('should include submit-form prompt', () => {
      const names = PROMPTS.map(p => p.name);
      assert.ok(names.includes('submit-form'), `Expected submit-form in ${names.join(', ')}`);
    });

    it('should have submit-form with required url and fields arguments', () => {
      const prompt = PROMPTS.find(p => p.name === 'submit-form');
      assert.ok(prompt, 'submit-form prompt must exist');
      const requiredArgs = prompt.arguments.filter(a => a.required).map(a => a.name);
      assert.ok(requiredArgs.includes('url'), 'url must be required');
      assert.ok(requiredArgs.includes('fields'), 'fields must be required');
    });

    it('should have all 7 prompts with name/description/arguments/buildMessages', () => {
      for (const p of PROMPTS) {
        assert.ok(typeof p.name === 'string' && p.name.length > 0, `prompt ${p.name} must have name`);
        assert.ok(typeof p.description === 'string' && p.description.length > 0, `prompt ${p.name} must have description`);
        assert.ok(Array.isArray(p.arguments), `prompt ${p.name} must have arguments array`);
        assert.strictEqual(typeof p.buildMessages, 'function', `prompt ${p.name} must have buildMessages function`);
      }
    });
  });

  describe('listPrompts', () => {
    it('should return 7 prompt metadata entries', () => {
      const list = listPrompts();
      assert.strictEqual(list.length, 7);
    });

    it('should not leak buildMessages function in list output', () => {
      const list = listPrompts();
      for (const entry of list) {
        assert.ok(entry.name, 'entry must have name');
        assert.ok(entry.description, 'entry must have description');
        assert.ok(Array.isArray(entry.arguments), 'entry must have arguments');
        assert.strictEqual(entry.buildMessages, undefined, 'entry must NOT expose buildMessages');
      }
    });
  });

  describe('getPrompt - submit-form', () => {
    it('should return messages with 7 Call: lines when required args provided', () => {
      const result = getPrompt('submit-form', {
        url: 'https://example.com/register',
        fields: { '#email': 'user@test.com', '#password': 'Pass1234!' }
      });
      assert.ok(result.messages, 'result must have messages array');
      assert.strictEqual(result.messages.length, 1);
      const text = result.messages[0].content.text;
      const callMatches = text.match(/Call: `/g) || [];
      assert.strictEqual(callMatches.length, 7, `expected 7 Call: lines, got ${callMatches.length}`);
    });

    it('should include all 7 expected tool calls in order', () => {
      const result = getPrompt('submit-form', {
        url: 'https://example.com/register',
        fields: { '#email': 'user@test.com' }
      });
      const text = result.messages[0].content.text;
      const callLines = (text.match(/Call: `[^`]+`/g) || []).map(s => s.replace(/^Call: `/, '').replace(/`$/, ''));
      const expectedTools = ['browser_open', 'browser_snapshot', 'browser_form_validate', 'browser_form_fill', 'browser_click', 'browser_assert', 'evidence'];
      for (let i = 0; i < expectedTools.length; i++) {
        assert.ok(callLines[i].startsWith(expectedTools[i]), `step ${i + 1} should call ${expectedTools[i]}, got: ${callLines[i]}`);
      }
    });

    it('should throw Missing required arguments when url or fields absent', () => {
      assert.throws(
        () => getPrompt('submit-form', {}),
        /Missing required arguments/
      );
    });

    it('should throw when only url provided (fields missing)', () => {
      assert.throws(
        () => getPrompt('submit-form', { url: 'https://example.com' }),
        /Missing required arguments.*fields/
      );
    });

    it('should respect optional formSelector and submitSelector', () => {
      const result = getPrompt('submit-form', {
        url: 'https://example.com/register',
        fields: { '#email': 'a@b.com' },
        formSelector: '#signup-form',
        submitSelector: '#submit-btn',
        expectedText: '注册成功',
        expectedUrlContains: 'welcome'
      });
      const text = result.messages[0].content.text;
      assert.ok(text.includes('#signup-form'), 'should include custom formSelector');
      assert.ok(text.includes('#submit-btn'), 'should include custom submitSelector');
      assert.ok(text.includes('注册成功'), 'should include expectedText');
      assert.ok(text.includes('welcome'), 'should include expectedUrlContains');
    });
  });

  describe('getPrompt - unknown prompt', () => {
    it('should throw Unknown prompt for non-existent prompt name', () => {
      assert.throws(
        () => getPrompt('unknown-prompt', {}),
        /Unknown prompt/
      );
    });
  });

  describe('all 7 prompts buildMessages smoke test', () => {
    it('should produce >=3 Call: lines when called with minimum required args', () => {
      // 最小必填参数映射：每个 prompt 都能 buildMessages 不抛错且产出 ≥3 个 Call:
      const minArgs = {
        'validate-login': { url: 'https://example.com/login', username: 'tester', password: 'Pass1234!' },
        'audit-performance': { url: 'https://example.com' },
        'audit-security': { url: 'https://example.com' },
        'visual-regression': { url: 'https://example.com', baselineName: 'home-baseline' },
        'debug-page': { url: 'https://example.com', symptom: 'page blank' },
        'e2e-flow': { url: 'https://example.com', flowName: 'signup-flow' },
        'submit-form': { url: 'https://example.com/register', fields: { '#email': 'a@b.com' } }
      };

      for (const prompt of PROMPTS) {
        const args = minArgs[prompt.name];
        assert.ok(args, `missing min args for ${prompt.name}`);
        const messages = prompt.buildMessages(args);
        assert.ok(Array.isArray(messages) && messages.length > 0, `${prompt.name} should produce messages array`);
        const text = messages[0].content.text;
        const callCount = (text.match(/Call: `/g) || []).length;
        assert.ok(callCount >= 3, `${prompt.name} should produce >=3 Call: lines, got ${callCount}`);
      }
    });
  });
});
