import { rmSync } from 'node:fs'

rmSync(new URL('../../public/assets', import.meta.url), { recursive: true, force: true })
