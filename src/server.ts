import handler, { createServerEntry } from '@tanstack/solid-start/server-entry'
import type { RequestOptions } from '@tanstack/solid-start/server'
import type { Register } from '@tanstack/solid-router'
import type { ExecutionContext } from '@cloudflare/workers-types'

import type { WorkerRequestContext, SandboxEnv } from '#types/request-context'

export default createServerEntry({
  fetch: async (
    request,
    envOrOptions?: SandboxEnv | RequestOptions<Register>,
    executionContext?: ExecutionContext,
  ) => {
    if (executionContext && envOrOptions && isSandboxEnv(envOrOptions)) {
      const requestContext: WorkerRequestContext = {
        env: envOrOptions,
        executionContext,
      }

      return handler.fetch(request, {
        context: requestContext,
      })
    }

    return handler.fetch(request, envOrOptions)
  },
})

function isSandboxEnv(value: unknown): value is SandboxEnv {
  return (
    typeof value === 'object' &&
    value !== null &&
    'Sandbox' in value &&
    typeof (value as SandboxEnv).Sandbox !== 'undefined'
  )
}

declare module '@tanstack/solid-start' {
  interface Register {
    server: {
      requestContext?: WorkerRequestContext
    }
  }
}

export { Sandbox } from '@cloudflare/sandbox'
