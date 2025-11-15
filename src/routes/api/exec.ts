import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/solid-router'
import { getSandbox } from '@cloudflare/sandbox'

export { Sandbox } from '@cloudflare/sandbox'

import { getOrCreateSandboxId } from '#lib/sandbox-session.ts'

type ExecRequestPayload = {
  command?: string
  sessionId?: string
  tabId?: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 25_000
const MAX_TIMEOUT_MS = 60_000
const MIN_TIMEOUT_MS = 1_000

export const Route = createFileRoute('/api/exec')({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          headers: buildCorsHeaders(),
        }),
      POST: async ({ request }) => {
        const jsonType = request.headers.get('content-type') || ''
        if (!jsonType.includes('application/json')) {
          return jsonResponse(
            { error: 'Content-Type must be application/json' },
            415,
          )
        }

        let payload: ExecRequestPayload
        try {
          payload = (await request.json()) as ExecRequestPayload
        } catch (error) {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        const command = payload.command?.trim()
        const sessionId = payload.sessionId?.trim()
        const tabId = payload.tabId?.trim()

        if (!command) {
          return jsonResponse({ error: 'Missing command' }, 400)
        }

        if (!sessionId) {
          return jsonResponse({ error: 'Missing sessionId' }, 400)
        }

        if (!env?.Sandbox) {
          return jsonResponse(
            { error: 'Sandbox binding is not available in this environment' },
            503,
          )
        }

        const sandboxId = getOrCreateSandboxId(sessionId, tabId)
        const sandbox = getSandbox(env.Sandbox, sandboxId, {
          keepAlive: true,
        })

        const timeout = clampTimeout(payload.timeoutMs)

        try {
          const result = await sandbox.exec(command, { timeout })
          return jsonResponse({ sandboxId, result })
        } catch (error) {
          console.error('sandbox exec failed', error)
          return jsonResponse(
            {
              error: 'Sandbox execution failed',
              details: error instanceof Error ? error.message : String(error),
            },
            500,
          )
        }
      },
    },
  },
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildCorsHeaders({ 'content-type': 'application/json' }),
  })
}

function buildCorsHeaders(extra: Record<string, string> = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'OPTIONS, POST',
    'access-control-allow-headers': 'content-type, x-session-id, x-tab-id',
    ...extra,
  }
}

function clampTimeout(value?: number) {
  if (!value || Number.isNaN(value)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, value))
}
