import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src-tauri/target/**',
      'playwright-report/**',
      'coverage/**',
      'output/**',
      'improvement-analysis/**',
      'ui-improvement-report/**',
      'vite.config.js',
      'vite.config.d.ts',
      '*.tsbuildinfo',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // 下划线前缀的参数/变量视为“故意未使用”，不报错（TS 惯例）
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // 以下规则降级为 warn：项目历史代码大量使用这些模式（render 中写 ref / effect 中同步
      // setState / 变量声明前在 effect 内访问），它们在 react-hooks v7 才升级为 error。
      // P0 阶段目标是建立“稳定可运行”的门禁，逐步收敛留待后续重构。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/incompatible-library': 'warn',
      // eslint 10 内置新规则，降级为 warn 以避免阻塞历史代码
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
)
