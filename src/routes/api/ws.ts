import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import { ensureSandboxSession } from '#lib/sandbox/server.ts'

const DEFAULT_WS_PORT = 8080

const WebSocketRequestSchema = z.object({
  sessionId: z.string({ error: 'Missing sessionId' }),
})

function parseRequest(request: Request) {
  const url = new URL(request.url)
  const candidateSessionId =
    url.searchParams.get('sessionId') ?? request.headers.get('X-Session-ID')

  return WebSocketRequestSchema.safeParse({ sessionId: candidateSessionId })
}

export const Route = createFileRoute('/api/ws')({
  server: {
    handlers: {
      GET: handleWebSocketUpgrade,
    },
  },
})

async function handleWebSocketUpgrade({ request }: { request: Request }) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'WebSocket upgrade required' }, { status: 400 })
  }

  const parsed = parseRequest(request)
  if (!parsed.success) {
    return json({ error: parsed.error.message }, { status: 400 })
  }

  const { sessionId } = parsed.data
  const { sandboxId } = ensureSandboxSession(sessionId)
  const sandbox = getSandbox(env.Sandbox, sandboxId)

  const websocketPort = Number(env.WS_PORT ?? DEFAULT_WS_PORT)
  return sandbox.wsConnect(request, websocketPort)
}
