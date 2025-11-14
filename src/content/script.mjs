import { Terminal } from '@xterm/xterm'
import { Readline } from 'xterm-readline'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { ImageAddon } from '@xterm/addon-image'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { LigaturesAddon } from '@xterm/addon-ligatures'

/**
 * @typedef {string} Command
 * @typedef {Set<Command>} CommandSet
 */

const PROMPT = '\u001b[32m$\u001b[0m '
const STREAMING_COMMANDS = new Set(['anvil'])
const INTERACTIVE_COMMANDS = new Set(['chisel', 'node'])
const API_ENDPOINT = '/api/exec'
const WS_ENDPOINT = '/api/ws'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const ALT_ARROW_SEQUENCES = {
  ArrowUp: '\u001b[1;3A',
  ArrowDown: '\u001b[1;3B',
  ArrowLeft: '\u001b[1;3D',
  ArrowRight: '\u001b[1;3C',
}
const STATUS_STYLE = {
  online: { text: 'Online', color: '#4ade80' },
  interactive: { text: 'Interactive', color: '#38bdf8' },
  error: { text: 'Error', color: '#f87171' },
  offline: { text: 'Offline', color: '#fbbf24' },
}

const terminal = new Terminal({
  fontSize: 17,
  lineHeight: 1.2,
  scrollback: 5000,
  convertEol: true,
  cursorBlink: true,
  allowProposedApi: true,
  scrollOnUserInput: false,
  cursorStyle: 'underline',
  rightClickSelectsWord: true,
  rescaleOverlappingGlyphs: true,
  ignoreBracketedPasteMode: true,
  cursorInactiveStyle: 'underline',
  drawBoldTextInBrightColors: true,
  fontFamily: "'Lilex', monospace",
  theme: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
})

terminal.onBell(() => {
  console.info('bell')
})

const fitAddon = new FitAddon()
const webglAddon = new WebglAddon()
const unicode11Addon = new Unicode11Addon()
const serializeAddon = new SerializeAddon()
const searchAddon = new SearchAddon({ highlightLimit: 50 })
const imageAddon = new ImageAddon({ showPlaceholder: true })
const clipboardAddon = new ClipboardAddon()
const ligaturesAddon = new LigaturesAddon()
const webLinksAddon = new WebLinksAddon((event, url) => {
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
})
const xtermReadline = new Readline()
webglAddon.onContextLoss(() => webglAddon.dispose())
terminal.loadAddon(webglAddon)

const terminalElement = document.querySelector('div#terminal')
if (!terminalElement) throw new Error('Terminal element not found')

terminal.open(terminalElement)
// Attach terminal instance to DOM element for context-like access
// @ts-expect-error - xterm property is not typed
terminalElement.xterm = terminal

/** @returns {import('@xterm/xterm').Terminal} */
export function getTerminal() {
  const terminalElement = /** @type {HTMLDivElement & { xterm: Terminal }} */ (
    document.querySelector('div#terminal')
  )
  return terminalElement.xterm
}

terminal.loadAddon(fitAddon)
terminal.loadAddon(searchAddon)
terminal.loadAddon(clipboardAddon)
terminal.loadAddon(unicode11Addon)
terminal.loadAddon(serializeAddon)
terminal.loadAddon(ligaturesAddon)
terminal.loadAddon(webLinksAddon)
terminal.loadAddon(imageAddon)
terminal.loadAddon(xtermReadline)
terminal.attachCustomKeyEventHandler(event => {
  if (handleAltNavigation(event)) return false
  if (
    event.type === 'keydown' &&
    event.key === 'c' &&
    event.ctrlKey &&
    event.metaKey
  ) {
    return false
  }
  return true
})
setTimeout(() => fitAddon.fit(), 25)

const statusText = document.querySelector('p#status-text')

const sessionId =
  localStorage.getItem('sessionId') ||
  `session-${Math.random().toString(36).slice(2, 9)}`
localStorage.setItem('sessionId', sessionId)

// Parse URL parameters for iframe embedding
const urlParams = new URLSearchParams(window.location.search)
const prefilledCommand = urlParams.get('cmd')
const embedMode = urlParams.get('embed') === 'true'
const autoRun = urlParams.get('autorun') === 'true' // defaults to false

