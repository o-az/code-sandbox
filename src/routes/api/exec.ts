import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { createFileRoute } from '@tanstack/solid-router'
import { getSandbox, type ExecResult } from '@cloudflare/sandbox'

import { makeObjectStorage } from '@solid-primitives/storage'

const DEFAULT_TIMEOUT_MS = 25_000

const ExecCommandRequestSchema = z.object({
  command: z.string(),
  sessionId: z.string({ error: 'Missing sessionId' }),
})

export const Route = createFileRoute('/api/exec')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const payload = ExecCommandRequestSchema.safeParse(body)

        if (!payload.success)
          return json({ error: payload.error.message }, { status: 400 })

        const { command, sessionId } = payload.data

        const sandboxId = ensureSandboxSession(sessionId).sandboxId
        const sandbox = getSandbox(env.Sandbox, sandboxId)

        const result = await sandbox.exec(command, {
          timeout: DEFAULT_TIMEOUT_MS,
        })
        return json({ ...result, sandboxId }, { status: 200 })
      },
      OPTIONS: () =>
        new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, X-Session-ID, X-Tab-ID',
          },
        }),
    },
  },
})

const _fakeResult = (): ExecResult => ({
  success: true,
  exitCode: 0,
  stdout:
    ' _____\n< moo >\n -----\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||',
  stderr: '',
  command: "npx cowsay 'moo'",
  duration: 729,
  timestamp: '1989-01-01T00:00:00.000Z',
  sessionId: 'session-01010101-0202-0303-0404-050505050505',
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
