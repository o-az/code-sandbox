import { defineConfig } from 'vite'
import { default as VitePluginSolid } from 'vite-plugin-solid'
import { default as VitePluginTailwindCSS } from '@tailwindcss/vite'
import { default as VitePluginTSConfigPaths } from 'vite-tsconfig-paths'
import { cloudflare as VitePluginCloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart as VitePluginTanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig({
  server: {
    port: 42044,
  },
  plugins: [
    VitePluginTSConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    VitePluginCloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    VitePluginTailwindCSS(),
    VitePluginTanstackStart({
      start: { entry: './src/start.ts' },
      server: { entry: './src/server.ts' },
      client: { entry: './src/client.ts' },
    }),
    VitePluginSolid({ ssr: true }),
  ],
})
