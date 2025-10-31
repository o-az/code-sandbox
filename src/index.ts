export { Sandbox } from '@cloudflare/sandbox'
import { getSandbox, proxyToSandbox, type Sandbox } from '@cloudflare/sandbox'

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>
}

const sessions = new Map<string, string>()

export default {
  async fetch(request, env, _context) {
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

    const url = new URL(request.url)

    if (url.pathname === '/ping' || url.pathname === '/health')
      return new Response('OK')

    // Required for preview URLs (if exposing ports)
    const proxyResponse = await proxyToSandbox(request, env)
    if (proxyResponse) return proxyResponse

    if (url.pathname === '/api/ping') return Response.json({ pong: true })

    if (url.pathname === '/api/exec') return handleExec(request, env)

    if (url.pathname === '/api/reset') return handleReset(request, env)

    if (url.pathname === '/') return env.Web.fetch(request)

    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Cloudflare.Env>

async function handleExec(request: Request, env: Env): Promise<Response> {
  try {
    const { command, sessionId } = await request.json<{
      command: string
      sessionId: string
    }>()

    if (!command || !sessionId) {
      return Response.json(
        { success: false, error: 'Missing command or sessionId' },
        { status: 400 },
      )
    }

    const sandboxId = sessions.get(sessionId) ?? `sandbox-${sessionId}`
    sessions.set(sessionId, sandboxId)

    const sandbox = getSandbox(env.Sandbox, sandboxId)

    // Execute the command
    const result = await sandbox.exec(command, {
      timeout: 30_000, // 30s
    })

    return Response.json(
      {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error(error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

async function handleReset(request: Request, _env: Env): Promise<Response> {
  try {
    const { sessionId } = await request.json<{ sessionId: string }>()

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'Missing sessionId' },
        { status: 400 },
      )
    }

    // Create a new sandbox ID for this session (effectively resetting)
    const newSandboxId = `sandbox-${sessionId}-${Date.now()}`
    sessions.set(sessionId, newSandboxId)

    return Response.json(
      { success: true, message: 'Sandbox reset successfully' },
      { status: 200 },
    )
  } catch (error) {
    console.error(error)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 },
    )
  }
}
