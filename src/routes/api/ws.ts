import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import { makeObjectStorage } from '@solid-primitives/storage'

const DEFAULT_WS_PORT = 80_80

const WebSocketSchema = {
  Request: z.object({
    sessionId: z.string({ error: 'Missing sessionId' }),
  }),
  Port: z.catch(
    z.coerce
      .number()
      .check(z.int({ error: 'Invalid WS port' }))
      .check(z.gte(1, { error: 'Invalid WS port' }))
      .check(z.lte(65_535, { error: 'Invalid WS port' })),
    DEFAULT_WS_PORT,
  ),
}

export const Route = createFileRoute('/api/ws')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const payload = WebSocketSchema.Request.safeParse({
          sessionId:
            url.searchParams.get('sessionId') ??
            request.headers.get('X-Session-ID') ??
            undefined,
        })

        if (!payload.success)
          return json({ error: payload.error.message }, { status: 400 })

        const websocketPort = WebSocketSchema.Port.parse(env.WS_PORT)

        const sandboxId = ensureSandboxSession(payload.data.sessionId).sandboxId
        const sandbox = getSandbox(env.Sandbox, sandboxId, {
          // keepAlive: true,
        })

        return sandbox.wsConnect(request, websocketPort)
      },
    },
  },
})

type SandboxRecord = {
  sandboxId: string
  activeTabs: string[]
}

type SandboxGlobal = typeof globalThis & {
  __sandboxSessions?: Record<string, string>
}

const sandboxStorage = makeObjectStorage(
  ((globalThis as SandboxGlobal).__sandboxSessions ??= {}),
)

function ensureSandboxSession(
  sessionId: string,
  tabId?: string,
): SandboxRecord {
  const record = readSandboxSession(sessionId) ?? {
    sandboxId: sessionId,
    activeTabs: [],
  }

  if (tabId && !record.activeTabs.includes(tabId)) {
    record.activeTabs = [...record.activeTabs, tabId]
  }

  writeSandboxSession(sessionId, record)
  return record
}

function readSandboxSession(sessionId: string): SandboxRecord | undefined {
  const raw = sandboxStorage.getItem(sessionId)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as SandboxRecord
  } catch {
    sandboxStorage.removeItem(sessionId)
    return undefined
  }
}

function writeSandboxSession(sessionId: string, record: SandboxRecord) {
  sandboxStorage.setItem(sessionId, JSON.stringify(record))
}
