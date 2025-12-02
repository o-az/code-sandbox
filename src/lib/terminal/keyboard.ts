import type { Readline } from 'xterm-readline'

// ============================================================================
// Keyboard Insets (Mobile Virtual Keyboard Viewport Handling)
// ============================================================================

const KEYBOARD_HEIGHT_VAR = '--keyboard-height'

type VirtualKeyboard = {
  overlaysContent?: boolean
  boundingRect?: { height: number }
  addEventListener: (type: 'geometrychange', listener: () => void) => void
  removeEventListener: (type: 'geometrychange', listener: () => void) => void
}

type NavigatorWithKeyboard = Navigator & { virtualKeyboard?: VirtualKeyboard }

export function initKeyboardInsets() {
  if (typeof document === 'undefined') return () => {}
  const root = document.documentElement
  if (!root) return () => {}

  let viewportInset = 0
  let virtualKeyboardInset = 0

  const applyInset = () => {
    const inset = Math.max(0, viewportInset, virtualKeyboardInset)
    root.style.setProperty(KEYBOARD_HEIGHT_VAR, `${Math.round(inset)}px`)
  }

  const cleanup: Array<() => void> = []
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

    cleanup.push(() => {
      viewport.removeEventListener('resize', handleViewportChange)
    })
    cleanup.push(() => {
      viewport.removeEventListener('scroll', handleViewportChange)
    })
    cleanup.push(() => {
      window.removeEventListener('focus', handleViewportChange, true)
    })

    handleViewportChange()
  }

  const virtualKeyboard = (navigator as NavigatorWithKeyboard).virtualKeyboard
  if (virtualKeyboard) {
    try {
      virtualKeyboard.overlaysContent = true
    } catch {
      // ignore
    }

    const handleGeometryChange = () => {
      const rect = virtualKeyboard.boundingRect
      virtualKeyboardInset = rect ? rect.height : 0
      applyInset()
    }

    virtualKeyboard.addEventListener('geometrychange', handleGeometryChange)
    cleanup.push(() => {
      virtualKeyboard.removeEventListener(
        'geometrychange',
        handleGeometryChange,
      )
    })

    handleGeometryChange()
  }

  const resetInset = () => {
    viewportInset = 0
    virtualKeyboardInset = 0
    applyInset()
  }

  window.addEventListener('pagehide', resetInset)
  cleanup.push(() => {
    window.removeEventListener('pagehide', resetInset)
  })

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

// ============================================================================
// Virtual Keyboard Bridge (On-screen Keyboard Input Handling)
// ============================================================================

export type VirtualKeyPayload = {
  key: string
  ctrl?: boolean
  shift?: boolean
}

export type VirtualKeyboardBridgeOptions = {
  xtermReadline: Readline
  sendInteractiveInput: (input: string) => void
  isInteractiveMode: () => boolean
}

const ALT_ARROW_SEQUENCES: Record<string, string> = {
  ArrowUp: '\u001b[1;3A',
  ArrowDown: '\u001b[1;3B',
  ArrowLeft: '\u001b[1;3D',
  ArrowRight: '\u001b[1;3C',
}

const ARROW_SEQUENCES: Record<string, string> = {
  ArrowUp: '\u001b[A',
  ArrowDown: '\u001b[B',
  ArrowLeft: '\u001b[D',
  ArrowRight: '\u001b[C',
}

const READLINE_ALT_SEQUENCES: Record<string, string> = {
  ArrowUp: '\u0001',
  ArrowDown: '\u0005',
  Backspace: '\u001b\u007f',
}

