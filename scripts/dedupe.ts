import * as NYPM from 'nypm'

NYPM.dedupeDependencies({
  cwd: process.cwd(),
  packageManager: 'bun',
  recreateLockfile: true,
})
  .then(() => {
    console.log('dependencies deduplicated ▶︎✨')
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => process.exit(0))
