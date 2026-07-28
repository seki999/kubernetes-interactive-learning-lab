// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 配置说明：
// - base 使用相对路径 './'，保证项目无论部署在 GitHub Pages 的子路径下
//   （例如 https://用户名.github.io/仓库名/），还是绑定到自定义域名根路径，
//   都能正确加载静态资源，避免把任何个人域名或仓库路径硬编码到代码中。
// - 配合路由层使用 HashRouter，可以避免刷新页面时出现 404。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
    exclude: ['node_modules', 'dist', 'tests'], // exclude playwright tests from vitest
  },
})