export function createVirtualKeyboardBridge({
  xtermReadline,
  sendInteractiveInput,
  isInteractiveMode,
}: VirtualKeyboardBridgeOptions) {
  function sendVirtualKeyboardInput(payload: VirtualKeyPayload) {
    if (
      !payload ||
      typeof payload.key !== 'string' ||
      payload.key.length === 0
    ) {
      return
    }
    handleVirtualKeyboardInput({
      key: payload.key,
      ctrl: Boolean(payload.ctrl),
      shift: Boolean(payload.shift),
    })
  }

  function handleVirtualKeyboardInput(payload: VirtualKeyPayload) {
    if (isInteractiveMode()) {
      handleVirtualInteractiveInput(payload)
      return
    }
    handleVirtualReadlineInput(payload)
  }

  function handleVirtualInteractiveInput(payload: VirtualKeyPayload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    if (controlChar) {
      sendInteractiveInput(controlChar)
      return
    }

    if (key === 'Escape') {
      sendInteractiveInput('\u001b')
      return
    }

    if (key in ARROW_SEQUENCES) {
      sendInteractiveInput(ARROW_SEQUENCES[key])
      return
    }

    if (key === 'Enter') {
      sendInteractiveInput('\r')
      return
    }

    if (key === 'Backspace') {
      sendInteractiveInput('\u0008')
      return
    }

    if (key.length === 1) {
      const shouldUppercase = shift && /^[a-z]$/i.test(key)
      const output = shouldUppercase ? key.toUpperCase() : key
      sendInteractiveInput(output)
    }
  }

  function handleVirtualReadlineInput(payload: VirtualKeyPayload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    const internalReadline = xtermReadline as unknown as {
      readData: (data: string) => void
    }
    if (controlChar) {
      internalReadline.readData(controlChar)
      return
    }

    if (key === 'Escape') {
      internalReadline.readData('\u001b')
      return
    }

    if (key in ARROW_SEQUENCES) {
      internalReadline.readData(ARROW_SEQUENCES[key])
      return
    }

    if (key === 'Enter') {
      internalReadline.readData('\r')
      return
    }

    if (key === 'Backspace') {
      internalReadline.readData('\u007f')
      return
    }

    if (key.length === 1) {
      const shouldUppercase = shift && /^[a-z]$/i.test(key)
      const output = shouldUppercase ? key.toUpperCase() : key
      internalReadline.readData(output)
    }
  }

  function handleAltNavigation(domEvent: KeyboardEvent) {
    if (!domEvent.altKey || domEvent.type !== 'keydown') return false

    if (isInteractiveMode()) {
      let seq: string | undefined
      if (domEvent.key in ALT_ARROW_SEQUENCES) {
        seq = ALT_ARROW_SEQUENCES[domEvent.key]
      }
      domEvent.preventDefault()
      domEvent.stopPropagation()
      if (seq) {
        sendInteractiveInput(seq)
        return true
      }
      if (domEvent.key === 'Backspace') {
        sendInteractiveInput('\u001b\u007f')
        return true
      }
      if (domEvent.key.length === 1) {
        sendInteractiveInput(`\u001b${domEvent.key}`)
        return true
      }
      return false
    }

    domEvent.preventDefault()
    domEvent.stopPropagation()

    if (handleReadlineAltKey(domEvent.key, xtermReadline)) {
      return true
    }
    if (domEvent.key in READLINE_ALT_SEQUENCES) {
      const sequence = READLINE_ALT_SEQUENCES[domEvent.key]
      const internalReadline = xtermReadline as unknown as {
        readData: (data: string) => void
      }
      internalReadline.readData(sequence)
      return true
    }
    return false
  }

  function handleClearLine(): boolean {
    if (isInteractiveMode()) {
      // For interactive mode, send Ctrl+E (end of line) + Ctrl+U (kill to beginning)
      sendInteractiveInput('\x05\x15')
      return true
    }

    // For readline mode, clear the buffer directly
    const internal = xtermReadline as unknown as {
      readData?: (data: string) => void
      state?: {
        line?: {
          buffer?: () => string
          pos?: number
        }
      }
    }

    const buffer =
      typeof internal.state?.line?.buffer === 'function'
        ? internal.state.line.buffer()
        : ''
    const pos = internal.state?.line?.pos ?? buffer.length

    if (buffer.length === 0) return true

    // Send DEL characters to delete everything
    // First delete from cursor to end, then from beginning to where cursor was
    const charsAfterCursor = buffer.length - pos
    const charsBeforeCursor = pos

    if (typeof internal.readData === 'function') {
      // Move to end and delete backward
      // Send right arrows to go to end
      for (let i = 0; i < charsAfterCursor; i++) {
        internal.readData('\x1b[C') // Right arrow
      }
      // Delete all characters
      for (let i = 0; i < buffer.length; i++) {
        internal.readData('\x7f') // DEL
      }
    }
    return true
  }

  function handleJumpToLineEdge(edge: 'start' | 'end'): boolean {
    if (isInteractiveMode()) {
      // For interactive mode, send Ctrl+A (start) or Ctrl+E (end)
      sendInteractiveInput(edge === 'start' ? '\x01' : '\x05')
      return true
    }

    // For readline mode, manipulate cursor position directly
    const internal = xtermReadline as unknown as {
      state?: {
        moveCursor?: () => void
        line?: {
          buffer?: () => string
          set_pos?: (value: number) => void
          pos?: number
        }
      }
    }

    const line = internal.state?.line
    const buffer = typeof line?.buffer === 'function' ? line.buffer() : ''

    if (
      !line ||
      typeof line.set_pos !== 'function' ||
      typeof internal.state?.moveCursor !== 'function'
    ) {
      return false
    }

    const targetPos = edge === 'start' ? 0 : buffer.length
    line.set_pos(targetPos)
    internal.state.moveCursor?.()
    return true
  }

  /**
   * Refresh readline display after terminal resize to fix cursor position.
   * This should be called after fitAddon.fit() completes.
   */
  function handleResize(): void {
    if (isInteractiveMode()) {
      // Interactive mode handles its own resize via PTY
      return
    }

    // Access readline's internal state to refresh the display
    const internal = xtermReadline as unknown as {
      state?: {
        refresh?: () => void
      }
    }

    // Call refresh to redraw the line with correct layout
    if (typeof internal.state?.refresh === 'function') {
      internal.state.refresh()
    }
  }

  return {
    sendVirtualKeyboardInput,
    handleAltNavigation,
    handleClearLine,
    handleJumpToLineEdge,
    handleResize,
  }
}

