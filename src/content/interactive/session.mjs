import { LOG_LEVEL, WS_ENDPOINT, sessionId } from '../state/session.mjs'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * @typedef {Object} InteractiveSessionOptions
 * @property {import('@xterm/xterm').Terminal} terminal
 * @property {import('@xterm/addon-serialize').SerializeAddon} serializeAddon
 * @property {(mode: import('../terminal/status.mjs').StatusMode) => void} setStatus
 * @property {(mode: import('../terminal/status.mjs').StatusMode) => void} [onSessionExit]
 */

/**
 * @typedef {Object} InteractiveSessionAPI
 * @property {(command: string) => Promise<void>} startInteractiveSession
 * @property {(data: string) => void} sendInteractiveInput
 * @property {(options: { cols: number, rows: number }) => void} notifyResize
 * @property {() => boolean} isInteractiveMode
 */

/**
 * Creates and manages the interactive PTY bridge lifecycle.
 * @param {InteractiveSessionOptions} options
 * @returns {InteractiveSessionAPI}
 */
export function createInteractiveSession({
  terminal,
  serializeAddon,
  setStatus,
  onSessionExit,
}) {
  /** @type {WebSocket | undefined} */
  let interactiveSocket
  let interactiveMode = false
  let interactiveInitQueued = ''
  /** @type {((value?: void) => void) | undefined} */
  let interactiveResolve
  /** @type {((reason?: any) => void) | undefined} */
  let interactiveReject
  /** @type {import('@xterm/xterm').IDisposable | undefined} */
  let dataListener

  /**
   * @param {string} command
   * @returns {Promise<void>}
   */
  function startInteractiveSession(command) {
    if (interactiveMode) {
      terminal.writeln(
        '\u001b[33mInteractive session already active. Type `exit` to close it.\u001b[0m',
      )
      setStatus('interactive')
      return Promise.resolve()
    }

    interactiveMode = true
    interactiveInitQueued = command.endsWith('\n') ? command : `${command}\n`
    setStatus('interactive')
    terminal.writeln('\r\n\u001b[90mOpening interactive shell...\u001b[0m')

    // Attach data listener for this interactive session
    dataListener = terminal.onData(data => {
      if (interactiveMode) sendInteractiveInput(data)
    })

    return new Promise((resolve, reject) => {
      interactiveResolve = resolve
      interactiveReject = reject
      openInteractiveSocket()
    })
  }

  /**
   * Opens a WebSocket connected to the PTY proxy.
   * @returns {void}
   */
  function openInteractiveSocket() {
    const url = websocketUrl()
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    interactiveSocket = socket
    socket.addEventListener('open', () => {
      sendInteractiveJson({
        type: 'init',
        cols: terminal.cols ?? 120,
        rows: terminal.rows ?? 32,
      })
      if (interactiveInitQueued) {
        setTimeout(() => {
          sendInteractiveInput(interactiveInitQueued)
          interactiveInitQueued = ''
        }, 100)
      }
    })
    socket.addEventListener('message', handleInteractiveMessage)
    socket.addEventListener('close', () => resetInteractiveState('online'))
    socket.addEventListener('error', event => {
      console.error('Interactive socket error', event)
      resetInteractiveState('error')
    })
  }

  /**
   * @param {MessageEvent} event
   * @returns {void}
   */
  function handleInteractiveMessage(event) {
    const { data } = event
    if (typeof data === 'string') {
      try {
        const payload = /** @type {any} */ (JSON.parse(data))
        if (payload?.type === 'pong' || payload?.type === 'ready') return
        if (payload?.type === 'process-exit') {
          const exitCode =
            typeof payload.exitCode === 'number' ? payload.exitCode : 'unknown'
          terminal.writeln(
            `\r\n[interactive session exited with code ${exitCode}]`,
          )
          resetInteractiveState('online')
          return
        }
      } catch {
        terminal.write(data, () => {
          if (LOG_LEVEL === 'debug') console.info(serializeAddon.serialize())
        })
      }
      return
    }

    if (data instanceof ArrayBuffer) {
      const text = textDecoder.decode(new Uint8Array(data))
      if (text) {
        terminal.write(text, () => {
          if (LOG_LEVEL === 'debug') console.info(serializeAddon.serialize())
        })
      }
      return
    }

    if (data instanceof Uint8Array) {
      const text = textDecoder.decode(data)
      if (text) {
        terminal.write(text, () => {
          if (LOG_LEVEL === 'debug') console.info(serializeAddon.serialize())
        })
      }
    }
  }

  /**
   * @param {import('../terminal/status.mjs').StatusMode} mode
   * @returns {void}
   */
  function resetInteractiveState(mode) {
    if (interactiveSocket && interactiveSocket.readyState === WebSocket.OPEN) {
      interactiveSocket.close()
    }
    interactiveSocket = undefined
    interactiveMode = false
    interactiveInitQueued = ''

    // Dispose data listener
    if (dataListener) {
      dataListener.dispose()
      dataListener = undefined
    }

    setStatus(mode)
    if (mode === 'error') {
      interactiveReject?.(new Error('Interactive session ended with error'))
    } else {
      interactiveResolve?.()
    }
    interactiveResolve = undefined
    interactiveReject = undefined
    onSessionExit?.(mode)
  }

  /**
   * @returns {string}
   */
  function websocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${window.location.host}${WS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  function sendInteractiveInput(text) {
    if (!text) return
    if (!interactiveSocket || interactiveSocket.readyState !== WebSocket.OPEN) {
      return
    }
    interactiveSocket.send(textEncoder.encode(text))
  }

  /**
   * @param {any} payload
   * @returns {void}
   */
  function sendInteractiveJson(payload) {
    if (!interactiveSocket || interactiveSocket.readyState !== WebSocket.OPEN) {
      return
    }
    interactiveSocket.send(JSON.stringify(payload))
  }

  /**
   * @param {{ cols: number, rows: number }} options
   * @returns {void}
   */
  function notifyResize(options) {
    const { cols, rows } = options
    if (!interactiveMode) return
    sendInteractiveJson({ type: 'resize', cols, rows })
  }

  /**
   * @returns {boolean}
   */
  function isInteractiveMode() {
    return interactiveMode
  }

  return {
    startInteractiveSession,
    sendInteractiveInput,
    notifyResize,
    isInteractiveMode,
  }
}
