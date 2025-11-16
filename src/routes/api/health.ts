import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import { makeObjectStorage } from '@solid-primitives/storage'

const HEALTH_TIMEOUT_MS = 5_000

const HealthRequestSchema = z.object({
  sessionId: z.string({ error: 'Missing sessionId' }),
  tabId: z.optional(z.string()),
})

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => new Response('ok', { status: 200 }),
      POST: async ({ request }) => {
        const body = await request.json()
        const payload = HealthRequestSchema.safeParse(body)

        if (!payload.success)
          return json({ error: payload.error.message }, { status: 400 })

        const { sessionId, tabId } = payload.data

        const sandboxId = ensureSandboxSession(sessionId, tabId).sandboxId
        const sandbox = getSandbox(env.Sandbox, sandboxId, {
          // keepAlive: true,
        })

        try {
          await sandbox.exec('true', { timeout: HEALTH_TIMEOUT_MS })
          return json(
            { activeTabs: getActiveTabCount(sessionId) },
            { status: 200 },
          )
        } catch (error) {
          console.error('Sandbox warmup failed', error)
          return json({ error: 'Sandbox warmup failed' }, { status: 500 })
        }
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

function getActiveTabCount(sessionId: string) {
  return readSandboxSession(sessionId)?.activeTabs.length ?? 0
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
