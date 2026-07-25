import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

// ESLint 配置（flat config）。
// - js/typescript-eslint 推荐规则负责代码质量（如禁止未使用变量）。
// - react-hooks 规则用于检查 Hooks 使用是否符合规则（依赖数组、调用顺序等）。
// - react-refresh 规则用于配合 Vite 的 HMR，提示"文件中混合导出组件和非组件"的问题。
// - eslint-config-prettier 放在最后，关闭所有和 Prettier 冲突的格式化类规则，
//   格式化统一交给 Prettier 处理，ESLint 只负责代码质量。
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettierConfig
)