/**
 * @type {WebSocket | undefined}
 */
let interactiveSocket
let interactiveMode = false
let interactiveInitQueued = ''
/**
 * @type {((value: any) => void) | undefined}
 */
let interactiveResolve
/**
 * @type {((arg0: Error) => void) | undefined}
 */
let interactiveReject
let currentStatus = 'offline'
let commandInProgress = false
let awaitingInput = false
let hasPrefilledCommand = false
terminal.writeln('\n')
terminal.focus()
setStatus(navigator.onLine ? 'online' : 'offline')

// Show footer only if NOT in embed mode
const footer = document.querySelector('footer#footer')
if (footer && !embedMode) footer.classList.add('footer')
else footer?.classList.remove('footer')

window.addEventListener('online', () => {
  if (!interactiveMode) setStatus('online')
})
window.addEventListener('offline', () => setStatus('offline'))

// Listen for postMessage from parent window to execute command
window.addEventListener('message', event => {
  if (event.data?.type === 'execute') {
    // Temporarily enable stdin to allow command execution
    terminal.options.disableStdin = false

    // Simulate Enter key press to execute the pre-filled command
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    })
    terminal.textarea?.dispatchEvent(enterEvent)

    // Re-disable stdin after execution if in embed mode
    setTimeout(() => {
      if (embedMode) {
        terminal.options.disableStdin = true
      }
    }, 200)
  }
})

xtermReadline.setCtrlCHandler(() => {
  if (interactiveMode || commandInProgress) return
  xtermReadline.println('^C')
  setStatus('online')
  startInputLoop()
})

terminal.onKey(event => {
  if (event.domEvent.defaultPrevented) return
  if (!interactiveMode) return
  event.domEvent.preventDefault()
  sendInteractiveKey(event.key, event.domEvent)
})

const interactiveTextarea = /** @type {HTMLTextAreaElement | null} */ (
  terminal.textarea
)
interactiveTextarea?.addEventListener('paste', event => {
  if (!interactiveMode) return
  const text = event.clipboardData?.getData('text')
  if (!text) return
  event.preventDefault()
  sendInteractiveInput(text)
})

startInputLoop()

function startInputLoop() {
  if (interactiveMode || awaitingInput) return
  awaitingInput = true

  xtermReadline
    .read(PROMPT)
    .then(async rawCommand => {
      awaitingInput = false
      await processCommand(rawCommand)
      startInputLoop()
    })
    .catch(error => {
      awaitingInput = false
      if (interactiveMode) return
      console.error('xtermReadline error', error)
      setStatus('error')
      startInputLoop()
    })

  // Pre-fill command if available and not yet used
  if (!hasPrefilledCommand && prefilledCommand) {
    hasPrefilledCommand = true
    // Use paste to insert the pre-filled command into xtermReadline
    setTimeout(() => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', prefilledCommand)
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
      })
      terminal.textarea?.dispatchEvent(pasteEvent)

      // Disable stdin if in embed mode (wait for button click to execute)
      if (embedMode && !autoRun) terminal.options.disableStdin = true

      // If autorun is enabled, simulate Enter key press
      if (autoRun) {
        setTimeout(() => {
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          })
          terminal.textarea?.dispatchEvent(enterEvent)
        }, 100)
      }
    }, 50)
  }
}

/** @param {string} rawCommand */
async function processCommand(rawCommand) {
  const trimmed = rawCommand.trim()
  if (!trimmed) {
    setStatus('online')
    return
  }

  if (isLocalCommand(trimmed)) {
    executeLocalCommand(trimmed)
    return
  }

  if (INTERACTIVE_COMMANDS.has(trimmed)) {
    await startInteractiveSession(rawCommand)
    return
  }

  commandInProgress = true
  setStatus('online')

  try {
    await runCommand(rawCommand)
    if (!interactiveMode) setStatus('online')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus('error')
    displayError(message)
  } finally {
    commandInProgress = false
  }
}

