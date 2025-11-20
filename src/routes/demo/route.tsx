import { createServerFn } from '@tanstack/solid-start'
import { createFileRoute } from '@tanstack/solid-router'
import { writeClipboard } from '@solid-primitives/clipboard'
import { transformerNotationFocus } from '@shikijs/transformers'
import { batch, createSignal, Match, onMount, Switch } from 'solid-js'
import { createOnigurumaEngine, loadWasm } from 'shiki/engine/oniguruma'
import { createHighlighterCore, type ThemeRegistration } from 'shiki/core'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

import { htmlCodeSnippet } from './-data/snippets.ts'

const generateCode = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    try {
      await loadWasm(import('shiki/onig.wasm'))

      const highlighter = await createHighlighterCore({
        themes: [import('@shikijs/themes/houston')],
        langs: [import('@shikijs/langs/tsx'), import('@shikijs/langs/html')],

        engine: createOnigurumaEngine(await import('shiki/wasm')),
      })

      const { default: idxTheme } = await import('./-data/theme.json', {
        with: { type: 'json' },
      })

      return highlighter.codeToHtml(htmlCodeSnippet.trimStart(), {
        lang: 'html',
        transformers: [transformerNotationFocus()],
        theme: idxTheme as ThemeRegistration,
      })
    } catch (error) {
      console.info('error in serverfn')
      console.error(error)
    }
  })

export const Route = createFileRoute('/demo')({
  component: RouteComponent,
  loader: () => generateCode(),
})

type MaybePromise<T> = T | Promise<T>

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
            class="size-4.5"
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
            class="size-5 text-green-300"
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
    <main class="border-y-green-400 border-y-[1.5px] pb-6 min-size-max flex items-center overflow-y-auto">
      <div class="mt-20 min-size-max overflow-auto gap-y-4 flex flex-col w-[720px] items-center">
        <h1 class="text-2xl font-black text-center mt-18 sm:mt-12">
          Sandbox Embed Demo
        </h1>
        <div class="relative">
          <div class="absolute top-0 right-0 mt-2 mr-1 size-6">
            <CopyButton onCopy={copyHighlightedSnippet} />
          </div>
          <article
            ref={setCodeElement}
            data-element="iframe-code-block"
            // show a light border on hover
            class="text-sm self-center shrink-0 w-full sm:max-w-2xl max-w-full rounded-sm"
          />
        </div>
        <div class="text-balance shrink-0">
          <p class="mt-4 max-w-3xl text-center">
            Fugiat culpa aute duis velit. Irure velit anim ut ad voluptate minim
            ex excepteur. Deserunt duis ex aliqua exercitation enim occaecat
            pariatur officia nostrud mollit laborum commodo.
          </p>

          <p class="mt-4 max-w-3xl text-center">
            Velit consectetur non sint. In excepteur pariatur excepteur ipsum
            fugiat sunt id dolore sit dolore pariatur laborum in officia. Ex
            sint enim ea qui dolor ullamco labore consequat Lorem exercitation.
            Laborum ut aliquip enim cillum voluptate do ullamco ex culpa ea
            consequat est. Officia nisi laboris quis dolore non nisi duis sint
            enim irure.
          </p>
        </div>
      </div>
    </main>
  )
}
