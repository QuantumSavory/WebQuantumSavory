import { expect, test } from '@playwright/test'

async function mockBackendMetadata(page) {
  await page.route('**/known_functions', route => route.fulfill({
    json: { known_functions: [] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    json: { background_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    json: { protocol_types: [] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    json: { states_zoo_types: [] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
}

async function createTwoNodeProject(page) {
  await mockBackendMetadata(page)
  await page.goto('/')
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })

  await page.keyboard.down('Alt')
  await canvas.click({ position: { x: 400, y: 300 } })
  await canvas.click({ position: { x: 650, y: 400 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  const secondNode = page.locator('.node-marker').nth(1)
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(secondNode)
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
  return { canvas, firstNode, secondNode }
}

test('edits physical curves and overrides while keeping virtual links nonphysical', async ({ page }) => {
  const { canvas, firstNode, secondNode } = await createTwoNodeProject(page)

  await expect(page.locator('.edge-badge-distance')).toHaveCount(1)
  await expect(page.locator('.edge-badge-delay')).toHaveCount(1)
  await page.locator('.edge-list-item').first().click()
  await expect(page.getByText('PHYSICAL PROPAGATION', { exact: true })).toBeVisible()

  await page.locator('#bottom-panel-layout-tools-tab').click()
  await page.locator('#curve-editing-enabled').check()
  await canvas.click({ position: { x: 525, y: 350 } })
  const handle = page.locator('.curve-point-handle')
  await expect(handle).toHaveCount(1)
  await expect(handle).toHaveClass(/curve-point-smooth/)
  await handle.click()
  await expect(handle).toHaveClass(/curve-point-sharp/)
  await handle.click()
  await expect(handle).toHaveCount(0)

  const delayInput = page.locator('#edge-delay-seconds')
  await delayInput.fill('0.25')
  await delayInput.press('Tab')
  await expect(page.locator('#edge-distance-meters')).toHaveText('n/a')
  await expect(page.locator('#edge-refractive-index')).toHaveText('n/a')
  await expect(page.locator('.edge-badge-distance')).toHaveCount(0)
  await expect(page.locator('.edge-badge-delay')).toHaveText('250 ms')

  await page.getByRole('button', { name: 'Reset propagation delay to automatic' }).click()
  await expect(page.locator('.edge-badge-distance')).toHaveCount(1)
  await page.locator('#physical-badges-visible').uncheck()
  await expect(page.locator('.edge-badge-stack')).toHaveCount(0)
  await page.locator('#physical-badges-visible').check()

  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(secondNode)
  const duplicateDialog = page.getByRole('dialog', { name: 'Duplicate physical edge' })
  await expect(duplicateDialog).toContainText('Only one physical edge may connect a pair of nodes.')
  await duplicateDialog.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.edge-list-item')).toHaveCount(1)

  await firstNode.hover()
  await page.keyboard.down('Shift')
  await firstNode.locator('.connector.output').dragTo(secondNode)
  await page.keyboard.up('Shift')
  await expect(page.locator('.edge-list-item')).toHaveCount(2)
  await page.locator('.edge-list-item').nth(1).click()
  await expect(page.getByText('PHYSICAL PROPAGATION', { exact: true })).toHaveCount(0)
  await expect(page.locator('.curve-point-handle')).toHaveCount(0)
  await expect(page.locator('.edge-badge-stack')).toHaveCount(1)
})