/** @param {Command} command */
function runCommand(command) {
  const binary = command.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (STREAMING_COMMANDS.has(binary)) {
    return runStreamingCommand(command)
  }
  return runSimpleCommand(command)
}

/** @param {Command} command */
function isLocalCommand(command) {
  const cmd = command.trim().toLowerCase()
  return cmd === 'clear' //|| cmd === 'reset'
}

/** @param {Command} command */
function executeLocalCommand(command) {
  const cmd = command.trim().toLowerCase()
  if (cmd === 'clear') {
    //|| cmd === 'reset') {
    terminal.clear()
    setStatus('online')
  }
}

/** @param {Command} command */
async function runSimpleCommand(command) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, sessionId }),
  })

  const payload = await parseJsonResponse(response)
  renderExecResult(payload)
}

function resetSandbox() {
  fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) [terminal.clear(), setStatus('online')]
      else [displayError(data.message), setStatus('error')]
    })
}

/** @param {Command} command */
async function runStreamingCommand(command) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ command, sessionId }),
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const payload = await parseJsonResponse(response)
    renderExecResult(payload)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = consumeSseBuffer(buffer, handleStreamEvent)
  }

  const finalChunk = decoder.decode()
  consumeSseBuffer(finalChunk, handleStreamEvent)
}

/** @param {string} buffer
 * @param {((event: any) => void)} callback
 */
function consumeSseBuffer(buffer, callback) {
  let working = buffer
  while (true) {
    const marker = working.indexOf('\n\n')
    if (marker === -1) break
    const chunk = working.slice(0, marker)
    working = working.slice(marker + 2)
    const data = chunk
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    try {
      callback(JSON.parse(data))
    } catch (error) {
      console.warn('Failed to parse SSE event', error)
    }
  }
  return working
}

/** @param {any} event */
function handleStreamEvent(event) {
  const type = typeof event.type === 'string' ? event.type : undefined
  if (!type) return

  if (type === 'stdout' && typeof event.data === 'string') {
    terminal.write(event.data, () => {
      console.info(serializeAddon.serialize())
    })
    return
  }

  if (type === 'stderr' && typeof event.data === 'string') {
    terminal.write(`\u001b[31m${event.data}\u001b[0m`, () => {
      console.info(serializeAddon.serialize())
    })
    return
  }

  if (type === 'error') {
    const message =
      typeof event.error === 'string' ? event.error : 'Stream error'
    displayError(message)
    setStatus('error')
    return
  }

  if (type === 'complete') {
    const code = typeof event.exitCode === 'number' ? event.exitCode : 'unknown'
    if (code !== 0) terminal.writeln(`\r\n[process exited with code ${code}]`)
    return
  }

  if (type === 'start') setStatus('online')
}

/** @param {Response} response */
async function parseJsonResponse(response) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || 'Command failed to start')
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('Malformed JSON response from sandbox')
  }
}

/** @param {any} result */
function renderExecResult(result) {
  if (result.stdout) {
    terminal.write(result.stdout, () => {
      console.info(serializeAddon.serialize())
    })
    if (!result.stdout.endsWith('\n')) terminal.write('\r\n')
  }
  if (result.stderr) displayError(result.stderr)

  if (!result.success) {
    const message = result.error || 'Command failed'
    displayError(message)
    setStatus('error')
  } else setStatus('online')
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    terminal.writeln(`\r\n[process exited with code ${result.exitCode}]`)
  }
}

/** @param {Command} command */
function startInteractiveSession(command) {
  if (interactiveMode) {
    terminal.writeln(
      '\u001b[33mInteractive session already active. Type `exit` to close it.\u001b[0m',
    )
    setStatus('interactive')
    return Promise.resolve()
  }

  interactiveMode = true
  commandInProgress = true
  interactiveInitQueued = command.endsWith('\n') ? command : `${command}\n`
  setStatus('interactive')
  terminal.writeln('\r\n\u001b[90mOpening interactive shell...\u001b[0m')

  return new Promise((resolve, reject) => {
    interactiveResolve = resolve
    interactiveReject = reject
    openInteractiveSocket()
  })
}

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
  socket.addEventListener('close', handleInteractiveClose)
  socket.addEventListener('error', handleInteractiveError)
}

