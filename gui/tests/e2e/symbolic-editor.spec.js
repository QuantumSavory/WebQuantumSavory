import { test, expect } from '@playwright/test'

const SYMBOLIC_PROTOCOL_TYPE = {
  type: 'TestProtocols.SymbolicProt',
  doc: 'Protocol used to exercise symbolic parameter editing.',
  group: 'node',
  virtual: null,
  parameters: [{
    field: 'observable',
    type: 'Symbolic',
    doc: 'A symbolic observable.',
  }],
}

async function mockConfiguration(page) {
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
    json: { protocol_types: [SYMBOLIC_PROTOCOL_TYPE] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: true },
    },
  }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    json: { success: false, message: 'Simulation not found' },
  }))
  await page.route('**/test_symbolic_expression', route => {
    const { expr } = route.request().postDataJSON()
    if (expr === 'valid_untrusted_expression') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          results: { value: expr, latex: '$\\href{javascript:alert(1)}{x}$' },
        },
      })
    }

    if (expr.startsWith('valid')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          results: { value: expr, latex: '$x^{2}$' },
        },
      })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: false, error: 'Invalid symbolic expression' },
    })
  })
}

async function loadApp(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  const platformInfoLoaded = page.waitForResponse(
    response => response.url().endsWith('/platform_info') && response.ok(),
  )
  await page.goto('/')
  await Promise.all([protocolTypesLoaded, platformInfoLoaded])
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProjectWithSymbolicProtocol(page) {
  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill('Symbolic Editor Test')
  await page.locator('button.primary').click()

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 450, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.evaluate(() => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const node = setupState?.projectData?.net?.nodes?.[0]
    if (!node) throw new Error('Reactive node state is unavailable')

    node.data.protocols.push({
      id: 'protocol_symbolic_editor',
      type: 'TestProtocols.SymbolicProt',
      parameters: [{
        name: 'observable',
        type: 'Symbolic',
        value: null,
      }],
    })
  })

  await page.locator('.node-marker').click()
  const editor = page.locator('#nodePanel .protocol-editor', { hasText: 'SymbolicProt' })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.locator('.protocol-container')).toBeVisible()
  return editor
}

test.describe('Symbolic editor lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
  })

  test('starts compact in a protocol, stays open on failure, and collapses on success', async ({ page }) => {
    const protocolEditor = await createProjectWithSymbolicProtocol(page)
    const valueEditor = protocolEditor.locator('.code-editor-with-symbols')
    const initialValue = valueEditor.getByTestId('symbolic-collapsed-view')

    await expect(initialValue).toBeVisible()
    await expect(initialValue).toHaveText('default')
    await expect(initialValue).toHaveAttribute('aria-label', 'Enter symbolic expression')
    await expect(valueEditor.locator('textarea')).toHaveCount(0)

    await initialValue.click()
    const input = valueEditor.locator('textarea')
    await expect(input).toBeVisible()
    await input.fill('invalid(')
    await valueEditor.locator('.validate-button').click()

    await expect(valueEditor.locator('.function-error-badge')).toContainText('Error!')
    await expect(input).toBeVisible()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view')).toHaveCount(0)

    await input.fill('valid_protocol_expression')
    await valueEditor.locator('.validate-button').click()

    const renderedResult = valueEditor.getByTestId('symbolic-collapsed-view')
    await expect(renderedResult).toBeVisible()
    await expect(renderedResult).toHaveAttribute('aria-label', 'Edit symbolic expression')
    await expect(renderedResult.locator('.katex')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveCount(0)
    await expect(valueEditor.locator('.validate-button')).toHaveCount(0)

    await renderedResult.click()
    await expect(valueEditor.locator('textarea')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveValue('valid_protocol_expression')

    await valueEditor.locator('textarea').fill('valid_untrusted_expression')
    await valueEditor.locator('.validate-button').click()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view').locator('.katex')).toBeVisible()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view').locator('a')).toHaveCount(0)
  })

  test('starts open for a new Symbolic variable and collapses after validation', async ({ page }) => {
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    await variableRow.locator('.variable-type-select').selectOption('Symbolic')
    const valueEditor = variableRow.locator('.code-editor-with-symbols')
    const input = valueEditor.locator('textarea')

    await expect(input).toBeVisible()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view')).toHaveCount(0)
    await input.fill('valid_variable_expression')
    await valueEditor.locator('.validate-button').click()

    const renderedResult = valueEditor.getByTestId('symbolic-collapsed-view')
    await expect(renderedResult).toBeVisible()
    await expect(renderedResult.locator('.katex')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveCount(0)

    await renderedResult.click()
    await expect(valueEditor.locator('textarea')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveValue('valid_variable_expression')
  })
})
