// @vitest-environment node

import { describe, expect, it } from 'vitest'

import viteConfig from '../../vite.config.js'

describe('Vite development proxy', () => {
  it('proxies MCP browser controls without rewriting their same-origin host', () => {
    expect(viteConfig.server?.proxy?.['/_mcp']).toEqual({
      target: 'http://127.0.0.1:8000',
      changeOrigin: false,
    })
  })

  it('injects the repository changelog without broadening the development file allowlist', () => {
    const changelog = JSON.parse(viteConfig.define.__WEBQUANTUMSAVORY_CHANGELOG__)

    expect(changelog).toContain('# Changelog')
    expect(changelog).toContain('## 1.9.1')
    expect(viteConfig.server?.fs).toBeUndefined()
  })
})
