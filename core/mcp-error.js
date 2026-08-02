'use strict';

/**
 * 标准化 MCP 错误输出
 * 
 * 所有 MCP 工具的错误输出统一使用此函数生成，
 * 确保包含 error、reason、suggestion 字段，
 * 让 AI 在工具调用失败时能获得可操作的排查指引。
 */

/**
 * 生成标准化的 MCP 错误响应
 * @param {string} message - 错误描述（必填）
 * @param {object} options - 可选配置
 * @param {string} options.error - 机器可读的错误码，如 'TOOL_NOT_FOUND'、'PARAM_MISSING'
 * @param {string} options.reason - 错误原因说明
 * @param {string} options.suggestion - 排查建议
 * @param {string} options.toolName - 工具名
 */
function mcpError(message, options = {}) {
  const {
    error = 'EXECUTION_ERROR',
    reason = '',
    suggestion = '',
    toolName = ''
  } = options;

  const errorObj = {
    error,
    message,
    reason: reason || `工具执行异常: ${message}`,
    suggestion: suggestion || '请检查参数是否正确，或查看文档获取使用说明'
  };

  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(errorObj, null, 2) }]
  };
}

/**
 * 参数缺失错误
 */
function mcpParamMissing(paramName, toolName, suggestion) {
  return mcpError(
    `缺少必需参数: ${paramName}`,
    {
      error: 'PARAM_MISSING',
      reason: `工具 ${toolName} 需要提供 ${paramName} 参数`,
      suggestion: suggestion || `请添加 ${paramName} 参数后重新调用`,
      toolName
    }
  );
}

/**
 * 页面未找到错误
 */
function mcpPageNotFound(toolName) {
  return mcpError(
    '当前没有打开任何页面',
    {
      error: 'PAGE_NOT_FOUND',
      reason: '需要先调用 browser_open 打开一个页面才能使用此工具',
      suggestion: '请先调用 browser_open 打开目标页面',
      toolName
    }
  );
}

/**
 * 元素未找到错误
 */
function mcpElementNotFound(selector, toolName) {
  return mcpError(
    `元素未找到: ${selector}`,
    {
      error: 'ELEMENT_NOT_FOUND',
      reason: `DOM 中未找到匹配选择器 "${selector}" 的元素`,
      suggestion: `请检查选择器是否正确，或使用 browser_find_element 智能查找元素`,
      toolName
    }
  );
}

module.exports = { mcpError, mcpParamMissing, mcpPageNotFound, mcpElementNotFound };
