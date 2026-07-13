'use strict';

/**
 * arch_reverse_probe — 开源版架构逆向探测
 *
 * 纯前端可访问信号逆向识别目标站点基础架构：
 *   1. 技术栈版本指纹（前端框架+版本号）
 *   2. 中间件链推断（Server、X-Powered-By、CSP、CORS）
 *   3. 端口旁路探测（同源常见端口）
 *   4. 容器化信号检测（Docker/K8s 元数据）
 *   5. CVE 初筛（基于版本号）
 *
 * 不依赖 SSH/DB 权限。
 */

const { redactString } = require('../core/redaction');

const tools = [
  'arch_reverse_probe'
];

async function handle(name, args, deps) {
  const { text, log, resetRuntimeLogs, ensurePage } = deps;

    if (name === 'arch_reverse_probe') {
      return await archReverseProbe(args, deps);
    }
    return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };}

/**
 * 已知 CVE 数据库（精简版，开源版仅包含常见框架的高危 CVE）
 * 生产环境应使用 NVD NIST API
 */
const KNOWN_CVES = [
  { cveId: 'CVE-2021-23337', severity: 'critical', component: 'lodash', versionRange: '<4.17.21', description: 'lodash 命令注入漏洞' },
  { cveId: 'CVE-2022-0227', severity: 'high', component: 'lodash', versionRange: '<4.17.6', description: 'lodash 原型链污染' },
  { cveId: 'CVE-2020-8192', severity: 'high', component: 'axios', versionRange: '<0.21.1', description: 'axios SSRF 漏洞' },
  { cveId: 'CVE-2021-3749', severity: 'high', component: 'axios', versionRange: '>=0.21.0,<0.21.2', description: 'axios ReDoS 漏洞' },
  { cveId: 'CVE-2023-45857', severity: 'high', component: 'axios', versionRange: '<1.6.0', description: 'axios CSRF Token 泄露' },
  { cveId: 'CVE-2022-24999', severity: 'high', component: 'express', versionRange: '<4.17.3', description: 'express qs 原型链污染' },
  { cveId: 'CVE-2024-29041', severity: 'high', component: 'express', versionRange: '<4.19.2', description: 'express 开放重定向' },
  { cveId: 'CVE-2023-43646', severity: 'high', component: 'next.js', versionRange: '<13.5.6', description: 'Next.js SSRF 漏洞' },
  { cveId: 'CVE-2024-34351', severity: 'critical', component: 'next.js', versionRange: '<14.1.1', description: 'Next.js Server Action SSRF' },
  { cveId: 'CVE-2023-29469', severity: 'high', component: 'react', versionRange: '<18.2.0', description: 'React XSS（开发模式）' },
  { cveId: 'CVE-2024-6387', severity: 'critical', component: 'openssh', versionRange: '<9.8', description: 'OpenSSH regreSSHion 漏洞' },
  { cveId: 'CVE-2021-41773', severity: 'critical', component: 'apache', versionRange: '2.4.49', description: 'Apache 路径遍历' },
  { cveId: 'CVE-2021-42013', severity: 'critical', component: 'apache', versionRange: '2.4.50', description: 'Apache 路径遍历绕过' },
  { cveId: 'CVE-2024-3094', severity: 'critical', component: 'xz', versionRange: '5.6.0-5.6.1', description: 'xz 后门漏洞' },
  { cveId: 'CVE-2022-0778', severity: 'critical', component: 'openssl', versionRange: '<3.0.2', description: 'OpenSQL 无限循环 DoS' },
  { cveId: 'CVE-2023-0286', severity: 'high', component: 'openssl', versionRange: '<3.0.8', description: 'OpenSSL 类型混淆' },
  { cveId: 'CVE-2023-44487', severity: 'high', component: 'nginx', versionRange: '<1.25.3', description: 'HTTP/2 快速重置攻击' },
  { cveId: 'CVE-2021-23017', severity: 'high', component: 'nginx', versionRange: '<1.20.1', description: 'nginx DNS 解析器漏洞' }
];

/**
 * 常见端口与服务映射
 */
const COMMON_PORTS = [
  { port: 80, service: 'HTTP' },
  { port: 443, service: 'HTTPS' },
  { port: 3000, service: 'Node.js/Next.js/React Dev' },
  { port: 4200, service: 'Angular Dev' },
  { port: 5000, service: 'Flask/.NET' },
  { port: 8000, service: 'Django/Python' },
  { port: 8080, service: 'HTTP Alt/Tomcat' },
  { port: 8443, service: 'HTTPS Alt' },
  { port: 9000, service: 'PHP-FPM/Portainer' },
  { port: 3306, service: 'MySQL' },
  { port: 5432, service: 'PostgreSQL' },
  { port: 6379, service: 'Redis' },
  { port: 27017, service: 'MongoDB' }
];

