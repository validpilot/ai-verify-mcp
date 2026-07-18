import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'AI-Verify MCP',
  description: 'AI 编程验证平台 - 让 AI 代码生成结果可验证、可信赖',
  lang: 'zh-CN',
  base: '/ai-verify-mcp/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ai-verify-mcp/favicon.svg' }]
  ],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '工具列表', link: '/tools/overview' },
      { text: 'Skill 指导', link: '/skills/index' },
      { text: '场景手册', link: '/scenarios/ecommerce-checkout' },
      { text: 'MCP 速查', link: '/reference/mcp-cheatsheet' },
      { text: '常见问题', link: '/faq/troubleshooting' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '安装与配置', link: '/guide/installation' },
            { text: 'CLI 使用', link: '/guide/cli' }
          ]
        },
        {
          text: '进阶',
          items: [
            { text: '验证流程', link: '/guide/verification-flow' },
            { text: '视觉对比', link: '/guide/visual-compare' },
            { text: '错误修复', link: '/guide/error-fix' }
          ]
        }
      ],
      '/tools/': [
        {
          text: '工具分类',
          items: [
            { text: '总览', link: '/tools/overview' },
            { text: '浏览器操作', link: '/tools/browser' },
            { text: '视觉验证', link: '/tools/visual' },
            { text: '错误修复', link: '/tools/fix' },
            { text: '系统工具', link: '/tools/system' }
          ]
        }
      ],
      '/skills/': [
        {
          text: 'Skill 指导',
          items: [
            { text: '总览', link: '/skills/index' },
            { text: '登录流程验证', link: '/skills/login-validation' },
            { text: '表单提交验证', link: '/skills/form-submission' },
            { text: '视觉回归', link: '/skills/visual-regression' },
            { text: '安全审计', link: '/skills/security-audit' },
            { text: '性能审计', link: '/skills/performance-audit' },
            { text: '端到端流程', link: '/skills/e2e-flow' },
            { text: '调试排查', link: '/skills/debug-investigation' }
          ]
        }
      ],
      '/scenarios/': [
        {
          text: '场景手册',
          items: [
            { text: '电商下单全链路', link: '/scenarios/ecommerce-checkout' },
            { text: 'SaaS 注册引导', link: '/scenarios/saas-onboarding' },
            { text: '后台权限矩阵', link: '/scenarios/admin-dashboard' },
            { text: 'SEO+性能+A11y 审计', link: '/scenarios/seo-lighthouse' },
            { text: '部署后回归验证', link: '/scenarios/regression-after-deploy' }
          ]
        }
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: 'MCP 协议速查', link: '/reference/mcp-cheatsheet' },
            { text: '工具选择决策矩阵', link: '/reference/tool-decision-matrix' },
            { text: '配置项说明', link: '/reference/config' },
            { text: 'CHANGELOG', link: '/reference/changelog' }
          ]
        }
      ],
      '/faq/': [
        {
          text: '支持',
          items: [
            { text: '日志排查手册', link: '/faq/troubleshooting' },
            { text: '常见问题', link: '/faq/faq' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/validpilot/ai-verify-mcp' }
    ],

    footer: {
      message: 'MIT Licensed',
      copyright: `Copyright © 2025 ValidPilot Team`
    },

    search: {
      provider: 'local'
    }
  }
});
