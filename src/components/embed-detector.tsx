import { createSignal, onMount } from 'solid-js'

function detectEmbedMode(): boolean {
  if (typeof window === 'undefined') return false

  const currentURL = new URL(window.location.href)
  if (currentURL.searchParams.get('embed') === 'true') return true

  // Check if inside an iframe
  // Note: accessing window.top throws a security error for cross-origin iframes
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin iframe - definitely embedded
    return true
  }
}

export function useEmbedDetector() {
  const [isEmbedded, setIsEmbedded] = createSignal(true)

  onMount(() => {
    setIsEmbedded(detectEmbedMode())
  })

  return isEmbedded
}
