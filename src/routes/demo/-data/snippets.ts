export const htmlCodeSnippet = /* html */ `
<script type="module">
  const command = 'npx --yes cowsay@latest "mooo"'

  const iframeElement = document.querySelector('iframe#sandbox')
  const params = new URLSearchParams({
    embed: 'true',
    cmd: command,
  })
  const url = new URL('https://sandbox.evm.workers.dev')
  url.search = params.toString()

  Object.assign(iframeElement, { src: url.toString() })

  iframeElement.addEventListener('load', () => {
    iframeElement.contentWindow.postMessage({ type: 'execute' }, '*')
  })
</script>

<iframe
  width="100%"
  id="sandbox"
  height="100%"
  title="Sandbox"
/>
`

export const reactCodeSnippet = /* tsx */ `
import * as React from 'react'

export function Sandbox(props: {
  url?: string | undefined
  command: string
}) {
  const { url, command } = props

  const id = React.useId()


  const [didRun, setDidRun] = React.useState(false)

  const handleRun = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const iframe = document.querySelector(\`iframe#\${id}-iframe\`)
      if (!iframe) return
      iframe.contentWindow?.postMessage({ type: 'execute' }, '*')
      setDidRun(true)
    },
    [id],
  )

  const reloadSandbox = React.useCallback(() => {
    const iframe = document.querySelector(\`iframe#\${id}-iframe\`)
    if (!iframe) return
    Object.assign(iframe, { src: iframe.src })
    setDidRun(false)
  }, [id])

  return (
    <article>
      <button
        type="button"
        onClick={didRun ? reloadSandbox : handleRun}
      >
        {didRun ? (
          <span>🔄</span>
        ) : (
          <span>▶︎</span>
        )}
      </button>
      <iframe // [!code focus]
        src={\`\${Url}?embed=true&cmd=\${encodeURIComponent(Command)}\`} // [!code focus]
        title="Sandbox" // [!code focus]
        id={\`\${id}-iframe\`} // [!code focus]
        width="100%" // [!code focus]
        height="100%" // [!code focus]
      />
    </article>
  )
}`

export const snippets = {
  html: htmlCodeSnippet,
  react: reactCodeSnippet,
}
