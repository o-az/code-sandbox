/**
 * Starts a recurring sandbox warmup loop that keeps the session container hot.
 * @param {object} options
 * @param {string} options.sessionId
 * @param {string} options.tabId
 * @param {() => void} [options.onWarmupFailure]
 * @param {number} [options.intervalMs]
 * @returns {() => void} cleanup function that cancels the loop.
 */
export function startSandboxWarmup({
  sessionId,
  tabId,
  onWarmupFailure,
  intervalMs = 4 * 60 * 1000,
}) {
  warmupSandbox(sessionId, tabId, false, onWarmupFailure)

  const timer = window.setInterval(() => {
    warmupSandbox(sessionId, tabId, true, onWarmupFailure)
  }, intervalMs)

  return () => window.clearInterval(timer)
}

/**
 * @param {string} sessionId
 * @param {string} tabId
 * @param {boolean} recurring
 * @param {() => void} [onWarmupFailure]
 */
function warmupSandbox(sessionId, tabId, recurring, onWarmupFailure) {
  fetch('/api/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, tabId }),
    keepalive: true,
  }).catch(error => {
    if (!recurring) {
      console.debug('Sandbox warmup failed', error)
      onWarmupFailure?.()
    }
  })
}