/** @param {MessageEvent} event */
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
        console.info(serializeAddon.serialize())
      })
    }
    return
  }

  if (data instanceof ArrayBuffer) {
    const text = textDecoder.decode(new Uint8Array(data))
    if (text)
      terminal.write(text, () => {
        console.info(serializeAddon.serialize())
      })
    return
  }

  if (data instanceof Uint8Array) {
    const text = textDecoder.decode(data)
    if (text)
      terminal.write(text, () => {
        console.info(serializeAddon.serialize())
      })
  }
}

function handleInteractiveClose() {
  resetInteractiveState('online')
}

/** @param {Event} event */
function handleInteractiveError(event) {
  console.error('Interactive socket error', event)
  resetInteractiveState('error')
}

/**
 * @param {string} key
 * @param {KeyboardEvent} domEvent
 */
function sendInteractiveKey(key, domEvent) {
  if (!interactiveSocket || interactiveSocket.readyState !== WebSocket.OPEN)
    return

  if (domEvent.ctrlKey && domEvent.key.toLowerCase() === 'c') {
    sendInteractiveInput('\u0003')
    return
  }

  switch (domEvent.key) {
    case 'Enter':
      sendInteractiveInput('\r')
      return
    case 'Backspace':
      sendInteractiveInput('\u0008')
      return
    case 'Tab':
      sendInteractiveInput('\t')
      return
    case 'ArrowUp':
      sendInteractiveInput('\u001b[A')
      return
    case 'ArrowDown':
      sendInteractiveInput('\u001b[B')
      return
    case 'ArrowLeft':
      sendInteractiveInput('\u001b[D')
      return
    case 'ArrowRight':
      sendInteractiveInput('\u001b[C')
      return
    default:
      break
  }

  if (key.length === 1 && !domEvent.metaKey) {
    sendInteractiveInput(key)
  }
}

/** @param {string} text */
function sendInteractiveInput(text) {
  if (!text) return
  if (!interactiveSocket || interactiveSocket.readyState !== WebSocket.OPEN)
    return
  interactiveSocket.send(textEncoder.encode(text))
}

/** @param {any} payload */
function sendInteractiveJson(payload) {
  if (!interactiveSocket || interactiveSocket.readyState !== WebSocket.OPEN)
    return
  interactiveSocket.send(JSON.stringify(payload))
}

