'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  SKILL_TOOLS_MAP,
  getSkillTools,
  getToolSkills,
  getAllSkillToolsMap,
  getReverseMap,
  validateConsistency,
  extractToolsFromPromptMessages
} = require('../handlers/skill_map');
const { PROMPTS } = require('../handlers/prompts');
const fs = require('node:fs');
const path = require('node:path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

describe('skill_map module', () => {
  describe('SKILL_TOOLS_MAP constant', () => {
    it('should expose exactly 7 skills', () => {
      assert.strictEqual(SKILL_TOOLS_MAP.length, 7);
    });

    it('should have all required fields per skill entry', () => {
      for (const skill of SKILL_TOOLS_MAP) {
        assert.ok(skill.skillName, 'skillName required');
        assert.ok(skill.promptName, 'promptName required');
        assert.ok(skill.docFile, 'docFile required');
        assert.ok(Array.isArray(skill.tools) && skill.tools.length > 0, 'tools array required');
        for (const t of skill.tools) {
          assert.ok(typeof t.name === 'string' && t.name.length > 0, 'tool.name required');
          assert.ok(typeof t.step === 'number', 'tool.step must be number');
          assert.ok(typeof t.required === 'boolean', 'tool.required must be boolean');
        }
      }
    });

    it('should include submit-form skill', () => {
      const names = SKILL_TOOLS_MAP.map(s => s.skillName);
      assert.ok(names.includes('submit-form'), `submit-form must be in map: ${names.join(', ')}`);
    });

    it('should have promptName matching a PROMPTS entry for each skill', () => {
      const promptNames = new Set(PROMPTS.map(p => p.name));
      for (const skill of SKILL_TOOLS_MAP) {
        assert.ok(promptNames.has(skill.promptName), `skill ${skill.skillName} promptName ${skill.promptName} not found in PROMPTS`);
      }
    });
  });

  describe('getSkillTools', () => {
    it('should return validate-login with 7 tools including browser_open, browser_click, browser_assert, evidence_pack', () => {
      const result = getSkillTools('validate-login');
      assert.ok(result, 'should not return null for known skill');
      assert.strictEqual(result.skillName, 'validate-login');
      const toolNames = result.tools.map(t => t.name);
      assert.strictEqual(toolNames.length, 7);
      assert.ok(toolNames.includes('browser_open'));
      assert.ok(toolNames.includes('browser_click'));
      assert.ok(toolNames.includes('browser_assert'));
      assert.ok(toolNames.includes('evidence_pack'));
      assert.ok(toolNames.includes('browser_wait'));
    });

    it('should return submit-form with 7 tools including browser_form_validate', () => {
      const result = getSkillTools('submit-form');
      assert.ok(result);
      const toolNames = result.tools.map(t => t.name);
      assert.strictEqual(toolNames.length, 7);
      assert.ok(toolNames.includes('browser_form_validate'));
      assert.ok(toolNames.includes('browser_form_fill'));
    });

    it('should return null for unknown skill', () => {
      assert.strictEqual(getSkillTools('unknown-skill'), null);
    });

    it('should return null for empty/null input', () => {
      assert.strictEqual(getSkillTools(''), null);
      assert.strictEqual(getSkillTools(null), null);
      assert.strictEqual(getSkillTools(undefined), null);
    });

    it('should return a deep copy (mutating result does not affect constant)', () => {
      const result = getSkillTools('validate-login');
      result.tools.push({ name: 'injected', step: 99, required: false, description: 'hack' });
      const fresh = getSkillTools('validate-login');
      assert.strictEqual(fresh.tools.length, 7, 'original SKILL_TOOLS_MAP should be unaffected');
    });
  });

  describe('getToolSkills', () => {
    it('should return >=5 skills that reference browser_open', () => {
      const skills = getToolSkills('browser_open');
      assert.ok(skills.length >= 5, `expected >=5, got ${skills.length}: ${skills.join(', ')}`);
      assert.ok(skills.includes('validate-login'));
      assert.ok(skills.includes('submit-form'));
      assert.ok(skills.includes('audit-performance'));
      assert.ok(skills.includes('visual-regression'));
      assert.ok(skills.includes('debug-page'));
    });

    it('should return 6 skills that reference evidence_pack (all except e2e-flow)', () => {
      const skills = getToolSkills('evidence_pack');
      assert.strictEqual(skills.length, 6, `expected 6, got ${skills.length}: ${skills.join(', ')}`);
      assert.ok(!skills.includes('e2e-flow'), 'e2e-flow should NOT reference evidence_pack');
    });

    it('should return skills that reference validation_run (only e2e-flow)', () => {
      const skills = getToolSkills('validation_run');
      assert.strictEqual(skills.length, 1);
      assert.strictEqual(skills[0], 'e2e-flow');
    });

    it('should return empty array for unknown tool', () => {
      assert.deepStrictEqual(getToolSkills('nonexistent_tool'), []);
    });

    it('should return empty array for empty/null input', () => {
      assert.deepStrictEqual(getToolSkills(''), []);
      assert.deepStrictEqual(getToolSkills(null), []);
    });
  });

  describe('getAllSkillToolsMap', () => {
    it('should return 7 skill entries', () => {
      const all = getAllSkillToolsMap();
      assert.strictEqual(all.length, 7);
    });

    it('should return deep copies (mutating does not affect constant)', () => {
      const all = getAllSkillToolsMap();
      all[0].tools.length = 0;
      all[0].skillName = 'mutated';
      const fresh = getAllSkillToolsMap();
      assert.strictEqual(fresh[0].skillName, 'validate-login');
      assert.ok(fresh[0].tools.length > 0);
    });
  });

  describe('getReverseMap', () => {
    it('should return object mapping toolName -> array of skillNames', () => {
      const reverse = getReverseMap();
      assert.ok(typeof reverse === 'object');
      assert.ok(Array.isArray(reverse.browser_open));
      assert.ok(Array.isArray(reverse.evidence_pack));
      assert.ok(Array.isArray(reverse.validation_run));
    });

    it('should not duplicate skillName when a tool appears once per skill', () => {
      const reverse = getReverseMap();
      for (const [tool, skills] of Object.entries(reverse)) {
        const unique = new Set(skills);
        assert.strictEqual(unique.size, skills.length, `tool ${tool} has duplicates: ${skills.join(', ')}`);
      }
    });
  });

  describe('extractToolsFromPromptMessages', () => {
    it('should extract tool names from Call: `tool_name( pattern', () => {
      const messages = [{
        role: 'user',
        content: { type: 'text', text: 'Call: `browser_open({ url: "x" })`\nCall: `browser_click({ selector: "y" })`' }
      }];
      const tools = extractToolsFromPromptMessages(messages);
      assert.deepStrictEqual(tools, ['browser_open', 'browser_click']);
    });

    it('should dedupe tool names', () => {
      const messages = [{
        role: 'user',
        content: { type: 'text', text: 'Call: `browser_open({ url: "x" })`\nCall: `browser_open({ url: "y" })`' }
      }];
      const tools = extractToolsFromPromptMessages(messages);
      assert.deepStrictEqual(tools, ['browser_open']);
    });

    it('should return empty array for non-array input', () => {
      assert.deepStrictEqual(extractToolsFromPromptMessages(null), []);
      assert.deepStrictEqual(extractToolsFromPromptMessages(undefined), []);
      assert.deepStrictEqual(extractToolsFromPromptMessages('string'), []);
    });
  });

  describe('validateConsistency', () => {
    // 准备真实的 availableTools（从 tools/ 目录读取）
    const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    const availableTools = toolFiles.map(f => path.basename(f, '.json'));

    it('should pass for all 7 skills against real tools/ directory', () => {
      const result = validateConsistency({
        availableTools,
        prompts: PROMPTS
      });
      assert.strictEqual(result.summary.total, 7);
      assert.strictEqual(result.summary.passed, 7);
      assert.ok(result.passed, `expected passed:true, missing: ${JSON.stringify(result.skills.filter(s => !s.passed).map(s => ({ skill: s.skillName, missing: s.missing })), null, 2)}`);
    });

    it('should detect missing tool when availableTools is empty', () => {
      const result = validateConsistency({
        availableTools: [],
        prompts: PROMPTS
      });
      assert.strictEqual(result.passed, false);
      assert.ok(result.summary.passed < 7);
      // 每个 skill 都应有 missing
      for (const skill of result.skills) {
        assert.ok(skill.missing.length > 0, `${skill.skillName} should have missing tools`);
      }
    });

    it('should filter to single skill when filterSkill provided', () => {
      const result = validateConsistency({
        availableTools,
        prompts: PROMPTS,
        filterSkill: 'validate-login'
      });
      assert.strictEqual(result.summary.total, 1);
      assert.strictEqual(result.skills[0].skillName, 'validate-login');
    });

    it('should return empty skills array for unknown filterSkill', () => {
      const result = validateConsistency({
        availableTools,
        prompts: PROMPTS,
        filterSkill: 'unknown-skill'
      });
      assert.strictEqual(result.summary.total, 0);
      assert.strictEqual(result.skills.length, 0);
      // 没有 skill = 没有 fail = passed:true
      assert.strictEqual(result.passed, true);
    });

    it('should include mapDrift field per skill (may be empty array if no drift)', () => {
      const result = validateConsistency({
        availableTools,
        prompts: PROMPTS
      });
      for (const skill of result.skills) {
        assert.ok(Array.isArray(skill.mapDrift), `${skill.skillName} must have mapDrift array`);
      }
    });

    it('should detect mapDrift when SKILL_TOOLS_MAP lists required tool not in prompt', () => {
      // 用一个伪造的 prompts 数组，validate-login prompt 不调用 browser_open
      // 构造一个最小伪 prompt
      const fakePrompts = [{
        name: 'validate-login',
        description: 'fake',
        arguments: [{ name: 'url', required: true }, { name: 'username', required: true }, { name: 'password', required: true }],
        buildMessages: () => [{
          role: 'user',
          content: { type: 'text', text: 'Call: `browser_snapshot()`\nCall: `evidence_pack()`' }
        }]
      }];
      const result = validateConsistency({
        availableTools,
        prompts: fakePrompts,
        filterSkill: 'validate-login'
      });
      const skillResult = result.skills[0];
      const driftTypes = skillResult.mapDrift.map(d => d.type);
      assert.ok(driftTypes.includes('missing_in_prompt'), `expected missing_in_prompt drift, got: ${JSON.stringify(skillResult.mapDrift)}`);
    });

    it('should not fail (only warn) when mapDrift exists but all tools are available', () => {
      // 全部工具都可用但 prompt 与 map 不匹配 → passed:true (drift 是 warning)
      const fakePrompts = [{
        name: 'validate-login',
        description: 'fake',
        arguments: [{ name: 'url', required: true }, { name: 'username', required: true }, { name: 'password', required: true }],
        buildMessages: () => [{
          role: 'user',
          content: { type: 'text', text: 'Call: `browser_snapshot()`' }
        }]
      }];
      const result = validateConsistency({
        availableTools,
        prompts: fakePrompts,
        filterSkill: 'validate-login'
      });
      assert.strictEqual(result.passed, true, 'mapDrift should NOT cause passed:false');
      assert.ok(result.summary.warnings > 0, 'warnings should be > 0');
    });

    it('should handle missing prompts parameter gracefully', () => {
      const result = validateConsistency({
        availableTools
        // prompts 参数不传
      });
      // 仍然能跑完，每个 skill 的 mapDrift 包含 prompt_not_found
      for (const skill of result.skills) {
        const driftTypes = skill.mapDrift.map(d => d.type);
        assert.ok(driftTypes.includes('prompt_not_found'), `${skill.skillName} should have prompt_not_found drift`);
      }
    });
  });
});
