import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  /**
   * 用相对路径引用构建产物。
   *
   * 必须如此：部署到 GitHub Pages 时页面地址是 `用户名.github.io/jiwei/`，
   * 默认的绝对路径 `/assets/...` 会指向域名根目录，导致 **JS/CSS 全部 404、页面白屏**。
   * 相对路径在根目录与子目录下都能正确加载，也让本地直接打开 dist 文件可行。
   */
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // PWA 从 M0 就开启：手机"加到主屏幕"是这个应用的手机端主要形态（docs/ROADMAP.md M2）
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '几微',
        short_name: '几微',
        description: '大学生日常生活 App —— 课表、日程、提醒、笔记',
        lang: 'zh-CN',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        /*
         * ★ 必须是相对路径 `./`，不能写 `/`。
         *
         * start_url 是"从主屏幕点开图标后打开哪个地址"。
         * 写 `/` 时：本地开发能用（应用就在根目录），
         * 但部署到 GitHub Pages 后就变成了 `https://用户名.github.io/` ——
         * 那是账号根目录、不是本站，直接 404，于是**图标点开是个死页面**。
         * 更糟的是 `/` 落在 scope（`/jiwei/`）之外，manifest 会被判定不适用。
         *
         * 相对路径会以 manifest 自身的地址为基准解析：
         * 线上 → `/jiwei/`，本地 → `/`，两个环境都对。
         * 这个坑一直存在，直到真的有人在 iPhone 上加到主屏幕才暴露出来。
         */
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // maskable 的图形要缩进安全区，不能用上面那张普通图标顶替
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    // 允许手机通过局域网 IP 访问，方便"电脑上开发、手机上看效果"
    host: true,
    port: 5273,
    watch: {
      // 编辑器写入时的临时目录会让文件监视器抛 EBUSY 并**直接崩掉 dev server**
      // （表现为浏览器刷新后白屏）。这里显式忽略目录本身与其内容。
      ignored: ['**/.*.tmpdir', '**/.*.tmpdir/**', '**/*.tmp', '**/.git/**', '**/dist/**'],
    },
  },
  // 构建产物里保留可读的类名，便于排查样式问题
  build: {
    sourcemap: false,
  },
})
