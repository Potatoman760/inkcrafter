import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Locks the packaged renderer down to its own bundle: no remote scripts, no
 * outbound requests. Network calls (the Anthropic API included) belong in the
 * main process, where the API key lives and the renderer cannot reach it.
 *
 * Build-only, because the dev server needs inline scripts and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // app: is the scheme media/ is served over — see main/mediaProtocol.ts.
  // Narrower than file:, which would let the renderer read the whole disk.
  "img-src 'self' data: app:",
  // And the same scheme again for clips, which are <video> rather than <img>
  // and so are governed by their own directive. Without this one they fall
  // back to default-src and are refused — which the media/ folder has always
  // been able to serve, so the omission was only ever invisible because
  // nothing had yet tried to play one.
  "media-src 'self' app:",
  "font-src 'self' data:",
  "connect-src 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'inkcrafter:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend'
        }
      ]
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), contentSecurityPolicy()]
  }
})
