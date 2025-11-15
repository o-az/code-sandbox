const KEYBOARD_HEIGHT_VAR = '--keyboard-height'

/**
 * @typedef {{
 *   overlaysContent?: boolean
 *   boundingRect?: { height: number }
 *   addEventListener(type: 'geometrychange', listener: () => void): void
 *   removeEventListener(type: 'geometrychange', listener: () => void): void
 * }} VirtualKeyboard
 *
 * @typedef {Navigator & { virtualKeyboard?: VirtualKeyboard }} NavigatorWithKeyboard
 */

/**
 * Sets a CSS variable that reflects how much of the layout viewport is covered
 * by the on-screen keyboard. Combines VirtualKeyboard geometry (when present)
 * with VisualViewport measurements so every browser lands on the same API.
 *
 * @returns {() => void} cleanup function
 */
export function initKeyboardInsets() {
  const root = document.documentElement
  if (!root) return () => {}

  let viewportInset = 0
  let virtualKeyboardInset = 0

  const applyInset = () => {
    const inset = Math.max(0, viewportInset, virtualKeyboardInset)
    root.style.setProperty(KEYBOARD_HEIGHT_VAR, `${Math.round(inset)}px`)
  }

  /** @type {Array<() => void>} */
  const cleanup = []

  const viewport = window.visualViewport
  if (viewport) {
    const handleViewportChange = () => {
      viewportInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      )
      applyInset()
    }

    viewport.addEventListener('resize', handleViewportChange)
    viewport.addEventListener('scroll', handleViewportChange)
    window.addEventListener('focus', handleViewportChange, true)

    cleanup.push(() =>
      viewport.removeEventListener('resize', handleViewportChange),
    )
    cleanup.push(() =>
      viewport.removeEventListener('scroll', handleViewportChange),
    )
    cleanup.push(() =>
      window.removeEventListener('focus', handleViewportChange, true),
    )

    handleViewportChange()
  }

  const virtualKeyboard = /** @type {NavigatorWithKeyboard} */ (navigator)
    .virtualKeyboard
  if (virtualKeyboard) {
    try {
      virtualKeyboard.overlaysContent = true
    } catch {
      // Some browsers still gate overlaysContent behind permissions.
    }

    const handleGeometryChange = () => {
      const rect = virtualKeyboard.boundingRect
      virtualKeyboardInset = rect ? rect.height : 0
      applyInset()
    }

    virtualKeyboard.addEventListener('geometrychange', handleGeometryChange)
    cleanup.push(() =>
      virtualKeyboard.removeEventListener(
        'geometrychange',
        handleGeometryChange,
      ),
    )

    handleGeometryChange()
  }

  // Ensure we reset the variable when the keyboard hides via blur/pagehide.
  const resetInset = () => {
    viewportInset = 0
    virtualKeyboardInset = 0
    applyInset()
  }

  window.addEventListener('pagehide', resetInset)
  cleanup.push(() => window.removeEventListener('pagehide', resetInset))

  applyInset()

  return () => {
    cleanup.forEach(fn => {
      try {
        fn()
      } catch {
        // ignore teardown errors
      }
    })
  }
}
