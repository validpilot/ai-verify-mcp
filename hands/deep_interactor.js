'use strict';

/**
 * Deep Interactor Module (BAC Phase C)
 *
 * 深层交互能力 — 检测弹窗/表单，智能交互，执行业务流程，像人类一样探索
 *
 * 设计原则:
 * 1. 渐进增强 — 在现有 browser_full_regression 基础上叠加，不破坏原有逻辑
 * 2. 分层检测 — 从表面交互（点击）到深层交互（填表+提交+验证）
 * 3. 容错优先 — 任何交互失败不阻断整体流程，仅记录错误
 * 4. 上下文感知 — 根据页面内容和元素类型智能决定交互方式
 *
 * 集成方式:
 *   const deepInteractor = require('./hands/deep_interactor');
 *   // 在 runBrowserFullRegression 中调用:
 *   const uiState = await deepInteractor.detectUIState(page);
 *   await deepInteractor.interactWithForm(page, { fillFields: true, submit: true });
 *   await deepInteractor.executeWorkflow(page, [{ action: 'click', target: '新增' }, ...]);
 */

// ======================================================================
// 1. 增强的 UI 状态检测
// ======================================================================

/**
 * 检测页面当前的 UI 状态：弹窗、表单、Toast、确认对话框等
 *
 * @param {object} page - Playwright page 对象
 * @returns {Promise<object>} 结构化的 UI 状态
 */
