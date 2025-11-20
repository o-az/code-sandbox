import { onMount } from 'solid-js'

export function useDevTools() {
  if (!import.meta.env.DEV) return null

  onMount(() => {
    if (import.meta.env.DEV)
      void import('eruda').then(({ default: eruda }) => eruda.init())
  })
}

export function DevTools() {
  return (
    <div class="pointer-events-none hidden invisible size-0 opacity-0">
      {/*
       * TODO: add tanstack solid devtools back when it no longer breaks
       */}
    </div>
  )
}