/**
 * 主探测函数
 */
async function archReverseProbe(args, deps) {
  const { ensurePage } = deps;
  const targetUrl = args.target || args.url;
  if (!targetUrl) {
    return { isError: true, content: [{ type: 'text', text: '缺少 target 参数' }] };
  }

  const probePorts = args.probePorts !== false;
  const probeDocker = args.probeDocker !== false;
  const probeCVE = args.probeCVE !== false;
  const customPorts = args.customPorts || [];
  const timeout = args.timeout || 5000;

  const result = {
    success: true,
    target: targetUrl,
    techStack: [],
    middleware: {},
    ports: [],
    container: { docker: false, kubernetes: false, evidence: [] },
    cveMatches: [],
    summary: { techCount: 0, openPorts: 0, cveCount: 0, criticalCves: 0, containerDetected: false }
  };

  try {
    const { target } = await ensurePage();
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await target.waitForTimeout(1500);

    // ====== Phase 1: 技术栈版本指纹 ======
    result.techStack = await detectTechStackWithVersion(target);

    // ====== Phase 2: 中间件链推断 ======
    result.middleware = await detectMiddlewareChain(target);

    // ====== Phase 3: 端口旁路探测 ======
    if (probePorts) {
      result.ports = await probeCommonPorts(target, targetUrl, customPorts, timeout);
    }

    // ====== Phase 4: 容器化信号检测 ======
    if (probeDocker) {
      result.container = await detectContainerSignals(target);
    }

    // ====== Phase 5: CVE 匹配 ======
    if (probeCVE) {
      result.cveMatches = matchCVEs(result.techStack, result.middleware);
    }

    // ====== Phase 6: 汇总 ======
    result.summary.techCount = result.techStack.length;
    result.summary.openPorts = result.ports.filter(p => p.accessible).length;
    result.summary.cveCount = result.cveMatches.length;
    result.summary.criticalCves = result.cveMatches.filter(c => c.severity === 'critical').length;
    result.summary.containerDetected = result.container.docker || result.container.kubernetes;

    result.nextSteps = [
      '使用 exploration_quick 获取页面技术栈和 API 端点',
      '使用 bypass_login 检测认证机制安全性',
      '使用 browser_full_audit 执行完整审计',
      result.summary.criticalCves > 0 ? `⚠️ 发现 ${result.summary.criticalCves} 个严重 CVE，建议立即处理` : '使用 browser_lighthouse_audit 执行性能审计'
    ];

    result.paidUpgradeHint = result.summary.cveCount > 0
      ? `开源版识别到 ${result.summary.cveCount} 个 CVE（含 ${result.summary.criticalCves} 个严重）。升级 Pro 启用 SSH 端口扫描、Docker 拓扑解析、中间件链深度分析、完整 NVD CVE 数据库。`
      : `开源版识别到 ${result.summary.techCount} 个技术栈组件。升级 Pro 启用 SSH 端口扫描、Docker 拓扑解析、CVE 实时查询（完整 NVD 数据库）。`;

  } catch (e) {
    result.success = false;
    result.error = e.message;
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/**
 * 检测技术栈及版本号
 */
async function detectTechStackWithVersion(page) {
  return await page.evaluate(() => {
    const stack = [];

    // React
    const reactRoot = document.querySelector('#root') || document.querySelector('#__next');
    const reactDevtools = typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
    const reactDataKey = Object.keys(document.querySelector('#root')?.dataset || {}).find(k => k.startsWith('data-react'));
    if (reactDevtools || reactRoot || reactDataKey) {
      let version = '';
      if (window.React && window.React.version) version = window.React.version;
      else if (reactDevtools && window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers) {
        const r = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
        const first = Object.values(r)[0];
        if (first && first.version) version = first.version;
      }
      stack.push({
        name: 'React',
        version,
        confidence: version ? 0.95 : 0.7,
        evidence: version ? `React DevTools + version ${version}` : 'React DevTools/root element'
      });
    }

    // Vue
    const vueDevtools = typeof window.__VUE_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
    const vueAttr = document.querySelector('[data-v-]') || document.querySelector('[data-v-');
    const vueApp = document.querySelector('#app') && (window.__VUE__ || window.Vue);
    if (vueDevtools || vueAttr || vueApp) {
      let version = '';
      if (window.Vue && window.Vue.version) version = window.Vue.version;
      else if (window.__VUE_APP__) {
        const v = window.__VUE_APP__.version;
        if (v) version = v;
      }
      stack.push({
        name: 'Vue.js',
        version,
        confidence: version ? 0.95 : 0.7,
        evidence: version ? `Vue DevTools + version ${version}` : 'Vue DevTools/data-v attribute'
      });
    }

    // Angular
    const ngVersion = window.ng?.version?.full || window.getAllAngularRootElements?.();
    const ngApp = document.querySelector('[ng-version]') || document.querySelector('app-root');
    if (ngApp) {
      const v = document.querySelector('[ng-version]')?.getAttribute('ng-version') || '';
      stack.push({
        name: 'Angular',
        version: v,
        confidence: v ? 0.95 : 0.7,
        evidence: v ? `ng-version=${v}` : 'app-root element'
      });
    }

    // Next.js
    const nextData = document.querySelector('#__NEXT_DATA__');
    const nextScript = document.querySelector('script[src*="_next/"]');
    if (nextData) {
      let version = '';
      try {
        const data = JSON.parse(nextData.textContent);
        version = data?.buildId?.slice(0, 8) || '';
      } catch (_) { /* optional probe, ignore errors */ }
      stack.push({
        name: 'Next.js',
        version,
        confidence: 0.9,
        evidence: '__NEXT_DATA__ script'
      });
    }

    // Nuxt
    const nuxtData = window.__NUXT__ || document.querySelector('#__NUXT_DATA__');
    if (nuxtData) {
      stack.push({
        name: 'Nuxt.js',
        version: '',
        confidence: 0.85,
        evidence: '__NUXT__ object'
      });
    }

    // jQuery
    if (window.jQuery || window.$) {
      const v = window.jQuery?.fn?.jquery || window.$?.fn?.jquery || '';
      stack.push({
        name: 'jQuery',
        version: v,
        confidence: v ? 0.95 : 0.7,
        evidence: v ? `jQuery.fn.jquery=${v}` : 'window.jQuery'
      });
    }

    // Lodash
    if (window._ && typeof window._.VERSION === 'string') {
      stack.push({
        name: 'lodash',
        version: window._.VERSION,
        confidence: 0.95,
        evidence: `_.VERSION=${window._.VERSION}`
      });
    }

    // axios
    if (window.axios) {
      stack.push({
        name: 'axios',
        version: window.axios.VERSION || '',
        confidence: 0.85,
        evidence: 'window.axios'
      });
    }

    // Bootstrap
    const bsCss = document.querySelector('link[href*="bootstrap"]');
    const bsScript = document.querySelector('script[src*="bootstrap"]');
    if (bsCss || bsScript) {
      const href = bsCss?.href || bsScript?.src || '';
      const m = href.match(/bootstrap[\/-]?(\d+\.\d+\.\d+)/);
      stack.push({
        name: 'Bootstrap',
        version: m ? m[1] : '',
        confidence: m ? 0.9 : 0.7,
        evidence: href.slice(0, 80)
      });
    }

    // Tailwind CSS
    const twScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent?.includes('tailwind'));
    if (twScript || document.querySelector('[class*="tw-"]') || document.querySelector('[class*="bg-blue-"]')) {
      stack.push({
        name: 'Tailwind CSS',
        version: '',
        confidence: 0.7,
        evidence: 'Tailwind utility classes detected'
      });
    }

    // Element UI / Ant Design
    const elementUi = document.querySelector('[class*="el-"]');
    const antd = document.querySelector('[class*="ant-"]');
    if (elementUi) {
      stack.push({
        name: 'Element UI',
        version: window.ELEMENT?.version || '',
        confidence: 0.85,
        evidence: 'el-* classes'
      });
    }
    if (antd) {
      stack.push({
        name: 'Ant Design',
        version: window.antd?.version || '',
        confidence: 0.85,
        evidence: 'ant-* classes'
      });
    }

    return stack;
  }).catch(() => []);
}

/**
 * 中间件链推断（通过 HTTP 头）
 */
async function detectMiddlewareChain(page) {
  const result = {
    server: '',
    poweredBy: '',
    cdn: '',
    waf: '',
    loadBalancer: '',
    csp: '',
    corsPolicy: ''
  };

  try {
    // 通过 Performance API 获取响应头
    const navInfo = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation');
      if (entries.length === 0) return {};
      const nav = entries[0];
      return { url: nav.name, type: nav.type };
    }).catch(() => ({}));

    // 通过 fetch 同源请求获取响应头
    const headerInfo = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { method: 'GET', credentials: 'omit', mode: 'same-origin' });
        const headers = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return headers;
      } catch (e) {
        return { error: e.message };
      }
    }, page.url()).catch(() => ({}));

    if (headerInfo && !headerInfo.error) {
      result.server = headerInfo['server'] || '';
      result.poweredBy = headerInfo['x-powered-by'] || '';
      result.csp = headerInfo['content-security-policy'] || '';
      result.corsPolicy = headerInfo['access-control-allow-origin'] || '';

      // CDN 识别
      if (headerInfo['x-cloud-trace-context']) result.cdn = 'Google Cloud';
      else if (headerInfo['x-amz-cf-id']) result.cdn = 'CloudFront';
      else if (headerInfo['x-fastly-request-id']) result.cdn = 'Fastly';
      else if (headerInfo['cf-ray']) result.cdn = 'Cloudflare';
      else if (headerInfo['x-akamai-transformed']) result.cdn = 'Akamai';

      // WAF 识别
      if (headerInfo['x-sucuri-id']) result.waf = 'Sucuri';
      else if (headerInfo['x-cdn']?.includes('incapsula')) result.waf = 'Incapsula';
      else if (headerInfo['server']?.toLowerCase().includes('cloudflare')) result.waf = 'Cloudflare WAF';

      // 负载均衡
      if (headerInfo['x-envoy-upstream-service-time']) result.loadBalancer = 'Envoy';
      else if (headerInfo['x-nginx-proxy']) result.loadBalancer = 'Nginx';
      else if (headerInfo['via']?.includes('haproxy')) result.loadBalancer = 'HAProxy';
      else if (headerInfo['x-amz-cf-id']) result.loadBalancer = 'AWS ALB';
    }
  } catch (_) { /* optional probe, ignore errors */ }

  return result;
}

