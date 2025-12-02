import NodeProcess from 'node:process'
import VitePluginSonda from 'sonda/vite'
import { defineConfig, loadEnv } from 'vite'
import VitePluginInfo from 'unplugin-info/vite'
import VitePluginInspect from 'vite-plugin-inspect'
import VitePluginTSConfigPaths from 'vite-tsconfig-paths'
import { default as VitePluginSolid } from 'vite-plugin-solid'
import VitePluginDevtoolsJson from 'vite-plugin-devtools-json'
import { default as VitePluginTailwindCSS } from '@tailwindcss/vite'
import { cloudflare as VitePluginCloudflare } from '@cloudflare/vite-plugin'
import { devtools as VitePluginTanstackDevtools } from '@tanstack/devtools-vite'
import { tanstackStart as VitePluginTanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig(config => {
  const env = loadEnv(config.mode, NodeProcess.cwd(), '')

  const plugins = [
    VitePluginDevtoolsJson(),
    VitePluginTanstackDevtools({
      removeDevtoolsOnBuild: true,
      eventBusConfig: {
        port: randomIntInclusive(3_111, 8_111),
      },
    }),
    VitePluginInfo({
      cloudflare: true,
      github: 'https://github.com/o-az/sandbox',
    }),
    VitePluginTSConfigPaths(),
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
  ]

  if (config.mode === 'development') {
    if (env.PLUGIN_SONDA === 'true') plugins.unshift([VitePluginSonda()])
    if (env.PLUGIN_INSPECT === 'true')
      plugins.unshift(VitePluginInspect({ build: true }))
  }

  return {
    plugins,
    server: {
      port: Number(env.PORT || randomIntInclusive(3_100, 8_100)),
      allowedHosts: config.mode === 'development' ? true : undefined,
    },
    oxc: {
      target: ['esnext'],
    },
    build: {
      minify: 'oxc',
      outDir: 'dist',
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          cleanDir: true,
          minify: env.VITE_MINIFY === 'true',
          sourcemap: env.PLUGIN_SONDA === 'true',
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
