import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { timeout } from 'hono/timeout'
import { requestId } from 'hono/request-id'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { getConnInfo } from 'hono/cloudflare-workers'

import wranglerJSON from '#wrangler.json'

export const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use('*', timeout(4_000))
app.use(prettyJSON({ space: 2 }))
app.use('*', requestId({ headerName: `${wranglerJSON.name}-Request-Id` }))
app.use('*', async (context, next) => {
  if (context.env.LOGGING === 'verbose') showRoutes(app, { verbose: true })
  await next()
})

app.onError((error, context) => {
  const { remote } = getConnInfo(context)
  const requestId = context.get('requestId')
  const addressSegment =
    context.env.ENVIRONMENT !== 'production'
      ? undefined
      : `-[${remote.address}]`
  console.error(
    [
      `[${requestId}]`,
      addressSegment,
      `-[${context.req.url}]:\n`,
      `${error.message}`,
    ].join(''),
  )
  if (error instanceof HTTPException) return error.getResponse()
  return context.json({ remote, error: error.message, requestId }, 500)
})

app.notFound(context => {
  throw new HTTPException(404, {
    cause: context.error,
    message: `${context.req.url} is not a valid path.`,
  })
})