function controlCharacterForKey(rawKey: string) {
  if (!rawKey) return undefined
  const trimmed = rawKey.trim()
  if (!trimmed) return undefined

  const match = trimmed.match(/([a-zA-Z@[\\\]^_])$/)
  const base = match ? match[1] : trimmed[0]
  const upper = base.toUpperCase()
  const code = upper.codePointAt(0)
  if (code === undefined) return undefined

  if (upper >= 'A' && upper <= 'Z') {
    return String.fromCharCode(code - 64)
  }
  if (upper === '@') return '\u0000'
  if (upper === '[') return '\u001b'
  if (upper === '\\') return '\u001c'
  if (upper === ']') return '\u001d'
  if (upper === '^') return '\u001e'
  if (upper === '_') return '\u001f'
  return undefined
}

function handleReadlineAltKey(key: string, readline: Readline) {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Backspace')
    return false

  const internal = readline as unknown as {
    state?: {
      moveCursor?: () => void
      line?: {
        buffer?: () => string
        set_pos?: (value: number) => void
        set_buffer?: (value: string) => void
        pos?: number
      }
    }
  }
  const line = internal.state?.line
  const buffer = typeof line?.buffer === 'function' ? line.buffer() : ''
  if (
    !line ||
    typeof line.set_pos !== 'function' ||
    typeof internal.state?.moveCursor !== 'function'
  ) {
    return false
  }
  const current =
    typeof line.pos === 'number'
      ? line.pos
      : typeof buffer.length === 'number'
        ? buffer.length
        : 0

  if (key === 'ArrowLeft') {
    const target = findWordBoundaryLeft(buffer, current)
    if (target === current) return true
    line.set_pos(target)
    internal.state.moveCursor?.()
    return true
  }

  if (key === 'ArrowRight') {
    const target = findWordBoundaryRight(buffer, current)
    if (target === current) return true
    line.set_pos(target)
    internal.state.moveCursor?.()
    return true
  }

  if (key === 'Backspace') {
    const target = findWordBoundaryLeft(buffer, current)
    if (target === current) return true

    // Send individual backspace characters to delete the word
    // This uses readline's built-in backspace handling for proper display update
    const charsToDelete = current - target
    const internalReadline = readline as unknown as {
      readData?: (data: string) => void
    }
    if (typeof internalReadline.readData === 'function') {
      // DEL character (0x7f) is what readline uses for backspace
      for (let i = 0; i < charsToDelete; i++) {
        internalReadline.readData('\x7f')
      }
    }
    return true
  }

  return false
}

function findWordBoundaryLeft(buffer: string, index: number) {
  let idx = Math.max(0, index)
  if (idx === 0) return 0
  idx--
  while (idx > 0 && /\s/.test(buffer[idx])) idx--
  while (idx > 0 && !/\s/.test(buffer[idx - 1])) idx--
  return idx
}

function findWordBoundaryRight(buffer: string, index: number) {
  const len = buffer.length
  let idx = Math.max(0, index)
  if (idx >= len) return len
  while (idx < len && /\s/.test(buffer[idx])) idx++
  while (idx < len && !/\s/.test(buffer[idx])) idx++
  return idx
}
