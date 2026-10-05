import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()

await Promise.all([
  rm(join(root, 'dist'), { recursive: true, force: true }),
  rm(join(root, 'HSSS'), { recursive: true, force: true }),
])

console.log('Cleaned dist and HSSS output before rebuild.')
