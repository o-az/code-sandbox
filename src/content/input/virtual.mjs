/**
 * @typedef {{ key: string; ctrl?: boolean; shift?: boolean }} VirtualKeyPayload
 * @typedef {Object} VirtualKeyboardBridgeOptions
 * @property {import('xterm-readline').Readline} xtermReadline
 * @property {(input: string) => void} sendInteractiveInput
 * @property {() => boolean} isInteractiveMode
 */

const ALT_ARROW_SEQUENCES = {
  ArrowUp: '\u001b[1;3A',
  ArrowDown: '\u001b[1;3B',
  ArrowLeft: '\u001b[1;3D',
  ArrowRight: '\u001b[1;3C',
}

const READLINE_ALT_SEQUENCES = /** @type {const} */ ({
  ArrowUp: '\u0001', // move to start of line
  ArrowDown: '\u0005', // move to end of line
  Backspace: '\u001b\u007f',
})

/**
 * @param {VirtualKeyboardBridgeOptions} options
 * @returns {{ sendVirtualKeyboardInput: (payload: VirtualKeyPayload) => void, handleAltNavigation: (event: KeyboardEvent) => boolean }}
 */
export function createVirtualKeyboardBridge({
  xtermReadline,
  sendInteractiveInput,
  isInteractiveMode,
}) {
  /**
   * Injects virtual-keyboard payloads into the correct input pipeline.
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function sendVirtualKeyboardInput(payload) {
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

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualKeyboardInput(payload) {
    if (isInteractiveMode()) {
      handleVirtualInteractiveInput(payload)
      return
    }
    handleVirtualReadlineInput(payload)
  }

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualInteractiveInput(payload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    if (controlChar) {
      sendInteractiveInput(controlChar)
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

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualReadlineInput(payload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    const internalReadline = /** @type {any} */ (xtermReadline)
    if (controlChar) {
      internalReadline.readData(controlChar)
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

  /**
   * Custom Alt+key behavior shared between readline and interactive modes.
   * @param {KeyboardEvent} domEvent
   * @returns {boolean}
   */
  function handleAltNavigation(domEvent) {
    if (!domEvent.altKey || domEvent.type !== 'keydown') return false

    if (isInteractiveMode()) {
      let seq
      if (isAltArrowKey(domEvent.key)) {
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
    if (isReadlineAltKey(domEvent.key)) {
      const sequence = READLINE_ALT_SEQUENCES[domEvent.key]
      const internalReadline = /** @type {any} */ (xtermReadline)
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

/**
 * Maps printable keys to their control-character equivalent, if any.
 * @param {string} rawKey
 * @returns {string | undefined}
 */
function controlCharacterForKey(rawKey) {
  if (!rawKey) return undefined
  const trimmed = rawKey.trim()
  if (!trimmed) return undefined

  const match = trimmed.match(/([a-zA-Z@[\]\\^_])$/)
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

/**
 * @param {string} key
 * @returns {key is keyof typeof ALT_ARROW_SEQUENCES}
 */
function isAltArrowKey(key) {
  return key in ALT_ARROW_SEQUENCES
}

/**
 * @param {string} key
 * @returns {key is keyof typeof READLINE_ALT_SEQUENCES}
 */
function isReadlineAltKey(key) {
  return key in READLINE_ALT_SEQUENCES
}

/**
 * Attempts to move the readline cursor by word boundaries using internal APIs.
 * xterm-readline does not expose this publicly, so we guard accesses carefully.
 * @param {string} key
 * @param {import('xterm-readline').Readline} readline
 * @returns {boolean}
 */
function handleReadlineAltKey(key, readline) {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
  const internal = /** @type {any} */ (readline)
  const state = internal?.state
  const line = state?.line
  const buffer = typeof line?.buffer === 'function' ? line.buffer() : ''
  if (
    !line ||
    typeof line.set_pos !== 'function' ||
    typeof state?.moveCursor !== 'function'
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
    state.moveCursor()
    return true
  }
  if (key === 'ArrowRight') {
    const target = findWordBoundaryRight(buffer, current)
    if (target === current) return true
    line.set_pos(target)
    state.moveCursor()
    return true
  }
  return false
}

/**
 * @param {string} buffer
 * @param {number} index
 * @returns {number}
 */
function findWordBoundaryLeft(buffer, index) {
  if (typeof buffer !== 'string') return 0
  let idx = Math.max(0, index)
  if (idx === 0) return 0
  idx--
  while (idx > 0 && /\s/.test(buffer[idx])) idx--
  while (idx > 0 && !/\s/.test(buffer[idx - 1])) idx--
  return idx
}

/**
 * @param {string} buffer
 * @param {number} index
 * @returns {number}
 */
function findWordBoundaryRight(buffer, index) {
  if (typeof buffer !== 'string') return 0
  const len = buffer.length
  let idx = Math.max(0, index)
  if (idx >= len) return len
  while (idx < len && /\s/.test(buffer[idx])) idx++
  while (idx < len && !/\s/.test(buffer[idx])) idx++
  return idx
}
