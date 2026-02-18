import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Detect if running in web-only preview mode (no Electron)
const isWebPreview = process.env.WEB_PREVIEW === '1' || !process.env.ELECTRON

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
                rollupOptions: {
                  external: ['better-sqlite3']
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
                rollupOptions: {
                  external: ['better-sqlite3']
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
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  }
})
