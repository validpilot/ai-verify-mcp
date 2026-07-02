/**
 * Pattern Store - 累积的修复知识库
 * 从历史修复操作中学习的模式存储，供 AI 决策引擎参考
 * 
 * 数据来源：历史部署操作中验证有效的修复方案
 * 注意：模式中的 URL/IP/SQL 为历史记录，不表示当前环境可用
 */

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
  }
];

module.exports = { patternStore };