/** @param {keyof typeof STATUS_STYLE} mode */
function resetInteractiveState(mode) {
  if (interactiveSocket && interactiveSocket.readyState === WebSocket.OPEN) {
    interactiveSocket.close()
  }
  interactiveSocket = undefined
  interactiveMode = false
  interactiveInitQueued = ''
  commandInProgress = false
  setStatus(mode)
  if (mode === 'error') {
    interactiveReject?.(new Error('Interactive session ended with error'))
  } else {
    interactiveResolve?.(undefined)
  }
  interactiveResolve = undefined
  interactiveReject = undefined
  startInputLoop()
}

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}${WS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`
}

/** @param {string} message */
function displayError(message) {
  terminal.writeln(`\u001b[31m${message}\u001b[0m`, () => {
    console.info(serializeAddon.serialize())
  })
}

/** @param {keyof typeof STATUS_STYLE} mode */
function setStatus(mode) {
  if (currentStatus === mode) return
  currentStatus = mode
  if (!statusText) return

  const style =
    /** @type {(typeof STATUS_STYLE)[keyof typeof STATUS_STYLE]} */ (
      STATUS_STYLE[mode] ?? STATUS_STYLE.online
    )
  statusText.style.top = '0'
  statusText.style.right = '0'
  statusText.style.top = '6px'
  statusText.style.right = '6px'
  statusText.style.zIndex = '1000'
  statusText.style.fontSize = '14px'
  statusText.textContent = style.text
  statusText.style.color = style.color
  statusText.style.position = 'absolute'
  statusText.style.letterSpacing = '0.05em'
}

window.addEventListener('resize', () => {
  if (!document.hidden) {
    fitAddon.fit()
    if (interactiveMode) {
      sendInteractiveJson({
        type: 'resize',
        cols: terminal.cols,
        rows: terminal.rows,
      })
    }
  }
})

/**
 * Accepts virtual keyboard events (e.g., the on-screen modifier pad) and routes
 * them through the active input pipeline so control characters are preserved.
 * @param {{ key: string; ctrl?: boolean; shift?: boolean }} payload
 */
export function sendVirtualKeyboardInput(payload) {
  if (!payload || typeof payload.key !== 'string' || payload.key.length === 0) {
    return
  }
  handleVirtualKeyboardInput({
    key: payload.key,
    ctrl: Boolean(payload.ctrl),
    shift: Boolean(payload.shift),
  })
}

/**
 * @param {{ key: string; ctrl?: boolean; shift?: boolean }} payload
 */
function handleVirtualKeyboardInput(payload) {
  if (interactiveMode) {
    handleVirtualInteractiveInput(payload)
    return
  }
  handleVirtualReadlineInput(payload)
}

/**
 * @param {{ key: string; ctrl?: boolean; shift?: boolean }} payload
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
 * @param {{ key: string; ctrl?: boolean; shift?: boolean }} payload
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
 * Maps a printable key to its corresponding control character, if any.
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
 * Handles Alt-modified keyboard events for both interactive and xtermReadline contexts.
 * @param {KeyboardEvent} domEvent
 * @returns {boolean}
 */
function handleAltNavigation(domEvent) {
  if (!domEvent.altKey || domEvent.type !== 'keydown') return false

  if (interactiveMode) {
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

  switch (domEvent.key) {
    case 'ArrowLeft':
      moveCursorByWord('left')
      return true
    case 'ArrowRight':
      moveCursorByWord('right')
      return true
    case 'ArrowUp':
      moveCursorToBoundary('home')
      return true
    case 'ArrowDown':
      moveCursorToBoundary('end')
      return true
    case 'Backspace':
      // @ts-expect-error
      xtermReadline.readData('\u001b\u007f')
      return true
    default:
      return false
  }
}

/**
 * Moves the xtermReadline cursor by one word in the provided direction.
 * @param {'left' | 'right'} direction
 */
function moveCursorByWord(direction) {
  const state = /** @type {any} */ (xtermReadline).state
  if (!state?.line) return
  const buffer = state.line.buffer()
  const current = state.line.pos ?? buffer.length
  if (direction === 'left') {
    const target = findWordBoundaryLeft(buffer, current)
    if (target === current) return
    state.line.set_pos(target)
    state.moveCursor()
    return
  }
  if (direction === 'right') {
    const target = findWordBoundaryRight(buffer, current)
    if (target === current) return
    state.line.set_pos(target)
    state.moveCursor()
  }
}

/**
 * Moves the cursor to either the start or end of the line.
 * @param {'home' | 'end'} direction
 */
function moveCursorToBoundary(direction) {
  const state = /** @type {any} */ (xtermReadline).state
  if (!state) return
  if (direction === 'home') {
    state.moveCursorHome()
  } else if (direction === 'end') {
    state.moveCursorEnd()
  }
}

/**
 * Finds the nearest word boundary to the left of the cursor.
 * @param {string} buffer
 * @param {number} index
 */
function findWordBoundaryLeft(buffer, index) {
  let idx = Math.max(0, index)
  if (idx === 0) return 0
  idx--
  while (idx > 0 && /\s/.test(buffer[idx])) idx--
  while (idx > 0 && !/\s/.test(buffer[idx - 1])) idx--
  return idx
}

/**
 * Finds the nearest word boundary to the right of the cursor.
 * @param {string} buffer
 * @param {number} index
 */
function findWordBoundaryRight(buffer, index) {
  const len = buffer.length
  let idx = Math.max(0, index)
  if (idx >= len) return len
  while (idx < len && /\s/.test(buffer[idx])) idx++
  while (idx < len && !/\s/.test(buffer[idx])) idx++
  return idx
}

/**
 * Type guard to check if a key is a supported Alt-arrow key.
 * @param {string} key
 * @returns {key is keyof typeof ALT_ARROW_SEQUENCES}
 */
function isAltArrowKey(key) {
  return key in ALT_ARROW_SEQUENCES
}