/**
 * 端口旁路探测（同源常见端口）
 * 在浏览器上下文中执行，受同源策略限制
 */
async function probeCommonPorts(page, targetUrl, customPorts, timeout) {
  const urlObj = new URL(targetUrl);
  const hostname = urlObj.hostname;

  const portsToProbe = [
    ...new Set([
      ...COMMON_PORTS.map(p => p.port),
      ...customPorts
    ])
  ];

  // 在浏览器上下文中并发探测
  const results = await page.evaluate(async (hostname, portList, timeoutMs) => {
    const probeOne = async (port) => {
      const probeProtocol = port === 443 || port === 8443 ? 'https' : 'http';
      const probeUrl = `${probeProtocol}://${hostname}:${port}/`;

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 3000));

        const res = await fetch(probeUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
          redirect: 'manual'
        }).catch(e => ({ error: e.message }));

        clearTimeout(timer);
        const elapsed = Date.now() - start;

        // no-cors 模式下 status 总是 0，但能成功返回表示端口可达
        const accessible = !res.error;
        return { port, accessible, responseTime: elapsed };
      } catch (e) {
        return { port, accessible: false, responseTime: 0 };
      }
    }

    // 限制并发为 5
    const batchSize = 5;
    const all = [];
    for (let i = 0; i < portList.length; i += batchSize) {
      const batch = portList.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(p => probeOne(p)));
      all.push(...batchResults);
    }
    return all;
  }, hostname, portsToProbe, timeout).catch(() => []);

  // 补充 service 信息（在 Node 上下文中）
  return results.map(r => ({
    ...r,
    service: COMMON_PORTS.find(p => p.port === r.port)?.service || 'Unknown'
  }));
}

