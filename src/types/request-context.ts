import type {
  DurableObjectNamespace,
  ExecutionContext,
} from '@cloudflare/workers-types'

export type SandboxEnv = Cloudflare.Env & {
  Sandbox: DurableObjectNamespace
}

export type WorkerRequestContext = {
  env: SandboxEnv
  executionContext: ExecutionContext
}
