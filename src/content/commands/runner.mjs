import { API_ENDPOINT, STREAMING_COMMANDS } from '../state/session.mjs'

const textDecoder = new TextDecoder()

/**
 * @typedef {Object} CommandRunnerOptions
 * @property {string} sessionId
 * @property {import('@xterm/xterm').Terminal} terminal
 * @property {import('@xterm/addon-serialize').SerializeAddon} serializeAddon
 * @property {(mode: import('../terminal/status.mjs').StatusMode) => void} setStatus
 * @property {(message: string) => void} displayError
 * @property {Set<string>} [streamingCommands]
 */

/**
 * Creates helpers to execute commands via the API.
 * @param {CommandRunnerOptions} options
 * @returns {{ runCommand: (command: string) => Promise<void>, runStreamingCommand: (command: string) => Promise<void>, runSimpleCommand: (command: string) => Promise<void> }}
 */
export function createCommandRunner({
  sessionId,
  terminal,
  setStatus,
  displayError,
  streamingCommands = STREAMING_COMMANDS,
}) {
  if (!sessionId) throw new Error('Session ID is required')

  /**
   * Executes a non-streaming command.
   * @param {string} command
   * @returns {Promise<void>}
   */
  async function runSimpleCommand(command) {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, sessionId }),
    })

    const payload = await parseJsonResponse(response)
    renderExecResult(payload)
  }

  /**
   * Executes a command expecting an SSE stream.
   * @param {string} command
   * @returns {Promise<void>}
   */
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
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += textDecoder.decode(value, { stream: true })
      buffer = consumeSseBuffer(buffer, handleStreamEvent)
    }

    const finalChunk = textDecoder.decode()
    consumeSseBuffer(finalChunk, handleStreamEvent)
  }

  /**
   * @param {string} buffer
   * @param {(chunk: any) => void} callback
   * @returns {string}
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

  /**
   * @param {{ type?: string, data?: unknown, error?: unknown, exitCode?: number }} event
   * @returns {void}
   */
  function handleStreamEvent(event) {
    const type = typeof event.type === 'string' ? event.type : undefined
    if (!type) return

    if (type === 'stdout' && typeof event.data === 'string') {
      terminal.write(event.data)
      return
    }

    if (type === 'stderr' && typeof event.data === 'string') {
      terminal.write(`\u001b[31m${event.data}\u001b[0m`)
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
      const code =
        typeof event.exitCode === 'number' ? event.exitCode : 'unknown'
      if (code !== 0) terminal.writeln(`\r\n[process exited with code ${code}]`)
      return
    }

    if (type === 'start') setStatus('online')
  }

  /**
   * @param {Response} response
   * @returns {Promise<any>}
   */
  async function parseJsonResponse(response) {
    const text = await response.text()
    if (!response.ok) {
      throw new Error(text || 'Command failed to start')
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Malformed JSON response from sandbox')
    }
  }

  /**
   * @param {{ stdout?: string, stderr?: string, success?: boolean, error?: string, exitCode?: number }} result
   * @returns {void}
   */
  function renderExecResult(result) {
    if (result.stdout) {
      terminal.write(result.stdout)
      if (!result.stdout.endsWith('\n')) terminal.write('\r\n')
    }
    if (result.stderr) displayError(result.stderr)

    if (!result.success) {
      const message = result.error || 'Command failed'
      displayError(message)
      setStatus('error')
    } else {
      setStatus('online')
    }

    if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
      terminal.writeln(`\r\n[process exited with code ${result.exitCode}]`)
    }
  }

  /**
   * Routes commands to the appropriate transport.
   * @param {string} command
   * @returns {Promise<void>}
   */
  function runCommand(command) {
    const binary = command.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (streamingCommands.has(binary)) {
      return runStreamingCommand(command)
    }
    return runSimpleCommand(command)
  }

  return {
    runCommand,
    runStreamingCommand,
    runSimpleCommand,
  }
}
