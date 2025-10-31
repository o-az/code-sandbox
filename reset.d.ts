import '@total-typescript/ts-reset/dom'

declare module '*.html' {
  const content: string
  export default content
}

import type { Terminal } from '@xterm/xterm'
declare global {
  interface Window {
    Terminal: typeof Terminal
    FitAddon: typeof FitAddon
  }
}
