'use strict';

class DualChainOrchestrator {
  constructor(options = {}) {
    this.callTool = options.callTool || null;
    this.log = options.log || (() => {});
    this.maxIterations = options.maxIterations || 5;
  }

  async execute(target, options = {}) {
    if (!target) {
      throw new Error('DualChainOrchestrator.execute 需要 target 参数');
    }

    const sessionId = options.sessionId || `dual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const chains = options.chains || ['functional', 'technical'];
    const explorationMode = options.explorationMode || 'normal';
    const autoFix = options.autoFix !== false;
    const writeToMemory = options.writeToMemory !== false;

    this.log('INFO', `[DualChain] 双链路探索启动 ${sessionId}`, { target, chains, explorationMode });

    const startTime = Date.now();

    const runFunctional = chains.includes('functional');
    const runTechnical = chains.includes('technical');

    const [functionalResult, technicalResult] = await Promise.all([
      runFunctional ? this._runFunctionalChain(target, options, sessionId) : Promise.resolve(null),
      runTechnical ? this._runTechnicalChain(target, options, sessionId) : Promise.resolve(null)
    ]);

    const crossValidation = runFunctional && runTechnical
      ? this._detectChainBreaks(functionalResult, technicalResult)
      : { verdict: { level: 'incomplete', label: '⚠️ 单链路', description: '仅执行了一条链路，无法交叉验证' }, breaks: [], matrix: null, summary: { totalBreaks: 0, critical: 0, high: 0, medium: 0, low: 0 } };

    this.log('INFO', `[DualChain] 交叉验证完成: ${crossValidation.verdict.label}`, {
      totalBreaks: crossValidation.summary?.totalBreaks || 0,
      critical: crossValidation.summary?.critical || 0
    });

    const synthesisResult = await this._runSynthesis(target, sessionId, options, functionalResult, technicalResult, crossValidation);

    let fixResult = null;
    if (autoFix && crossValidation.breaks && crossValidation.breaks.length > 0) {
      fixResult = await this._runAutoFix(target, sessionId, crossValidation, options);
    }

    const elapsed = Date.now() - startTime;

    return {
      sessionId,
      target,
      chains: {
        functional: functionalResult ? { status: 'completed', ...this._summarizeChainResult(functionalResult) } : null,
        technical: technicalResult ? { status: 'completed', ...this._summarizeChainResult(technicalResult) } : null
      },
      crossValidation,
      synthesis: synthesisResult,
      fix: fixResult,
      timing: {
        totalMs: elapsed,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString()
      }
    };
  }

  async _runFunctionalChain(target, options, sessionId) {
    this.log('INFO', `[DualChain:Functional] 链路① 启动`);
    const mode = options.explorationMode || 'normal';

    const features = [];
    const allFindings = [];
    let overallStatus = 'success';

    this.log('DEBUG', `[DualChain:Functional] Phase1 功能发现`);
    const featureMap = await this._discoverFeatures(target, sessionId);
    features.push({ phase: 'discovery', name: '功能发现', status: 'completed', data: featureMap });

    if (!featureMap || featureMap.length === 0) {
      this.log('WARN', `[DualChain:Functional] 未发现任何功能入口`);
      return { overallStatus: 'fail', features: [], findings: [], summary: '未发现任何功能入口' };
    }

    this.log('DEBUG', `[DualChain:Functional] Phase2 正向验证 — ${featureMap.length} 个功能`);
    for (const feature of featureMap) {
      try {
        const happyPathResult = await this._runHappyPath(target, feature, sessionId);
        feature.happyPath = happyPathResult;
        if (happyPathResult.status !== 'success') {
          overallStatus = 'fail';
          allFindings.push({
            phase: 'happy_path',
            feature: feature.name,
            type: 'FUNCTIONAL_FAILURE',
            severity: happyPathResult.severity || 'high',
            description: `正向流程失败: ${happyPathResult.error || '未知错误'}`,
            evidence: happyPathResult.evidence
          });
        }
      } catch (e) {
        this.log('WARN', `[DualChain:Functional] 正向验证失败: ${feature.name}`, { error: e.message });
      }
    }

    if (mode !== 'normal') {
      this.log('DEBUG', `[DualChain:Functional] Phase3 黑客对抗 (mode=${mode})`);
      for (const feature of featureMap) {
        try {
          const adversarialResult = await this._runAdversarial(target, feature, sessionId, mode);
          feature.adversarial = adversarialResult;
          if (adversarialResult.findings && adversarialResult.findings.length > 0) {
            overallStatus = 'fail';
            allFindings.push(...adversarialResult.findings.map(f => ({
              phase: 'adversarial',
              feature: feature.name,
              ...f
            })));
          }
        } catch (e) {
          this.log('WARN', `[DualChain:Functional] 对抗探索失败: ${feature.name}`, { error: e.message });
        }
      }
    }

    this.log('DEBUG', `[DualChain:Functional] Phase4 功能闭环验证`);
    for (const feature of featureMap) {
      try {
        const closureResult = await this._runClosureCheck(target, feature, sessionId);
        feature.closure = closureResult;
        if (closureResult.breaks && closureResult.breaks.length > 0) {
          overallStatus = 'fail';
          allFindings.push(...closureResult.breaks.map(b => ({
            phase: 'closure',
            feature: feature.name,
            ...b
          })));
        }
      } catch (e) {
        this.log('WARN', `[DualChain:Functional] 闭环验证失败: ${feature.name}`, { error: e.message });
      }
    }

    return {
      overallStatus,
      features: featureMap,
      findings: allFindings,
      overallSummary: `功能链路完成: ${featureMap.length} 个功能, ${allFindings.length} 个问题`
    };
  }

  async _discoverFeatures(target, sessionId) {
    const features = [];
    try {
      await this._callToolSafe('browser_navigate', { url: target, sessionId });
      await this._callToolSafe('browser_wait', { ms: 2000 });

      const snapshot = await this._callToolSafe('browser_snapshot', { sessionId });

      const dom = await this._callToolSafe('browser_dom', { selector: 'body', sessionId });

      const links = await this._callToolSafe('browser_links', { sessionId });
      if (links) {
        const linkData = this._parseResult(links);
        const linkItems = linkData?.links || linkData || [];
        for (const link of (Array.isArray(linkItems) ? linkItems : [])) {
          const name = link.text || link.href || link;
          if (name && !features.find(f => f.name === name)) {
            features.push({
              name: typeof name === 'string' ? name : String(name),
              type: 'link',
              selector: link.selector || `a[href*="${link.href}"]`,
              url: link.href || target
            });
          }
        }
      }

      const buttons = await this._callToolSafe('browser_find_element', { selector: 'button, [role="button"], input[type="submit"]', sessionId });
      if (buttons) {
        const btnData = this._parseResult(buttons);
        const btnItems = btnData?.elements || btnData || [];
        for (const btn of (Array.isArray(btnItems) ? btnItems : [])) {
          const name = btn.text || btn.id || btn.name || `button-${features.length}`;
          if (!features.find(f => f.name === name)) {
            features.push({
              name: typeof name === 'string' ? name : String(name),
              type: 'button',
              selector: btn.selector || `#${btn.id}`
            });
          }
        }
      }

      const inputs = await this._callToolSafe('browser_find_element', { selector: 'input:not([type="hidden"]), textarea, select', sessionId });
      if (inputs) {
        const inputData = this._parseResult(inputs);
        const inputItems = inputData?.elements || inputData || [];
        for (const input of (Array.isArray(inputItems) ? inputItems : [])) {
          const name = input.name || input.id || input.placeholder || `input-${features.length}`;
          if (!features.find(f => f.name === name)) {
            features.push({
              name: typeof name === 'string' ? name : String(name),
              type: 'input',
              selector: input.selector || `[name="${input.name}"]`
            });
          }
        }
      }

      this.log('INFO', `[DualChain:Functional] 发现 ${features.length} 个功能入口`);
    } catch (e) {
      this.log('WARN', `[DualChain:Functional] 功能发现失败`, { error: e.message });
    }
    return features;
  }

  async _runHappyPath(target, feature, sessionId) {
    try {
      const result = await this._callToolSafe('browser_smart_fill', {
        selector: feature.selector,
        sessionId,
        fillStrategy: 'realistic'
      });

      if (feature.type === 'button') {
        await this._callToolSafe('browser_click', { selector: feature.selector, sessionId });
        await this._callToolSafe('browser_wait', { ms: 1000 });
      }

      const screenshot = await this._callToolSafe('browser_screenshot', { sessionId });

      const errors = await this._callToolSafe('browser_errors', { sessionId });
      const errorData = this._parseResult(errors);
      const hasErrors = errorData?.errors?.length > 0 || errorData?.length > 0;

      return {
        status: hasErrors ? 'fail' : 'success',
        visibleResult: '操作完成',
        screenshot: !!screenshot,
        hasErrors
      };
    } catch (e) {
      return { status: 'fail', error: e.message };
    }
  }

  async _runAdversarial(target, feature, sessionId, mode) {
    const findings = [];
    const isHacker = mode === 'hacker';

    if (feature.type === 'input') {
      const boundaryPayloads = [
        { value: '', label: '空值' },
        { value: 'x'.repeat(10000), label: '超长字符串(10000字符)' },
        { value: '<script>alert(1)</script>', label: 'XSS注入' },
        { value: "'; DROP TABLE users;--", label: 'SQL注入' },
        { value: '-1', label: '负数' },
        { value: '99999999999999999999', label: '超大数字' },
        { value: '🎉🎉🎉', label: 'Emoji' },
        { value: '../../../etc/passwd', label: '路径遍历' }
      ];

      for (const payload of boundaryPayloads) {
        try {
          await this._callToolSafe('browser_type', { selector: feature.selector, text: payload.value, sessionId });
          const errors = await this._callToolSafe('browser_errors', { sessionId });
          const errorData = this._parseResult(errors);
          if (errorData?.errors?.length > 0 || (Array.isArray(errorData) && errorData.length > 0)) {
            findings.push({
              type: 'BOUNDARY_CRASH',
              severity: mode === 'hacker' ? 'high' : 'medium',
              description: `边界值"${payload.label}"导致错误`,
              payload: payload.label
            });
          }
        } catch (e) {
          findings.push({
            type: 'BOUNDARY_EXCEPTION',
            severity: 'high',
            description: `边界值"${payload.label}"导致异常: ${e.message}`,
            payload: payload.label
          });
        }
      }
    }

    if (feature.type === 'button') {
      try {
        await this._callToolSafe('browser_click', { selector: feature.selector, sessionId });
        await this._callToolSafe('browser_click', { selector: feature.selector, sessionId });
        const errors = await this._callToolSafe('browser_errors', { sessionId });
        const errorData = this._parseResult(errors);
        if (errorData?.errors?.length > 0) {
          findings.push({
            type: 'DOUBLE_SUBMIT',
            severity: 'high',
            description: '快速连续点击导致重复提交或错误'
          });
        }
      } catch (e) { }
    }

    if (isHacker) {
      try {
        const hackerPaths = [
          '/.git/config', '/.env', '/backup', '/wp-admin',
          '/phpmyadmin', '/actuator', '/swagger-ui.html', '/api-docs',
          '/.DS_Store', '/robots.txt', '/sitemap.xml', '/admin',
          '/config.json', '/debug', '/test', '/tmp'
        ];
        for (const path of hackerPaths) {
          const fullUrl = target.replace(/\/$/, '') + path;
          try {
            await this._callToolSafe('browser_navigate', { url: fullUrl, sessionId });
            const status = await this._callToolSafe('browser_element_status', { selector: 'body', sessionId });
            if (status) {
              findings.push({
                type: 'SENSITIVE_PATH_EXPOSED',
                severity: 'critical',
                description: `敏感路径可访问: ${path}`,
                url: fullUrl
              });
            }
          } catch (_) { }
        }
      } catch (e) {
        this.log('WARN', `[DualChain:Functional] 黑客路径探测失败`, { error: e.message });
      }
    }

    return { findings };
  }

  async _runClosureCheck(target, feature, sessionId) {
    const breaks = [];

    if (feature.type === 'button' && (feature.name.includes('创建') || feature.name.includes('新增') || feature.name.includes('添加'))) {
      try {
        const beforeSnapshot = await this._callToolSafe('browser_screenshot', { sessionId });
        await this._callToolSafe('browser_click', { selector: feature.selector, sessionId });
        await this._callToolSafe('browser_wait', { ms: 2000 });
        const afterSnapshot = await this._callToolSafe('browser_screenshot', { sessionId });

        if (!afterSnapshot) {
          breaks.push({
            type: 'CLOSURE_CREATE',
            severity: 'critical',
            description: `点击"${feature.name}"后页面无响应`
          });
        }
      } catch (e) {
        breaks.push({
          type: 'CLOSURE_CREATE',
          severity: 'critical',
          description: `创建闭环异常: ${e.message}`
        });
      }
    }

    if (feature.type === 'input') {
      try {
        await this._callToolSafe('browser_type', { selector: feature.selector, text: 'test-value', sessionId });
        const value = await this._callToolSafe('browser_eval', {
          expression: `document.querySelector('${feature.selector.replace(/'/g, "\\'")}')?.value`,
          sessionId
        });
        if (!value || !String(value).includes('test-value')) {
          breaks.push({
            type: 'CLOSURE_EDIT',
            severity: 'high',
            description: `输入框"${feature.name}"的值未生效`
          });
        }
      } catch (e) {
        breaks.push({
          type: 'CLOSURE_EDIT',
          severity: 'high',
          description: `编辑闭环异常: ${e.message}`
        });
      }
    }

    return { breaks };
  }

  async _runTechnicalChain(target, options, sessionId) {
    this.log('INFO', `[DualChain:Technical] 链路② 启动`);

    const features = [];
    let overallStatus = 'success';

    this.log('DEBUG', `[DualChain:Technical] Phase1 前端层`);
    const frontendResult = await this._traceFrontend(target, sessionId);
    features.push({ phase: 'frontend', name: '前端层', status: 'completed', data: frontendResult });

    this.log('DEBUG', `[DualChain:Technical] Phase2 API层`);
    const apiResult = await this._traceAPI(target, sessionId, frontendResult);
    features.push({ phase: 'api', name: 'API层', status: 'completed', data: apiResult });

    this.log('DEBUG', `[DualChain:Technical] Phase3 后端层`);
    const backendResult = await this._traceBackend(target, sessionId);
    features.push({ phase: 'backend', name: '后端层', status: 'completed', data: backendResult });

    this.log('DEBUG', `[DualChain:Technical] Phase4 数据库层`);
    const dbResult = await this._traceDatabase(target, sessionId, options);
    features.push({ phase: 'database', name: '数据库层', status: 'completed', data: dbResult });

    const apiResponses = apiResult?.responses || [];
    const dbDiff = dbResult?.diff || {};

    if (frontendResult?.hasErrors || apiResult?.hasErrors || backendResult?.hasErrors) {
      overallStatus = 'fail';
    }

    return {
      overallStatus,
      features,
      apiResponses,
      dbDiff,
      overallSummary: `技术链路完成: 前端${frontendResult?.requests?.length || 0}个请求, API${apiResponses.length}个响应, 数据库${Object.keys(dbDiff?.tables || {}).length}个表`
    };
  }

  async _traceFrontend(target, sessionId) {
    try {
      await this._callToolSafe('browser_navigate', { url: target, sessionId });
      await this._callToolSafe('browser_wait', { ms: 3000 });

      const [network, console_, errors] = await Promise.all([
        this._callToolSafe('browser_network', { sessionId }),
        this._callToolSafe('browser_console', { sessionId }),
        this._callToolSafe('browser_errors', { sessionId })
      ]);

      const networkData = this._parseResult(network);
      const consoleData = this._parseResult(console_);
      const errorData = this._parseResult(errors);

      return {
        requests: networkData?.requests || networkData || [],
        consoleLogs: consoleData?.logs || consoleData || [],
        errors: errorData?.errors || errorData || [],
        hasErrors: (errorData?.errors?.length || (Array.isArray(errorData) && errorData.length) || 0) > 0
      };
    } catch (e) {
      this.log('WARN', `[DualChain:Technical] 前端追踪失败`, { error: e.message });
      return { requests: [], consoleLogs: [], errors: [], hasErrors: false };
    }
  }

  async _traceAPI(target, sessionId, frontendResult) {
    const responses = [];
    let hasErrors = false;

    try {
      const requests = frontendResult?.requests || [];
      for (const req of (Array.isArray(requests) ? requests.slice(0, 20) : [])) {
        try {
          const detail = await this._callToolSafe('browser_network_detail', {
            requestId: req.id || req.requestId,
            sessionId
          });
          const detailData = this._parseResult(detail);
          if (detailData) {
            const status = detailData.status || detailData.response?.status;
            responses.push({
              endpoint: detailData.url || req.url,
              method: detailData.method || req.method,
              status,
              data: detailData.response?.body || detailData.data,
              isError: status >= 400
            });
            if (status >= 400) hasErrors = true;
          }
        } catch (_) { }
      }

      try {
        await this._callToolSafe('browser_har_export', { sessionId });
      } catch (_) { }
    } catch (e) {
      this.log('WARN', `[DualChain:Technical] API追踪失败`, { error: e.message });
    }

    return { responses, hasErrors };
  }

  async _traceBackend(target, sessionId) {
    let hasErrors = false;
    const logs = [];

    try {
      const backendLogs = await this._callToolSafe('backend_logs', {
        target,
        tail: 100,
        sessionId
      });
      const logData = this._parseResult(backendLogs);
      if (logData) {
        const logEntries = logData.logs || logData.entries || logData || [];
        for (const entry of (Array.isArray(logEntries) ? logEntries : [])) {
          const text = typeof entry === 'string' ? entry : entry.message || entry.text || '';
          if (text.includes('error') || text.includes('Error') || text.includes('exception') || text.includes('Exception')) {
            hasErrors = true;
            logs.push({ level: 'ERROR', text });
          } else if (text.includes('warn') || text.includes('Warn')) {
            logs.push({ level: 'WARN', text });
          } else {
            logs.push({ level: 'INFO', text: text.slice(0, 200) });
          }
        }
      }

      try {
        const errorSummary = await this._callToolSafe('error_summary_md', { sessionId });
        if (errorSummary) {
          hasErrors = true;
        }
      } catch (_) { }
    } catch (e) {
      this.log('WARN', `[DualChain:Technical] 后端追踪失败`, { error: e.message });
    }

    return { logs, hasErrors };
  }

  async _traceDatabase(target, sessionId, options) {
    const dbConfig = options.dbConfig || {};
    const tables = dbConfig.tables || [];

    if (tables.length === 0) {
      return { diff: {}, schema: {}, orphanData: [], hasDiff: false };
    }

    try {
      return {
        diff: {},
        schema: {},
        orphanData: [],
        hasDiff: false,
        note: '数据库追踪需要 SSH/数据库连接配置'
      };
    } catch (e) {
      this.log('WARN', `[DualChain:Technical] 数据库追踪失败`, { error: e.message });
      return { diff: {}, schema: {}, orphanData: [], hasDiff: false };
    }
  }

  _detectChainBreaks(functionalResult, technicalResult) {
    const breaks = [];
    const matrix = {
      functional: { status: functionalResult?.overallStatus || 'unknown', summary: functionalResult?.overallSummary || '无数据' },
      technical: { status: technicalResult?.overallStatus || 'unknown', summary: technicalResult?.overallSummary || '无数据' },
      features: []
    };

    const funcFeatures = functionalResult?.features || [];
    const techApiResponses = technicalResult?.apiResponses || [];

    for (const feature of funcFeatures) {
      const featureBreaks = [];

      const apiResponse = techApiResponses.find(r => {
        if (!r?.endpoint) return false;
        const featureUrl = feature.url || '';
        return r.endpoint.includes(featureUrl) || featureUrl.includes(r.endpoint);
      });

      if (feature.happyPath?.status === 'success') {
        if (apiResponse?.isError) {
          featureBreaks.push({
            type: 'FALSE_SUCCESS',
            severity: 'critical',
            description: `功能显示成功但API返回错误: ${apiResponse.status}`,
            evidence: { feature: feature.name, apiEndpoint: apiResponse.endpoint, apiStatus: apiResponse.status }
          });
        }
      }

      if (feature.happyPath?.hasErrors && !apiResponse?.isError) {
        featureBreaks.push({
          type: 'RENDER_FAILURE',
          severity: 'high',
          description: `API返回成功但功能执行失败: ${feature.name}`,
          evidence: { feature: feature.name, apiEndpoint: apiResponse?.endpoint }
        });
      }

      if (featureBreaks.length > 0) {
        breaks.push(...featureBreaks);
        matrix.features.push({
          name: feature.name,
          type: feature.type,
          breaks: featureBreaks.length
        });
      }
    }

    const criticalBreaks = breaks.filter(b => b.severity === 'critical').length;
    const highBreaks = breaks.filter(b => b.severity === 'high').length;
    const mediumBreaks = breaks.filter(b => b.severity === 'medium').length;
    const lowBreaks = breaks.filter(b => b.severity === 'low').length;

    let verdict;
    if (criticalBreaks > 0) {
      verdict = { level: 'critical', label: '🔴 严重断裂', description: '发现关键链路断裂' };
    } else if (highBreaks > 0) {
      verdict = { level: 'high', label: '🟠 高度断裂', description: '发现高度链路断裂' };
    } else if (mediumBreaks > 0) {
      verdict = { level: 'medium', label: '🟡 中度断裂', description: '发现中度链路断裂' };
    } else if (breaks.length === 0) {
      verdict = { level: 'pass', label: '✅ 验证通过', description: '双链路交叉验证通过' };
    } else {
      verdict = { level: 'low', label: '🔵 轻微问题', description: '仅发现轻微问题' };
    }

    return {
      verdict,
      breaks,
      matrix,
      summary: {
        totalBreaks: breaks.length,
        critical: criticalBreaks,
        high: highBreaks,
        medium: mediumBreaks,
        low: lowBreaks
      }
    };
  }

  async _runSynthesis(target, sessionId, options, functionalResult, technicalResult, crossValidation) {
    this.log('DEBUG', `[DualChain:Synthesis] Phase5 合成`);

    const totalFindings = [
      ...(functionalResult?.findings || []),
      ...(crossValidation?.breaks || []).map(b => ({
        phase: 'cross_validation',
        type: b.type,
        severity: b.severity,
        description: b.description,
        evidence: b.evidence
      }))
    ];

    const report = {
      verdict: crossValidation?.verdict || { level: 'unknown', label: '未知' },
      totalFindings: totalFindings.length,
      bySeverity: {
        critical: totalFindings.filter(f => f.severity === 'critical').length,
        high: totalFindings.filter(f => f.severity === 'high').length,
        medium: totalFindings.filter(f => f.severity === 'medium').length,
        low: totalFindings.filter(f => f.severity === 'low').length
      },
      keyFindings: totalFindings.filter(f => f.severity === 'critical' || f.severity === 'high').slice(0, 10),
      chainBreakMatrix: crossValidation?.matrix || null,
      recommendations: this._generateRecommendations(crossValidation)
    };

    return {
      report,
      memoryWrite: { episodic: false, semantic: {}, procedural: [] }
    };
  }

  async _runAutoFix(target, sessionId, crossValidation, options) {
    this.log('INFO', `[DualChain:Fix] 自动修复启动 — ${crossValidation.breaks.length} 个断裂点`);

    try {
      const fixPipeline = await this._callToolSafe('auto_fix_pipeline', {
        target,
        sessionId,
        findings: crossValidation.breaks.map(b => ({
          type: b.type,
          severity: b.severity,
          description: b.description,
          evidence: b.evidence
        }))
      });

      return {
        status: 'completed',
        result: fixPipeline
      };
    } catch (e) {
      this.log('WARN', `[DualChain:Fix] 自动修复失败`, { error: e.message });
      return { status: 'failed', error: e.message };
    }
  }

  _generateRecommendations(crossValidation) {
    const recs = [];
    const breaks = crossValidation?.breaks || [];

    const hasFalseSuccess = breaks.some(b => b.type === 'FALSE_SUCCESS');
    const hasRenderFailure = breaks.some(b => b.type === 'RENDER_FAILURE');

    if (hasFalseSuccess) {
      recs.push('检查数据写入逻辑：确认 repository.save() / 事务提交 / 异常处理是否完整');
    }
    if (hasRenderFailure) {
      recs.push('检查前端状态管理：确认 API 响应后是否正确更新了 state/UI');
    }

    return recs;
  }

  _summarizeChainResult(result) {
    if (!result) return { features: 0, findings: 0 };
    return {
      features: result.features?.length || 0,
      findings: result.findings?.length || 0,
      overallStatus: result.overallStatus
    };
  }

  async _callToolSafe(name, args) {
    if (!this.callTool) return null;
    try {
      return await this.callTool(name, args);
    } catch (e) {
      this.log('WARN', `[DualChain] 工具调用失败: ${name}`, { error: e.message });
      return null;
    }
  }

  _parseResult(raw) {
    if (!raw) return null;
    
    let text = null;
    if (typeof raw === 'string') {
      text = raw;
    } else if (typeof raw === 'object') {
      if (raw.content && raw.content[0] && raw.content[0].text) {
        text = raw.content[0].text;
      } else if (raw.result && raw.result.content && raw.result.content[0] && raw.result.content[0].text) {
        text = raw.result.content[0].text;
      } else if (raw.result && typeof raw.result === 'object') {
        return raw.result;
      } else {
        return raw;
      }
    }
    
    if (text) {
      try {
        return JSON.parse(text);
      } catch (_) {
        return text;
      }
    }
    
    return raw;
  }
}

module.exports = { DualChainOrchestrator };
