export type WarmupController = {
  /** Promise that resolves when initial warmup completes */
  ready: Promise<void>
  /** Cleanup function to stop the warmup loop */
  stop: () => void
}

/**
 * Starts a recurring sandbox warmup loop that keeps the session container hot.
 * Returns a controller with a `ready` promise that resolves when initial warmup completes.
 */
export function startSandboxWarmup({
  sessionId,
  tabId,
  onWarmupFailure,
  intervalMs = 4 * 60 * 1_000,
  skipImmediate = false,
}: {
  sessionId: string
  tabId: string
  onWarmupFailure?: () => void
  intervalMs?: number
  skipImmediate?: boolean
}): WarmupController {
  if (typeof window === 'undefined') {
    return { ready: Promise.resolve(), stop: () => {} }
  }

  // Only run the warmup loop when the terminal route is active. Navigating to
  // static routes like /demo or /docs should not boot the sandbox container.
  if (window.location.pathname !== '/') {
    return { ready: Promise.resolve(), stop: () => {} }
  }

  let initialResolve: () => void
  const ready = new Promise<void>(resolve => {
    initialResolve = resolve
  })

  if (skipImmediate) {
    initialResolve!()
  } else {
    void warmupSandbox(sessionId, tabId, false, onWarmupFailure).finally(() => {
      initialResolve!()
    })
  }

  const timer = window.setInterval(() => {
    void warmupSandbox(sessionId, tabId, true, onWarmupFailure)
  }, intervalMs)

  const stop = () => {
    window.clearInterval(timer)
  }

  return { ready, stop }
}

async function warmupSandbox(
  sessionId: string,
  tabId: string,
  recurring: boolean,
  onWarmupFailure?: () => void,
) {
  try {
    await fetch('/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, tabId }),
      // keepalive: true,
    })
  } catch (error) {
    if (!recurring) {
      console.debug('Sandbox warmup failed', error)
      onWarmupFailure?.()
    }
  }
}
