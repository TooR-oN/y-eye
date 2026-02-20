import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { builtinModules } from 'module'

// Detect if running in web-only preview mode (no Electron)
const isWebPreview = process.env.WEB_PREVIEW === '1' || !process.env.ELECTRON

// Node.js built-in modules + Electron + native modules must be external
// for the Electron main process bundle to work correctly
const electronExternals = [
  'electron',
  'better-sqlite3',
  'pg',
  'pg-native',
  'pg-pool',
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
]

export default defineConfig(({ mode }) => {
  const plugins: any[] = [react()]

  // Only load Electron plugins when building for Electron
  if (!isWebPreview) {
    try {
      const electron = require('vite-plugin-electron')
      const renderer = require('vite-plugin-electron-renderer')
      plugins.push(
        electron.default([
          {
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                minify: false,
                rollupOptions: {
                  external: electronExternals
                }
              }
            }
          },
          {
            entry: 'electron/preload.ts',
            onstart(options: any) {
              options.reload()
            },
            vite: {
              build: {
                outDir: 'dist-electron',
                minify: false,
                rollupOptions: {
                  external: electronExternals
                }
              }
            }
          }
        ]),
        renderer.default()
      )
    } catch (e) {
      console.log('[Vite] Electron plugins not available, running in web-only mode')
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  }
})