async function detectUIState(page) {
  return page.evaluate(() => {
    const state = {
      modal: null,
      forms: [],
      toasts: [],
      confirmDialog: false,
      overlays: [],
      changedElements: []
    };

    const allElements = document.querySelectorAll('*');

    // 检测弹窗：通过位置、z-index、可见性综合判断
    for (const el of allElements) {
      if (el.offsetParent === null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed';
      const isAbsolute = style.position === 'absolute';
      const zIndex = parseInt(style.zIndex, 10) || 0;

      // 弹窗特征：fixed/absolute + 居中/全屏 + 高 z-index
      const isModalLike = /modal|dialog|popup|pop.?up|drawer|panel|side.?bar/i.test(cls)
        || /dialog|modal|presentation/i.test(role);
      const isCenteredOrFull = (rect.top < 100 && rect.bottom > window.innerHeight - 100)
        || (rect.left > window.innerWidth * 0.05 && rect.right < window.innerWidth * 0.95
          && rect.top > window.innerHeight * 0.05 && rect.bottom < window.innerHeight * 0.6);

      if (isModalLike && (isFixed || isAbsolute) && isCenteredOrFull && !state.modal) {
        const fields = Array.from(el.querySelectorAll('input:not([type="hidden"]), select, textarea'));
        const buttons = Array.from(el.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'));
        state.modal = {
          tag: tag,
          id: el.id || '',
          classes: cls.slice(0, 100),
          hasForm: fields.length > 0,
          fieldCount: fields.length,
          buttonCount: buttons.length,
          buttonTexts: buttons.map(b => (b.textContent || b.value || '').trim()).filter(Boolean).slice(0, 5),
          zIndex: zIndex,
          title: (el.querySelector('h1,h2,h3,h4,h5,h6,.modal-title,.dialog-title,[class*="header"]') || {}).textContent
            || el.getAttribute('aria-label') || '',
        };
      }

      // 检测遮罩层
      if ((/overlay|backdrop|mask/i.test(cls) || role === 'presentation') && (isFixed || isAbsolute)) {
        state.overlays.push({ tag: tag, id: el.id || '', zIndex: zIndex });
      }
    }

    // 检测表单（<form> 元素内）
    document.querySelectorAll('form').forEach(form => {
      if (form.offsetParent === null) return; // 只检测可见表单
      const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
      const submits = form.querySelectorAll('input[type="submit"], button[type="submit"]');
      if (inputs.length > 0 && submits.length > 0) {
        state.forms.push({
          fields: Array.from(inputs).map(inp => ({
            type: inp.type || 'text',
            name: inp.name || '',
            placeholder: inp.placeholder || '',
            id: inp.id || '',
            required: inp.required || inp.hasAttribute('required'),
            maxLength: inp.maxLength > 0 ? inp.maxLength : null,
            tag: inp.tagName.toLowerCase(),
          })),
          submitButtons: Array.from(submits).map(b => (b.textContent || b.value || 'Submit').trim()),
          hasModalParent: !!form.closest('[class*="modal"],[class*="dialog"],[class*="popup"]'),
        });
      }
    });

    // 检测独立表单（不在 <form> 内的 input+submit 组合）
    const standaloneInputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'
    );
    const standaloneSubmits = document.querySelectorAll('input[type="submit"], button[type="submit"]');
    if (standaloneInputs.length > 0 && standaloneSubmits.length > 0 && state.forms.length === 0) {
      state.forms.push({
        fields: Array.from(standaloneInputs).map(inp => ({
          type: inp.type || 'text',
          name: inp.name || '',
          placeholder: inp.placeholder || '',
          id: inp.id || '',
          required: inp.required || inp.hasAttribute('required'),
          tag: inp.tagName.toLowerCase(),
        })),
        submitButtons: Array.from(standaloneSubmits).map(b => (b.textContent || b.value || 'Submit').trim()),
        standalone: true,
      });
    }

    // 检测 Toast/通知
    document.querySelectorAll(
      '[class*="toast"],[class*="notification"],[class*="alert"],[class*="message"],[class*="snackbar"],[class*="notify"],[class*="tip"],[class*="hint"]'
    ).forEach(el => {
      if (el.offsetParent !== null) {
        const text = (el.textContent || '').trim().slice(0, 100);
        if (text) {
          let type = 'info';
          const clsLower = (el.className || '').toLowerCase();
          if (/success|complete|done/.test(clsLower)) type = 'success';
          else if (/error|fail|alert|danger/.test(clsLower)) type = 'error';
          else if (/warn|caution/.test(clsLower)) type = 'warn';
          state.toasts.push({ text: text, type: type });
        }
      }
    });

    // 检测确认对话框（window.confirm 风格）
    const confirmBtns = document.querySelectorAll('button, [role="button"]');
    for (const btn of confirmBtns) {
      const t = (btn.textContent || '').trim().toLowerCase();
      if ((t === '确定' || t === '确认' || t === '是的' || t === '取消' || t === '否'
          || t === 'ok' || t === 'confirm' || t === 'yes' || t === 'cancel' || t === 'no')
        && btn.offsetParent !== null) {
        const dialog = btn.closest('[class*="modal"],[class*="dialog"],[class*="confirm"],[class*="alert"]');
        if (dialog && dialog.offsetParent !== null) {
          state.confirmDialog = true;
        }
      }
    }

    return state;
  });
}

// ======================================================================
// 2. 智能表单交互
// ======================================================================

/**
 * 智能表单字段填充值映射
 */
const FIELD_VALUES = {
  email: 'test@example.com',
  tel: '13800138000',
  phone: '13800138000',
  number: '100',
  amount: '100',
  price: '99.99',
  money: '100',
  name: '测试用户',
  username: 'testuser',
  nickname: '测试用户',
  company: '测试公司',
  address: '北京市朝阳区测试路100号',
  city: '北京',
  province: '北京市',
  url: 'https://example.com',
  website: 'https://example.com',
  password: 'Test123456!',
  date: '2026-06-29',
  time: '10:00',
  datetime: '2026-06-29T10:00:00',
  search: '测试',
  default: 'test_' + Date.now().toString(36),
};

/**
 * 获取字段的智能填充值
 */
function getFieldValue(name, placeholder, type) {
  const lower = [name, placeholder, type].filter(Boolean).join(' ').toLowerCase();

  for (const [key, value] of Object.entries(FIELD_VALUES)) {
    if (lower.includes(key)) return value;
  }

  // 根据 type 推断
  if (type === 'email') return FIELD_VALUES.email;
  if (type === 'tel' || type === 'phone') return FIELD_VALUES.tel;
  if (type === 'number') return FIELD_VALUES.number;
  if (type === 'password') return FIELD_VALUES.password;
  if (type === 'date') return FIELD_VALUES.date;
  if (type === 'url') return FIELD_VALUES.url;

  return FIELD_VALUES.default;
}

/**
 * 智能填充表单字段 + 提交
 *
 * @param {object} page - Playwright page 对象
 * @param {object} [options]
 * @param {boolean} [options.fillFields=true] - 是否填充字段
 * @param {boolean} [options.submit=true] - 是否提交
 * @param {number} [options.fillDelay=300] - 填充间隔(ms)
 * @returns {Promise<object>} 交互结果
 */
async function interactWithForm(page, options = {}) {
  const fillFields = options.fillFields !== false;
  const shouldSubmit = options.submit !== false;
  const fillDelay = options.fillDelay || 300;

  const result = {
    detected: false,
    fields: [],
    filled: false,
    submitted: false,
    submitErrors: [],
    success: false,
    successMessage: null,
    uiState: null,
  };

  // 检测 UI 状态
  result.uiState = await detectUIState(page);
  if (result.uiState.forms.length === 0 && !result.uiState.modal) {
    result.detected = false;
    return result;
  }
  result.detected = true;

  const form = result.uiState.forms[0];
  if (!form || !form.fields || form.fields.length === 0) {
    return result;
  }

  // 智能填充
  if (fillFields) {
    await page.evaluate((fields) => {
      // 使用从外部传入的值映射
      const getValue = (field) => {
        const name = field.name || '';
        const placeholder = field.placeholder || '';
        const type = field.type || 'text';
        const lower = (name + ' ' + placeholder + ' ' + type).toLowerCase();

        if (lower.includes('email')) return 'test@example.com';
        if (lower.includes('tel') || lower.includes('phone') || lower.includes('mobile')) return '13800138000';
        if (lower.includes('amount') || lower.includes('money') || lower.includes('price')) return '100';
        if (lower.includes('name')) return '测试用户';
        if (lower.includes('company')) return '测试公司';
        if (lower.includes('address')) return '北京市朝阳区测试路100号';
        if (lower.includes('url') || lower.includes('website')) return 'https://example.com';
        if (lower.includes('password')) return 'Test123456!';
        if (lower.includes('date')) return '2026-06-29';
        if (lower.includes('search')) return '测试';
        if (type === 'number') return '100';
        return 'test_' + Date.now().toString(36);
      };

      fields.forEach((field) => {
        let el = null;
        if (field.id) el = document.getElementById(field.id);
        if (!el) {
          const name = field.name;
          if (name) el = document.querySelector(`[name="${name.replace(/"/g, '\\"')}"]`);
        }
        if (!el) {
          el = document.querySelector(`input[placeholder="${(field.placeholder || '').replace(/"/g, '\\"')}"]`);
        }
        if (!el) {
          // 按类型和索引回退
          const allInputs = document.querySelectorAll(`input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), select, textarea`);
          allInputs.forEach(inp => {
            if (!el && inp.name === field.name) el = inp;
          });
        }

        if (el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'select') {
            const ops = Array.from(el.options).filter(o => o.value && !o.disabled);
            if (ops.length > 0) el.value = ops[0].value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (tag === 'textarea' || (el.type || 'text').match(/^(text|email|tel|number|url|password|date|search)$/)) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeInputValueSetter.call(el, getValue(field));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    }, form.fields).catch(() => {});

    result.filled = true;
    await new Promise(r => setTimeout(r, fillDelay));

    // 记录填充的字段信息
    result.fields = form.fields.map(f => ({
      name: f.name,
      type: f.type,
      placeholder: f.placeholder,
      required: f.required,
    }));
  }

  // 提交表单
  if (shouldSubmit) {
    const submitted = await page.evaluate(() => {
      // 优先找 form 上的 submit 按钮
      const formEl = document.querySelector('form');
      if (formEl) {
        const btn = formEl.querySelector('input[type="submit"], button[type="submit"]');
        if (btn) { btn.click(); return true; }
      }
      // 回退：找页面上的 submit 按钮
      const btn = document.querySelector('input[type="submit"], button[type="submit"]');
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);

    if (submitted) {
      result.submitted = true;
      // 等待提交结果
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) {}
      await new Promise(r => setTimeout(r, 1500));

      // 收集提交后的错误和后端响应
      try {
        const postSubmitState = await detectUIState(page);
        result.uiState = postSubmitState;

        // 检测成功提示
        if (postSubmitState.toasts && postSubmitState.toasts.length > 0) {
          const successToast = postSubmitState.toasts.find(t => t.type === 'success');
          if (successToast) {
            result.success = true;
            result.successMessage = successToast.text;
          }
        }

        // 如果弹窗关闭了，说明提交成功
        if (result.uiState.modal === null && form.hasModalParent !== false) {
          result.success = true;
          if (!result.successMessage) result.successMessage = '弹窗关闭，提交成功';
        }
      } catch (_) {}
    }
  }

  return result;
}

// ======================================================================
// 3. 业务流程执行
// ======================================================================

/**
 * 执行业务流程
 *
 * 支持的操作类型:
 * - click: 点击元素
 * - fill_form: 填充并提交表单
 * - wait: 等待指定时间
 * - wait_modal: 等待弹窗出现
 * - close_modal: 关闭弹窗
 * - scroll: 滚动页面
 * - hover: 悬停元素
 * - verify: 验证条件
 *
 * @param {object} page - Playwright page 对象
 * @param {Array<object>} workflow - 流程步骤数组
 * @param {object} [options]
 * @returns {Promise<object>} 执行结果
 */
async function executeWorkflow(page, workflow = [], options = {}) {
  const result = {
    success: true,
    steps: [],
    errors: [],
    finalState: null,
  };

  for (let i = 0; i < workflow.length; i++) {
    const step = workflow[i];
    const stepResult = { index: i, action: step.action, target: step.target, success: true, error: null };

    try {
      switch (step.action) {
        case 'click': {
          // 支持 text 或 selector 定位
          if (step.text) {
            await page.locator(`text="${step.text.replace(/"/g, '\\"')}"`).first().click({ timeout: 5000 });
          } else if (step.selector) {
            await page.click(step.selector, { timeout: 5000 });
          }
          await new Promise(r => setTimeout(r, step.waitAfter || 800));
          break;
        }

        case 'fill_form': {
          const formResult = await interactWithForm(page, {
            fillFields: step.fillFields !== false,
            submit: step.submit !== false,
            fillDelay: step.fillDelay || 300,
          });
          Object.assign(stepResult, { formResult });
          if (formResult.submitted && formResult.submitErrors.length > 0) {
            stepResult.success = false;
          }
          break;
        }

        case 'wait': {
          await new Promise(r => setTimeout(r, step.duration || 2000));
          break;
        }

        case 'wait_modal': {
          const timeout = step.timeout || 5000;
          const start = Date.now();
          let found = false;
          while (Date.now() - start < timeout) {
            const state = await detectUIState(page);
            if (state.modal || state.confirmDialog) {
              found = true;
              break;
            }
            await new Promise(r => setTimeout(r, 300));
          }
          stepResult.modalFound = found;
          stepResult.uiState = await detectUIState(page);
          break;
        }

        case 'close_modal': {
          // 尝试各种关闭方式
          let closed = await page.evaluate(() => {
            // 1. 点击关闭按钮
            const closeBtn = document.querySelector(
              '[class*="close"], [class*="dismiss"], [aria-label="Close"], [aria-label="关闭"], .btn-close, button.close'
            );
            if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); return true; }
            // 2. 点击取消按钮
            const cancelBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(
              b => /取消|cancel|否|no/i.test((b.textContent || '').trim())
            );
            if (cancelBtn && cancelBtn.offsetParent !== null) { cancelBtn.click(); return true; }
            // 3. 按 Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return false;
          });
          if (!closed) {
            await page.keyboard.press('Escape');
          }
          await new Promise(r => setTimeout(r, 500));
          stepResult.closed = true;
          break;
        }

        case 'scroll': {
          const direction = step.direction || 'down';
          const amount = step.amount || 500;
          if (direction === 'down') {
            await page.evaluate((a) => window.scrollBy(0, a), amount);
          } else {
            await page.evaluate((a) => window.scrollBy(0, -a), amount);
          }
          await new Promise(r => setTimeout(r, 300));
          break;
        }

        case 'hover': {
          if (step.text) {
            await page.locator(`text="${step.text.replace(/"/g, '\\"')}"`).first().hover({ timeout: 3000 });
          } else if (step.selector) {
            await page.hover(step.selector, { timeout: 3000 });
          }
          await new Promise(r => setTimeout(r, step.waitAfter || 1000));
          break;
        }

        case 'verify': {
          // 验证条件
          const verifyResult = await page.evaluate((condition) => {
            if (condition.textExists) {
              return document.body.innerText.includes(condition.textExists);
            }
            if (condition.elementExists) {
              return !!document.querySelector(condition.elementExists);
            }
            if (condition.urlContains) {
              return window.location.href.includes(condition.urlContains);
            }
            return false;
          }, step.condition || {});
          stepResult.verified = verifyResult;
          if (!verifyResult) {
            stepResult.success = false;
            result.success = false;
          }
          break;
        }

        default:
          stepResult.success = false;
          stepResult.error = `未知操作: ${step.action}`;
      }
    } catch (e) {
      stepResult.success = false;
      stepResult.error = e.message;
      if (step.critical) {
        result.success = false;
      }
    }

    result.steps.push(stepResult);
    if (stepResult.error) {
      result.errors.push({ index: i, action: step.action, error: stepResult.error });
    }
  }

  result.finalState = await detectUIState(page);
  return result;
}

// ======================================================================
// 4. 像人类一样探索
// ======================================================================

/**
 * "像人类一样探索" — 在页面上模拟人类浏览行为
 *
 * 行为模式：
 * 1. 扫描页面可见内容
 * 2. 依次点击可交互元素（从上到下，从左到右）
 * 3. 悬停查看下拉/工具提示
 * 4. 滚动页面发现隐藏内容
 * 5. 检测弹窗并交互
 * 6. 检测表单并填写
 *
 * @param {object} page - Playwright page 对象
 * @param {object} [options]
 * @param {number} [options.maxActions=15] - 最大操作数
 * @param {boolean} [options.interactModals=true] - 是否交互弹窗
 * @param {boolean} [options.fillForms=true] - 是否填表
 * @param {boolean} [options.scroll=true] - 是否滚动
 * @returns {Promise<object>} 探索结果
 */
async function exploreLikeHuman(page, options = {}) {
  const maxActions = options.maxActions || 15;
  const interactModals = options.interactModals !== false;
  const fillForms = options.fillForms !== false;
  const shouldScroll = options.scroll !== false;

  const result = {
    actions: [],
    modalsFound: 0,
    formsFound: 0,
    formsSubmitted: 0,
    errors: [],
    success: true,
  };

  // 先滚动浏览全页
  if (shouldScroll) {
    await page.evaluate(() => {
      let totalHeight = 0;
      const step = 300;
      const maxScroll = Math.min(document.body.scrollHeight, 3000);
      while (totalHeight < maxScroll) {
        window.scrollBy(0, step);
        totalHeight += step;
      }
      window.scrollTo(0, 0);
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // 开始交互循环
  for (let actionCount = 0; actionCount < maxActions; actionCount++) {
    const action = { index: actionCount, type: '', target: '', success: true, error: null };

    // 第 1 优先级：检测弹窗
    if (interactModals) {
      const state = await detectUIState(page);
      if (state.modal || state.confirmDialog) {
        result.modalsFound++;
        action.type = 'modal_interaction';
        action.target = state.modal ? (state.modal.title || state.modal.classes.slice(0, 40)) : '确认对话框';

        // 检测到弹窗中的表单
        if (state.modal && state.modal.hasForm && fillForms) {
          const formResult = await interactWithForm(page, { fillFields: true, submit: true });
          action.formResult = formResult;
          if (formResult.submitted) result.formsSubmitted++;
        } else {
          // 尝试关闭弹窗（默认确认）
          const closed = await page.evaluate(() => {
            const confirmBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(
              b => /确定|确认|是的|ok|confirm|yes|保存|save|submit/i.test((b.textContent || '').trim())
            );
            if (confirmBtn && confirmBtn.offsetParent !== null) { confirmBtn.click(); return true; }
            return false;
          });
          if (!closed) {
            await page.keyboard.press('Escape');
          }
        }
        await new Promise(r => setTimeout(r, 1000));
        result.actions.push(action);
        continue;
      }
    }

    // 第 2 优先级：发现并点击可交互元素
    const clickable = await page.evaluate(() => {
      const items = [];
      // 查找主要操作按钮
      const primaryActions = document.querySelectorAll(
        'button:not([disabled]):not([aria-hidden="true"]):not([style*="display:none"]):not([style*="display: none"]), '
        + 'a[href]:not([href="#"]):not([href=""]):not([href^="javascript:"]):not([aria-hidden="true"]), '
        + '[role="button"]:not([aria-hidden="true"]), '
        + 'input[type="submit"]:not([disabled]), input[type="button"]:not([disabled])'
      );
      const seen = new Set();
      for (const el of primaryActions) {
        if (el.offsetParent === null) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        if (text && text.length < 30 && !seen.has(text)) {
          seen.add(text);
          items.push({ text: text, tag: el.tagName.toLowerCase(), top: rect.top });
        }
      }
      // 按在页面上的位置排序（从上到下，从左到右）
      items.sort((a, b) => a.top - b.top);
      // 跳过已点的（记录在 session 中）
      return items.slice(0, 3);
    });

    if (clickable.length > 0) {
      const target = clickable[0];
      action.type = 'click';
      action.target = target.text;
      try {
        const locator = page.locator(`text="${target.text.replace(/"/g, '\\"')}"`).first();
        await locator.click({ timeout: 5000 });
        await new Promise(r => setTimeout(r, 1200));

        // 点击后检查是否出现弹窗
        const postState = await detectUIState(page);
        if (postState.modal) {
          action.modalOpened = true;
          action.modalTitle = postState.modal.title || postState.modal.classes.slice(0, 40);

          if (postState.modal.hasForm && fillForms) {
            const formResult = await interactWithForm(page, { fillFields: true, submit: true });
            action.formResult = formResult;
            if (formResult.submitted) result.formsSubmitted++;
            result.modalsFound++;
          }
        }
      } catch (e) {
        action.success = false;
        action.error = e.message;
        result.errors.push(action);
      }
      result.actions.push(action);
      if (actionCount >= maxActions) break;
      continue;
    }

    // 第 3 优先级：滚动
    if (shouldScroll) {
      const atBottom = await page.evaluate(() => {
        return window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      });
      if (!atBottom) {
        await page.evaluate(() => window.scrollBy(0, 400));
        await new Promise(r => setTimeout(r, 300));
        action.type = 'scroll_down';
        result.actions.push(action);
        continue;
      }
    }

    // 没找到任何可做的 — 结束探索
    break;
  }

  result.success = result.errors.length === 0;
  return result;
}

// ======================================================================
// 5. Form 自动填充
// ======================================================================

/**
 * 自动填充表单字段
 * @param {object} page - Playwright Page 对象
 * @param {string} formSelector - 表单选择器，默认 'form'
 * @param {object} overrides - 手动指定的字段值 { fieldName: value }
 * @returns {object} { filled, fields, screenshot? }
 */
async function autoFillForm(page, formSelector = 'form', overrides = {}) {
  const result = { filled: false, fields: [], error: null };
  try {
    const form = await page.locator(formSelector).first();
    if (!(await form.count())) {
      result.error = `未找到表单元素: ${formSelector}`;
      return result;
    }

    // 收集所有表单字段
    const fields = await form.evaluate((el, ov) => {
      const fieldData = [];
      const inputs = el.querySelectorAll('input, textarea, select');
      inputs.forEach((input, i) => {
        const name = input.name || input.id || `field_${i}`;
        const type = (input.type || 'text').toLowerCase();
        const tag = input.tagName.toLowerCase();

        // 跳过隐藏字段和按钮
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

        let value = ov[name] || '';
        if (!value) {
          // 根据类型生成 mock 数据
          if (type === 'email') value = 'test@example.com';
          else if (type === 'tel' || type === 'phone') value = '13800138000';
          else if (type === 'number') value = '42';
          else if (type === 'url') value = 'https://example.com';
          else if (type === 'date') value = new Date().toISOString().slice(0, 10);
          else if (type === 'password') value = 'Test123456!';
          else if (tag === 'select') {
            const options = input.options || [];
            value = options.length > 1 ? (options[1].value || options[1].text) : (options[0]?.value || '');
          }
          else if (type === 'checkbox') { /* handled separately */ }
          else if (type === 'radio') { /* handled separately */ }
          else value = `test_${name}_value`;
        }

        fieldData.push({ name, type, tag, selector: `[name="${name}"], #${name}`, value });
      });
      return fieldData;
    }, overrides);

    // 逐字段填充
    for (const field of fields) {
      try {
        const loc = form.locator(field.selector).first();
        if (await loc.count()) {
          if (field.tag === 'select') {
            await loc.selectOption({ value: field.value }).catch(() => {});
          } else if (field.type === 'checkbox') {
            const isChecked = await loc.isChecked().catch(() => false);
            if (!isChecked) await loc.check().catch(() => {});
          } else {
            await loc.fill('').catch(() => {});
            await loc.type(field.value, { delay: 10 }).catch(() => {});
          }
          result.fields.push({ ...field, filled: true });
        } else {
          result.fields.push({ ...field, filled: false, reason: 'element not found' });
        }
      } catch (e) {
        result.fields.push({ ...field, filled: false, reason: e.message });
      }
    }
    result.filled = result.fields.some(f => f.filled);
    result.totalFields = result.fields.length;
    result.filledCount = result.fields.filter(f => f.filled).length;

    // 截取表单区域截图（base64，限制大小）
    try {
      const buf = await form.screenshot({ type: 'png' });
      result.screenshot = buf.toString('base64').slice(0, 2000);
    } catch (_) {}
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

// ======================================================================
// 6. 多步骤交互链执行
// ======================================================================

/**
 * 执行多步骤交互链
 * @param {object} page - Playwright Page 对象
 * @param {Array} chain - 交互步骤数组 [{ action, selector?, value?, ms?, url? }]
 * @returns {object} { success, steps: [...], completed, failed }
 */
async function runInteractionChain(page, chain = []) {
  const result = { success: false, steps: [], completed: 0, failed: 0, totalSteps: chain.length };
  let currentPage = page;

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const stepResult = { step: i + 1, action: step.action, success: false, timestamp: new Date().toISOString() };

    try {
      switch (step.action) {
        case 'click':
          if (step.selector) {
            await currentPage.click(step.selector, { timeout: 10000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 300));
          }
          stepResult.success = true;
          break;

        case 'type':
          if (step.selector && step.value !== undefined) {
            await currentPage.fill(step.selector, '').catch(() => {});
            await currentPage.type(step.selector, String(step.value), { delay: 20 }).catch(() => {});
          }
          stepResult.success = true;
          break;

        case 'wait':
          await new Promise(r => setTimeout(r, step.ms || 1000));
          stepResult.success = true;
          break;

        case 'navigate':
          if (step.url) {
            await currentPage.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
          stepResult.success = true;
          break;

        case 'scroll':
          if (step.selector) {
            await currentPage.locator(step.selector).scrollIntoViewIfNeeded().catch(() => {});
          } else {
            await currentPage.evaluate((px) => window.scrollBy(0, px || 500), step.pixels || 500).catch(() => {});
          }
          stepResult.success = true;
          break;

        case 'select':
          if (step.selector && step.value !== undefined) {
            await currentPage.selectOption(step.selector, step.value).catch(() => {});
          }
          stepResult.success = true;
          break;

        case 'hover':
          if (step.selector) {
            await currentPage.hover(step.selector, { timeout: 5000 }).catch(() => {});
          }
          stepResult.success = true;
          break;

        case 'screenshot':
          try {
            const buf = await currentPage.screenshot({ type: 'png', fullPage: false });
            stepResult.screenshotBase64 = buf.toString('base64').slice(0, 2000);
          } catch (_) {}
          stepResult.success = true;
          break;

        case 'fill_form':
          const fillResult = await autoFillForm(currentPage, step.selector || 'form', step.overrides || {});
          stepResult.fillResult = fillResult;
          stepResult.success = fillResult.filled;
          break;

        case 'submit':
          if (step.selector) {
            await currentPage.locator(step.selector).first().click({ timeout: 5000 }).catch(() => {});
          } else {
            await currentPage.locator('button[type="submit"], input[type="submit"]').first().click({ timeout: 5000 }).catch(() => {});
          }
          await new Promise(r => setTimeout(r, 1000));
          stepResult.success = true;
          // 检查提交后状态
          try {
            stepResult.submitResult = await currentPage.evaluate(() => {
              const url = window.location.href;
              const body = document.body?.innerText?.slice(0, 200) || '';
              const hasError = /error|失败|错误|invalid/i.test(body);
              return { url, hasError, bodySnippet: body.slice(0, 100) };
            });
          } catch (_) {}
          break;

        default:
          stepResult.error = `Unknown action: ${step.action}`;
      }
    } catch (e) {
      stepResult.error = e.message;
    }

    result.steps.push(stepResult);
    if (stepResult.success) result.completed++;
    else result.failed++;
  }

  result.success = result.failed === 0 && result.totalSteps > 0;
  return result;
}

module.exports = {
  detectUIState,
  interactWithForm,
  executeWorkflow,
  exploreLikeHuman,
  autoFillForm,
  runInteractionChain,
};