/**
 * 容器化信号检测
 */
async function detectContainerSignals(page) {
  const result = { docker: false, kubernetes: false, evidence: [] };

  try {
    // 1. 检查 HTTP 头中的容器化信号
    const headerInfo = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { method: 'GET', credentials: 'omit' });
        const headers = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return headers;
      } catch (e) {
        return {};
      }
    }, page.url()).catch(() => ({}));

    // Kubernetes 信号
    if (headerInfo['x-kubernetes-proxy-target']) {
      result.kubernetes = true;
      result.evidence.push('HTTP header: x-kubernetes-proxy-target');
    }
    if (headerInfo['server']?.includes('nginx-ingress')) {
      result.kubernetes = true;
      result.evidence.push('HTTP header: nginx-ingress controller');
    }
    if (headerInfo['x-envoy-upstream-service-time']) {
      result.evidence.push('Envoy proxy detected (commonly used in K8s service mesh)');
    }

    // 2. 探测 .dockerenv 文件（通过 fetch 尝试访问，通常会被拦截但有时会暴露）
      const dockerEnvProbe = await page.evaluate(async () => {
        // 尝试访问 /.dockerenv（前端通常返回 404，但有时会有不同响应）
        try {
          const res = await fetch('/.dockerenv', { method: 'HEAD' });
          return { status: res.status, type: res.type };
        } catch (e) {
          return { error: e.message };
        }
      });

      if (dockerEnvProbe.status === 200) {
        result.docker = true;
        result.evidence.push('/.dockerenv accessible (200)');
      }

    // 3. 探测 K8s API server（同源探测）
      const k8sProbe = await page.evaluate(async () => {
        try {
          // K8s API server 通常在 https://kubernetes.default.svc
          // 同源无法访问跨域，但有时集群内配置会暴露
          const res = await fetch('/api/v1/namespaces', { method: 'GET' });
          return { status: res.status, type: res.type };
        } catch (e) {
          return { error: e.message };
        }
      });

      if (k8sProbe.status === 401 || k8sProbe.status === 403) {
        result.kubernetes = true;
        result.evidence.push(`/api/v1/namespaces returned ${k8sProbe.status} (K8s API exposed)`);
      }

    // 4. 检查页面 JS 中是否泄露容器信息
    const containerHints = await page.evaluate(() => {
      const hints = [];
      const allText = document.documentElement.outerHTML;
      if (allText.includes('kubernetes.io')) hints.push('Page mentions kubernetes.io');
      if (allText.includes('docker.com')) hints.push('Page mentions docker.com');
      if (allText.includes('containerd')) hints.push('Page mentions containerd');
      if (allText.includes('DOCKER_')) hints.push('Docker env var reference');
      if (allText.includes('KUBERNETES_')) hints.push('Kubernetes env var reference');
      return hints;
    });

    if (containerHints.length > 0) {
      result.evidence.push(...containerHints);
      if (containerHints.some(h => h.includes('Kubernetes'))) result.kubernetes = true;
      if (containerHints.some(h => h.includes('Docker'))) result.docker = true;
    }
  } catch (_) { /* optional probe, ignore errors */ }

  return result;
}

