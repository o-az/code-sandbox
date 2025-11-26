import { createSignal, onMount } from 'solid-js'

const RETRO_FONT = 'Glass TTY VT220'
const DEFAULT_FONT = 'Lilex'
const FONT_STORAGE_KEY = 'terminal-font'

const DEFAULT_BACKGROUND = '#0d1117'
const RETRO_BACKGROUND = '#0a0a0a'

export function isRetroMode(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(FONT_STORAGE_KEY) === RETRO_FONT
}

export function getTerminalBackground(): string {
  return isRetroMode() ? RETRO_BACKGROUND : DEFAULT_BACKGROUND
}

export function RetroButton() {
  const [retroFont, setRetroFont] = createSignal(false)

  onMount(() => {
    const stored = localStorage.getItem(FONT_STORAGE_KEY)
    if (stored === RETRO_FONT) {
      setRetroFont(true)
    }
  })

  function toggleRetroFont() {
    const newValue = !retroFont()
    const fontFamily = newValue ? RETRO_FONT : DEFAULT_FONT
    localStorage.setItem(FONT_STORAGE_KEY, fontFamily)
    // ghostty-web doesn't support font changes after open(), reload to apply
    window.location.reload()
  }

  return (
    <button
      type="button"
      title={retroFont() ? 'Use default font' : 'Use retro font'}
      onClick={toggleRetroFont}
      class="flex size-8 items-center justify-center text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a6ff]"
      classList={{
        'bg-[#58a6ff]/20 text-[#58a6ff]': retroFont(),
      }}>
      <RetroFontIcon />
    </button>
  )
}

function RetroFontIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path d="M7.232 10.617c.349.048.88-.157 1.3-.478.224-.172.425-.383.57-.596" />
      <path d="M13.366 5.678q.133.642.134 1.322A6.5 6.5 0 1 1 .634 5.678M12.768 4A6.5 6.5 0 0 0 7 .5 6.5 6.5 0 0 0 1.232 4" />
      <path d="M.5 4.75V4H7v.75a3.25 3.25 0 1 1-6.5 0m6.5 0V4h6.5v.75a3.25 3.25 0 0 1-6.5 0" />
    </svg>
  )
}
