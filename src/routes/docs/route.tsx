import { createServerFn } from '@tanstack/solid-start'
import { createFileRoute } from '@tanstack/solid-router'
import { writeClipboard } from '@solid-primitives/clipboard'
import { transformerNotationFocus } from '@shikijs/transformers'
import { batch, createSignal, Match, onMount, Switch } from 'solid-js'
import { createOnigurumaEngine, loadWasm } from 'shiki/engine/oniguruma'
import { createHighlighterCore, type ThemeRegistration } from 'shiki/core'

import { theme } from './-data/theme.ts'
import type { MaybePromise } from '#lib/types.ts'
import { htmlCodeSnippet } from './-data/snippets.ts'

const generateCode = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    await loadWasm(import('shiki/onig.wasm'))

    const highlighter = await createHighlighterCore({
      themes: [import('@shikijs/themes/houston')],
      langs: [import('@shikijs/langs/tsx'), import('@shikijs/langs/html')],

      engine: createOnigurumaEngine(await import('shiki/wasm')),
    })

    return highlighter.codeToHtml(htmlCodeSnippet.trimStart(), {
      lang: 'html',
      transformers: [transformerNotationFocus()],
      theme: theme as ThemeRegistration,
    })
  } catch (error) {
    console.info('error in serverfn')
    console.error(error)
  }
})

export const Route = createFileRoute('/docs')({
  component: RouteComponent,
  loader: () => generateCode(),
})

function RouteComponent() {
  const code = Route.useLoaderData()
  const [codeElement, setCodeElement] = createSignal<
    (HTMLElement & { setHTMLUnsafe?: (value: string) => void }) | undefined
  >()

  const copyHighlightedSnippet = async () =>
    await writeClipboard(
      codeElement()?.textContent?.trim() ?? htmlCodeSnippet.trim(),
    )

  onMount(() => {
    if (code() && typeof code() === 'string')
      codeElement()?.setHTMLUnsafe?.(`${code()}`)
  })

  return (
    <main class="flex min-h-dvh flex-col items-center overflow-y-auto border-y-[1.5px] border-y-green-400 pb-6">
      <div class="mt-20 flex w-full max-w-[720px] flex-col items-center gap-y-4">
        <h1 class="md:text-4xl text-2xl font-black text-center mt-12">
          Sandbox Embed Guide
        </h1>
        <h2>
          <a
            href="https://git--019aab4bf72f75ba9fff5a382032de2d.web.val.run/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-400 font-semibold uppercase font-mono">
            live demo
          </a>{' '}
          🌐
        </h2>
        <div class="bg-[#171F2B] w-full flex justify-center sm:max-w-[620px] max-w-full">
          <article
            ref={setCodeElement}
            data-element="iframe-code-block"
            // show a light border on hover
            class="text-sm self-center shrink-0 w-full sm:max-w-[620px] max-w-full rounded-sm"
          />
        </div>
      </div>
    </main>
  )
}

function CopyButton(props: { onCopy: () => MaybePromise<void> }) {
  const [isCopied, setIsCopied] = createSignal(false)

  const handleCopy = async () =>
    batch(async () => [
      await props.onCopy(),
      setIsCopied(true),
      setTimeout(() => setIsCopied(false), 2_000),
    ])

  return (
    <button
      onClick={handleCopy}
      type="button"
      classList={{
        'border-red-400': isCopied(),
        'border-green-400': !isCopied(),
      }}
      class="rounded-sm transition-colors duration-200">
      <Switch>
        <Match when={!isCopied()}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-4.5 text-zinc-300/90"
            viewBox="0 0 24 24">
            <title>Copy to Clipboard</title>
            <g
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </g>
          </svg>
        </Match>

        <Match when={isCopied()}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-5 text-green-300/90"
            viewBox="0 0 24 24">
            <title>check</title>
            <path
              fill="currentColor"
              d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"
            />
          </svg>
        </Match>
      </Switch>
    </button>
  )
}
