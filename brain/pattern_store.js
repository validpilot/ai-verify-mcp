const patternStore = [
  {
    id: 'huoke-his-gateway-schema-fix',
    score: 2.0,
    title: 'HuoKe HIS gateway schema 修复参考',
    symptom: '多个 API 端点返回 404/500，schema.sql 中 DEFAULT 值缺少引号导致迁移失败',
    rootCause: 'schema.sql 中 DEFAULT <value> 缺少引号，导致整个数据库 schema 迁移失败',
    fix: '为 schema.sql 中缺少引号的 DEFAULT 值添加引号，删除 _migrations 表后重新执行迁移',
    tags: ['python', 'postgres', 'schema', 'flask', 'fastapi', 'huoke'],
    source: 'historical',
    createdAt: '2026-06-30T00:00:00.000Z'
  },
  {
    id: 'huoke-his-comprehensive-db-fix',
    score: 2.0,
    title: 'HuoKe HIS 综合数据库修复参考',
    symptom: '多表缺失列/缺失表/迁移未执行，导致多个端点 500',
    rootCause: 'ALTER TABLE ADD COLUMN IF NOT EXISTS（3处缺失列）+ CREATE TABLE（1处缺失表）+ migration 文件未自动执行',
    fix: 'ALTER TABLE 补充缺失列 + CREATE TABLE 创建缺失表 + 执行遗漏的 migration SQL 文件',
    tags: ['python', 'postgres', 'schema', 'flask', 'fastapi', 'huoke', 'missing-column', 'missing-table', 'migration'],
    source: 'historical',
    createdAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'cors-policy-error',
    score: 1.5,
    title: 'CORS 跨域策略错误',
    symptom: 'Access to XMLHttpRequest at ... from origin ... has been blocked by CORS policy',
    rootCause: '服务端未配置 Access-Control-Allow-Origin 响应头，或请求方式/头不在允许列表中',
    fix: '在后端服务器配置 CORS 中间件，添加 Access-Control-Allow-Origin、Access-Control-Allow-Methods、Access-Control-Allow-Headers 响应头',
    tags: ['cors', 'cross-origin', 'http', 'api', 'security', 'nginx', 'middleware'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'http-404-not-found',
    score: 1.5,
    title: 'HTTP 404 资源未找到',
    symptom: 'The requested URL ... was not found on this server / Failed to load resource: the server responded with a status of 404',
    rootCause: 'API 端点不存在、路由配置错误、资源路径错误或后端服务未正确部署',
    fix: '检查后端路由配置，确认 API 端点已正确注册；验证请求 URL 路径是否正确；检查后端服务是否正常运行',
    tags: ['http', '404', 'api', 'router', 'endpoint', 'route', 'not-found'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'http-401-unauthorized',
    score: 1.5,
    title: 'HTTP 401 未授权',
    symptom: '401 (Unauthorized) / Unauthorized - Invalid credentials or missing authentication token',
    rootCause: '缺少认证令牌、令牌过期、凭据错误或用户未登录',
    fix: '检查请求是否包含有效的 Authorization 头；验证令牌是否过期；确保用户已正确登录并获取有效令牌',
    tags: ['http', '401', 'auth', 'token', 'authentication', 'jwt', 'oauth', 'unauthorized'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'http-403-forbidden',
    score: 1.2,
    title: 'HTTP 403 禁止访问',
    symptom: 'Forbidden - Insufficient permissions to access the resource',
    rootCause: '用户身份已认证但缺少访问该资源的权限，或 IP 被黑名单限制',
    fix: '检查用户角色和权限配置；确认资源访问控制策略；验证 IP 白名单配置',
    tags: ['http', '403', 'authorization', 'permission', 'acl', 'rbac'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'http-500-server-error',
    score: 1.5,
    title: 'HTTP 500 服务器内部错误',
    symptom: 'Internal Server Error - Unexpected error on the server',
    rootCause: '后端代码抛出未捕获异常、数据库连接失败、配置错误或资源耗尽',
    fix: '查看后端日志定位具体错误；检查数据库连接状态；验证配置文件正确性；重启后端服务',
    tags: ['http', '500', 'server', 'error', 'exception', 'database'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'js-typeerror-undefined',
    score: 1.0,
    title: 'JavaScript TypeError: Cannot read properties of undefined',
    symptom: 'Uncaught TypeError: Cannot read properties of undefined (reading \'xxx\')',
    rootCause: '访问了未定义对象的属性，通常是异步数据未正确加载或条件判断缺失',
    fix: '添加空值检查（可选链操作符 ?. 或 if 判断）；确保异步数据在使用前已加载完成；检查数据初始化逻辑',
    tags: ['javascript', 'typeerror', 'undefined', 'null', 'async', 'frontend'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'js-typeerror-null',
    score: 1.0,
    title: 'JavaScript TypeError: Cannot read properties of null',
    symptom: 'Uncaught TypeError: Cannot read properties of null (reading \'xxx\')',
    rootCause: '访问了 null 对象的属性，通常是 DOM 元素未找到或 API 返回 null',
    fix: '检查 DOM 选择器是否正确；验证 API 响应数据结构；添加 null 检查；使用 Optional Chaining',
    tags: ['javascript', 'typeerror', 'null', 'dom', 'api', 'frontend'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'js-referenceerror',
    score: 1.0,
    title: 'JavaScript ReferenceError: xxx is not defined',
    symptom: 'Uncaught ReferenceError: xxx is not defined',
    rootCause: '使用了未声明的变量，或脚本加载顺序错误导致依赖未就绪',
    fix: '检查变量声明；确保脚本按正确顺序加载；使用模块系统管理依赖；检查作用域问题',
    tags: ['javascript', 'referenceerror', 'variable', 'scope', 'module', 'frontend'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'db-connection-error',
    score: 1.5,
    title: '数据库连接失败',
    symptom: 'Connection refused / Cannot connect to database / timeout',
    rootCause: '数据库服务未启动、连接配置错误、网络不可达或认证失败',
    fix: '检查数据库服务状态；验证连接字符串；确认网络连通性；检查数据库用户名密码',
    tags: ['database', 'connection', 'postgres', 'mysql', 'mongodb', 'redis'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'db-syntax-error',
    score: 1.0,
    title: 'SQL 语法错误',
    symptom: 'SQL syntax error at or near ... / column does not exist',
    rootCause: 'SQL 语句拼写错误、表名/列名错误或缺少引号',
    fix: '检查 SQL 语法；验证表名和列名；为字符串值添加引号；使用参数化查询',
    tags: ['database', 'sql', 'syntax', 'postgres', 'mysql'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'resource-load-failure',
    score: 0.8,
    title: '静态资源加载失败',
    symptom: 'Failed to load resource: the server responded with a status of 404 / net::ERR_CONNECTION_REFUSED',
    rootCause: '资源文件缺失、CDN 故障、网络问题或路径配置错误',
    fix: '检查资源文件是否存在；验证 CDN 配置；检查网络连接；确认资源路径配置',
    tags: ['resource', 'static', 'cdn', '404', 'css', 'js', 'image'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'uncaught-promise-rejection',
    score: 1.0,
    title: '未处理的 Promise 拒绝',
    symptom: 'Unhandled Promise Rejection: xxx',
    rootCause: 'Promise 链缺少 .catch() 处理，或 async/await 缺少 try/catch',
    fix: '为所有 Promise 添加 .catch()；使用 try/catch 包裹 async/await；全局注册 unhandledrejection 事件处理',
    tags: ['javascript', 'promise', 'async', 'error-handling', 'frontend'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  },
  {
    id: 'webpack-module-not-found',
    score: 1.0,
    title: 'Webpack 模块未找到',
    symptom: 'Module not found: Error: Can\'t resolve \'xxx\' in \'/path\'',
    rootCause: '依赖未安装、路径配置错误或模块名称拼写错误',
    fix: '执行 npm install 安装依赖；检查 import 路径；验证模块名称；清除缓存重新构建',
    tags: ['webpack', 'module', 'npm', 'build', 'frontend', 'vite'],
    source: 'common',
    createdAt: '2026-07-02T00:00:00.000Z'
  }
];

module.exports = { patternStore };