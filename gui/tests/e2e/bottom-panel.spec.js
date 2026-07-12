import { test, expect } from '@playwright/test'

async function mockBackendMetadata(page) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: [] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { background_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
}

async function loadApp(page) {
  await mockBackendMetadata(page)
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function replaceApplicationLogs(page, logs) {
  await page.evaluate(newLogs => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const applicationLogs = setupState?.applicationLogs?.value ?? setupState?.applicationLogs
    if (!Array.isArray(applicationLogs)) {
      throw new Error('Reactive application logs are unavailable')
    }

    applicationLogs.splice(0, applicationLogs.length, ...newLogs)
  }, logs.map((log, index) => ({
    id: `bottom_panel_log_${index}`,
    timestamp: '2025-01-01T00:00:00.000Z',
    message: `Log ${index}`,
    source: 'Test',
    count: 1,
    ...log,
  })))
}

test.describe('Bottom panel log counters', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page)
  })

  test('keeps level counters in the Logs tab and preserves empty-log behavior', async ({ page }) => {
    const panel = page.locator('#logsPanel')
    const panelHeader = panel.locator('.panel-title')
    const logsTab = page.locator('#bottom-panel-logs-tab')

    await expect(panelHeader.locator('.panel-title-text-title')).toHaveText('Tools')
    await expect(panelHeader).not.toContainText('Logs, Variables, and Layout Tools')
    await expect(panelHeader.locator('.log-count-badge')).toHaveCount(0)
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(0)
    await expect(panel.locator('.empty-logs')).toHaveText('No logs available')

    await replaceApplicationLogs(page, [
      { level: 'info', count: 9 },
      { level: 'trace' },
      { level: null },
      { level: 'warning' },
      { level: 'WARN' },
      { level: 'error' },
      { level: 'success' },
      { level: 'debug' },
    ])

    const expectedBadges = [
      { level: 'info', count: 3 },
      { level: 'warning', count: 2 },
      { level: 'error', count: 1 },
      { level: 'success', count: 1 },
      { level: 'debug', count: 1 },
    ]

    await expect(panel.locator('.log-count-badge')).toHaveCount(expectedBadges.length)
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(expectedBadges.length)
    await expect(panelHeader.locator('.log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-variables-tab .log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-layout-tools-tab .log-count-badge')).toHaveCount(0)

    for (const { level, count } of expectedBadges) {
      const badge = logsTab.locator(`.badge-${level}`)
      const accessibleText = `${count} ${level} logs`
      await expect(badge).toHaveText(String(count))
      await expect(badge).toHaveAttribute('aria-label', accessibleText)
      await expect(badge).toHaveAttribute('title', accessibleText)
      await expect(badge).toHaveClass(new RegExp(`\\bbadge-${level}\\b`))
    }

    await panel.getByRole('button', { name: 'Clear' }).click()
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(0)
    await expect(panel.locator('.empty-logs')).toHaveText('No logs available')
  })

  test('retains roving focus and keyboard tab selection', async ({ page }) => {
    const logsTab = page.locator('#bottom-panel-logs-tab')
    const variablesTab = page.locator('#bottom-panel-variables-tab')
    const layoutToolsTab = page.locator('#bottom-panel-layout-tools-tab')

    await expect(logsTab).toHaveAttribute('aria-selected', 'true')
    await expect(logsTab).toHaveAttribute('tabindex', '0')
    await expect(variablesTab).toHaveAttribute('tabindex', '-1')
    await expect(layoutToolsTab).toHaveAttribute('tabindex', '-1')

    await logsTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(variablesTab).toBeFocused()
    await expect(variablesTab).toHaveAttribute('aria-selected', 'true')
    await expect(variablesTab).toHaveAttribute('tabindex', '0')
    await expect(page.locator('#bottom-panel-variables-content')).toBeVisible()

    await page.keyboard.press('End')
    await expect(layoutToolsTab).toBeFocused()
    await expect(layoutToolsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#bottom-panel-layout-tools-content')).toBeVisible()

    await page.keyboard.press('Home')
    await expect(logsTab).toBeFocused()
    await expect(logsTab).toHaveAttribute('aria-selected', 'true')
    await expect(logsTab).toHaveAttribute('tabindex', '0')
    await expect(page.locator('#bottom-panel-logs-content')).toBeVisible()

    await page.keyboard.press('ArrowLeft')
    await expect(layoutToolsTab).toBeFocused()
    await expect(layoutToolsTab).toHaveAttribute('aria-selected', 'true')
  })
})
