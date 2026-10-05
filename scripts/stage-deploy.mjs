import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const target = join(root, 'HSSS')
const apiTarget = join(target, 'api')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(join(root, 'dist'), target, { recursive: true })
await cp(join(root, 'ridex-welcome.html'), join(target, 'ridex-welcome.html'))
await cp(join(root, 'ridex-logo.svg'), join(target, 'ridex-logo.svg'))
await cp(join(root, 'ridex-favicon.svg'), join(target, 'ridex-favicon.svg'))
await cp(join(root, '1f23dbd0-ae98-43ec-a140-beeb6500f252.png'), join(target, '1f23dbd0-ae98-43ec-a140-beeb6500f252.png'))
await cp(join(root, '.htaccess'), join(target, '.htaccess'))
await cp(join(root, 'robots.txt'), join(target, 'robots.txt'))
await cp(join(root, 'sitemap.xml'), join(target, 'sitemap.xml'))
await mkdir(apiTarget, { recursive: true })

const apiFiles = ['.htaccess', 'config.php', 'helpers.php', 'index.php']
for (const file of apiFiles) await cp(join(root, 'api', file), join(apiTarget, file))
await cp(join(root, 'api', 'routes'), join(apiTarget, 'routes'), { recursive: true })
await cp(join(root, 'api', 'migrations'), join(apiTarget, 'migrations'), { recursive: true })
await mkdir(join(apiTarget, 'uploads'), { recursive: true, mode: 0o755 })

console.log('HSSS deployment package created from dist and runtime API files.')
