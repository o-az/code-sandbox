import { createStart } from '@tanstack/solid-start'

export const startInstance = createStart(() => ({
  defaultSsr: true, // default is true
}))