/**
 * 基于识别到的版本号匹配 CVE
 */
function matchCVEs(techStack, middleware) {
  const matches = [];

  for (const tech of techStack) {
    if (!tech.version) continue;
    const componentName = tech.name.toLowerCase();
    for (const cve of KNOWN_CVES) {
      if (componentName.includes(cve.component.toLowerCase())) {
        // 简单版本比较（仅支持 < 和 = 等基本形式）
        const match = versionMatches(tech.version, cve.versionRange);
        if (match) {
          matches.push({
            cveId: cve.cveId,
            severity: cve.severity,
            component: tech.name,
            description: `${cve.description} (影响: ${cve.versionRange}, 当前: ${tech.version})`
          });
        }
      }
    }
  }

  // 中间件链 CVE 检测
  if (middleware.server) {
    const serverLower = middleware.server.toLowerCase();
    const apacheMatch = serverLower.match(/apache\/(\d+\.\d+\.\d+)/);
    const nginxMatch = serverLower.match(/nginx\/(\d+\.\d+\.\d+)/);
    const opensshMatch = serverLower.match(/openssh[_\/]?(\d+\.\d+p?\d*)/);
    const opensslMatch = serverLower.match(/openssl\/(\d+\.\d+\.\d+)/);

    const serverComponents = [
      { name: 'apache', version: apacheMatch?.[1] },
      { name: 'nginx', version: nginxMatch?.[1] },
      { name: 'openssh', version: opensshMatch?.[1] },
      { name: 'openssl', version: opensslMatch?.[1] }
    ];

    for (const comp of serverComponents) {
      if (!comp.version) continue;
      for (const cve of KNOWN_CVES) {
        if (cve.component === comp.name) {
          if (versionMatches(comp.version, cve.versionRange)) {
            matches.push({
              cveId: cve.cveId,
              severity: cve.severity,
              component: `${comp.name} (${middleware.server})`,
              description: `${cve.description} (影响: ${cve.versionRange}, 当前: ${comp.version})`
            });
          }
        }
      }
    }
  }

  return matches;
}

/**
 * 简单版本范围匹配
 */
function versionMatches(version, range) {
    if (range.startsWith('<')) {
      const target = range.slice(1).trim();
      return compareVersions(version, target) < 0;
    }
    if (range.startsWith('>=')) {
      const parts = range.slice(2).split(',');
      const min = parts[0].trim();
      const max = parts[1]?.trim();
      if (compareVersions(version, min) < 0) return false;
      if (max && max.startsWith('<')) {
        const maxV = max.slice(1).trim();
        return compareVersions(version, maxV) < 0;
      }
      return true;
    }
    // 精确匹配
    return version === range;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

module.exports = { tools, handle };
