import { createSignal, onMount } from 'solid-js'

export function useEmbedDetector() {
  const [insideIFrame, setInsideIFrame] = createSignal(false)

  onMount(() => {
    if (typeof window !== 'undefined')
      setInsideIFrame(window.self !== window.top)
  })

  return insideIFrame
}
