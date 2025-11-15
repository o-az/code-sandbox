import { env } from 'cloudflare:workers'
import { getSandbox } from '@cloudflare/sandbox'

export { Sandbox } from '@cloudflare/sandbox'

import { app } from '#setup.ts'

// Track active tabs per session
interface SessionInfo {
  sandboxId: string
  activeTabs: Set<string>
  lastActivity: number
}

const sessions = new Map<string, SessionInfo>()
const COMMAND_WS_PORT = Number(env.WS_PORT || 80_80)

app.get('/ping', context => context.text('ok'))
app.get('/health', context => context.text('ok'))
app.get('/api/ping', context => context.text('ok'))

app.get('/', context => context.env.Web.fetch(context.req.raw))

app.get('/.well-known*', context =>
  context.redirect('https://h0n0.evm.workers.dev/cat'),
)

app.post('/api/exec', async context => {
  const { command, sessionId } = await context.req.json<{
    command: string
    sessionId: string
  }>()

  const sandboxId = getOrCreateSandboxId(sessionId)
  const sandbox = getSandbox(context.env.Sandbox, sandboxId, {
    keepAlive: true,
  })

  const result = await sandbox.exec(command, {
    timeout: 25_000, // 25s
  })

  return context.json(result)
})

app.post('/api/health', async context => {
  const { sessionId, tabId } = await context.req.json<{
    sessionId?: string
    tabId?: string
  }>()

  if (!sessionId) {
    return context.json(
      { success: false, error: 'Missing sessionId' },
      { status: 400 },
    )
  }

  const sandboxId = getOrCreateSandboxId(sessionId, tabId)
  const sandbox = getSandbox(context.env.Sandbox, sandboxId, {
    keepAlive: true,
  })

  try {
    await sandbox.exec('true', { timeout: 5_000 })
    const sessionInfo = sessions.get(sessionId)
    return context.json({
      success: true,
      activeTabs: sessionInfo?.activeTabs.size || 0,
    })
  } catch (error) {
    console.error('Sandbox warmup failed', error)
    return context.json(
      { success: false, error: 'Sandbox warmup failed' },
      { status: 500 },
    )
  }
})

app.on(['GET', 'POST'], '/api/reset', async context => {
  const { sessionId, tabId } =
    context.req.method === 'GET'
      ? context.req.query()
      : await context.req.json<{ sessionId: string; tabId?: string }>()

  const sessionInfo = sessions.get(sessionId)

  if (!sessionInfo) {
    return context.json({
      success: true,
      message: 'Session already destroyed',
    })
  }

  // Remove this tab from active tabs
  if (tabId) sessionInfo.activeTabs.delete(tabId)

  // Only destroy if no tabs remain active
  if (sessionInfo.activeTabs.size === 0) {
    const sandbox = getSandbox(context.env.Sandbox, sessionInfo.sandboxId, {
      keepAlive: true,
    })

    let success = false
    try {
      await sandbox.destroy()
      sessions.delete(sessionId)
      success = true
      console.log(`Destroyed sandbox for session ${sessionId}`)
    } catch (error) {
      console.error('Failed to destroy sandbox', error)
    }

    return context.json({
      success,
      message: success
        ? 'Sandbox destroyed (last tab closed)'
        : 'Failed to destroy sandbox',
    })
  }

  // Still have active tabs
  return context.json({
    success: true,
    message: `Sandbox kept alive (${sessionInfo.activeTabs.size} tabs remaining)`,
    activeTabs: sessionInfo.activeTabs.size,
  })
})

app.get('/api/ws', context => {
  const sessionId =
    context.req.query('sessionId') || context.req.header('x-sandbox-session-id')

  if (!sessionId)
    return context.json({ error: 'Missing sessionId' }, { status: 400 })

  const sandboxId = getOrCreateSandboxId(sessionId)
  const sandbox = getSandbox(context.env.Sandbox, sandboxId, {
    keepAlive: true,
  })
  return sandbox.wsConnect(context.req.raw, COMMAND_WS_PORT)
})

export default {
  async fetch(request, env, context) {
    const ip = request.headers.get('cf-connecting-ip')

    if (env.ENVIRONMENT === 'production') {
      const { success } = await env.RATE_LIMITER.limit({ key: ip || '' })
      if (!success) return new Response('Rate limit exceeded', { status: 429 })
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    return app.fetch(request, env, context)
  },
} satisfies ExportedHandler<Cloudflare.Env>

function getOrCreateSandboxId(sessionId: string, tabId?: string): string {
  let sessionInfo = sessions.get(sessionId)

  if (!sessionInfo) {
    // Create new session
    const sandboxId = `sandbox-${sessionId}`
    sessionInfo = {
      sandboxId,
      activeTabs: new Set(tabId ? [tabId] : []),
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, sessionInfo)
    return sandboxId
  }

  // Update existing session
  if (tabId) sessionInfo.activeTabs.add(tabId)
  sessionInfo.lastActivity = Date.now()

  return sessionInfo.sandboxId
}
