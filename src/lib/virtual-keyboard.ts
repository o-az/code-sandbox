import type { Readline } from 'xterm-readline'

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

  return {
    sendVirtualKeyboardInput,
    handleAltNavigation,
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
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
  const internal = readline as unknown as {
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
