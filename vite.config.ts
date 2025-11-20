import NodeProcess from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import VitePluginTSConfigPaths from 'vite-tsconfig-paths'
import { default as VitePluginSolid } from 'vite-plugin-solid'
import { default as VitePluginTailwindCSS } from '@tailwindcss/vite'
import { cloudflare as VitePluginCloudflare } from '@cloudflare/vite-plugin'
import { devtools as VitePluginTanstackDevtools } from '@tanstack/devtools-vite'
import { tanstackStart as VitePluginTanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig(config => {
  const env = loadEnv(config.mode, NodeProcess.cwd(), '')

  return {
    plugins: [
      VitePluginTanstackDevtools({ removeDevtoolsOnBuild: true }),
      VitePluginTSConfigPaths(),
      VitePluginCloudflare({
        configPath: './wrangler.json',
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
    server: {
      port: Number(env.PORT || randomIntInclusive(3_100, 8_100)),
    },
    oxc: {
      target: ['esnext'],
    },
    build: {
      minify: 'oxc',
      rolldownOptions: {
        output: {
          minify: true,
        },
      },
    },
  }
})

function randomIntInclusive(min: number, max: number) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}
