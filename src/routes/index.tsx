import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  loader: () => 'foo',
  component: Page,
})

function Page() {
  const data = Route.useLoaderData()

  return (
    <main class="flex flex-col items-center justify-center h-screen">
      <h1>Hello {data()}</h1>
    </main>
  )
}
