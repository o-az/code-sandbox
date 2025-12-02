import * as z from 'zod/mini'

export const CommandSearchSchema = z.object({
  cmd: z.string().check(z.minLength(2)),
  o: z.optional(z.string()),
  html: z.prefault(z.optional(z.coerce.boolean()), 'false'),
  autorun: z.prefault(z.optional(z.coerce.boolean()), 'false'),
})

export type CommandSearch = z.infer<typeof CommandSearchSchema>

export type NormalizedCommandSearch = {
  command: string
  encodedOutput: string | null
  includeHtmlSnapshot: boolean
  autorun: boolean
}

export function normalizeCommandSearch(
  search: CommandSearch,
): NormalizedCommandSearch {
  return {
    command: search.cmd.trim(),
    encodedOutput: search.o ?? null,
    includeHtmlSnapshot: search.html ?? false,
    autorun: search.autorun ?? false,
  }
}

export function clearEncodedOutputParams(url: URL) {
  url.searchParams.delete('o')
  url.searchParams.delete('html')
}

export function setAutorunParam(url: URL, enabled: boolean) {
  if (enabled) url.searchParams.set('autorun', enabled.toString())
  else url.searchParams.delete('autorun')
}

export type CommandUrlParams = {
  command: string
  encodedOutput?: string | null
  includeHtmlSnapshot?: boolean
  autorun?: boolean
}

export function applyCommandParams(url: URL, params: CommandUrlParams) {
  url.searchParams.set('cmd', params.command.trim())

  if (params.encodedOutput) {
    url.searchParams.set('o', params.encodedOutput)
    if (params.includeHtmlSnapshot)
      url.searchParams.set('html', params.includeHtmlSnapshot.toString())
    else url.searchParams.delete('html')
  } else {
    clearEncodedOutputParams(url)
  }

  if (params.autorun) setAutorunParam(url, params.autorun)
  else url.searchParams.delete('autorun')

  return url
}
