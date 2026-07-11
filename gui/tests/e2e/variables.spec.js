import { test, expect } from '@playwright/test'

const EDGE_PROTOCOL_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Generate entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'rounds',
    type: 'Int64',
    doc: 'Number of entanglement attempts.',
  }],
}

async function mockConfiguration(page) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: ['minimum', 'maximum', 'abs', 'identity'] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { background_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [EDGE_PROTOCOL_TYPE] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    json: { success: false, message: 'Simulation not found' },
  }))
}

async function loadApp(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProjectWithEdgeProtocol(page) {
  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill('Variables Test Project')
  await page.locator('button.primary').click()

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 400, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 600, y: 400 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toHaveCount(1)

  await page.evaluate(() => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const projectData = setupState?.projectData
    if (!projectData?.net?.edges?.[0]) {
      throw new Error('Reactive project state is unavailable')
    }

    projectData.net.edges[0].data.protocols.push({
      id: 'protocol_variables_edge',
      type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
      parameters: [{
        name: 'rounds',
        type: 'Int64',
        value: null,
      }],
    })
  })
}

function parameterRow(editor, name) {
  return editor.locator('.param-item').filter({ hasText: name })
}

async function setCumulativeTargetTime(page, value) {
  await page.evaluate(targetTime => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const simulationState = setupState?.simulationState?.value ?? setupState?.simulationState
    if (!simulationState) throw new Error('Simulation state is unavailable')
    simulationState.cumulativeTargetTime = targetTime
  }, value)
}

test.describe('Global protocol variables', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
  })

  test('persists, links, renames, protects, and locks a numeric variable', async ({ page }) => {
    await createProjectWithEdgeProtocol(page)

    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await expect(variablesPanel).toBeVisible()
    await expect(variablesPanel.locator('.empty-variables')).toHaveText('No variables')

    const addVariableButton = variablesPanel.getByRole('button', { name: 'Add Variable' })
    await addVariableButton.click()

    const variableRow = variablesPanel.locator('.variable-row')
    await expect(variableRow).toHaveCount(1)
    const variableId = await variableRow.getAttribute('data-variable-id')
    expect(variableId).toMatch(/^variable_/)

    const nameInput = variableRow.locator('.variable-name-input')
    const typeSelect = variableRow.locator('.variable-type-select')
    const valueInput = variableRow.locator('.variable-value-input input[type="number"]')
    const deleteButton = variableRow.locator('.delete-variable-button')

    await nameInput.fill('max_rounds')
    await typeSelect.selectOption('Int64')
    await valueInput.fill('7')
    await expect(nameInput).toHaveValue('max_rounds')
    await expect(typeSelect).toHaveValue('Int64')
    await expect(valueInput).toHaveValue('7')

    await page.locator('.edge-list-item').first().click()
    const editor = page.locator('#edgePanel .protocol-editor', { hasText: 'EntanglerProt' })
    await expect(editor).toBeVisible()
    await editor.locator('.protocol-list-type').click()

    const roundsRow = parameterRow(editor, 'rounds')
    const bindingButton = roundsRow.getByRole('button', { name: 'Set rounds from a variable' })
    await expect(bindingButton).toBeEnabled()
    await bindingButton.click()

    const variableSelector = roundsRow.getByRole('combobox', { name: 'Variable for rounds' })
    await expect(variableSelector).toHaveValue(variableId)
    await expect(deleteButton).toBeDisabled()
    await expect(deleteButton).toHaveAttribute(
      'title',
      'Unlink this variable from protocol parameters before deleting it',
    )

    await nameInput.fill('retry_rounds')
    await expect(variableSelector.locator(`option[value="${variableId}"]`)).toHaveText(
      'retry_rounds (Int64)',
    )

    const serialized = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const minimized = setupState?.minimizedProjectData?.value ?? setupState?.minimizedProjectData
      const full = setupState?.serializeProjectData?.()
      if (!full || !minimized) throw new Error('Serialized project state is unavailable')

      const normalizedFull = JSON.parse(JSON.stringify(full))
      const normalizedMinimized = JSON.parse(JSON.stringify(minimized))
      return {
        fullVariable: normalizedFull.variables[0],
        minimizedVariable: normalizedMinimized.variables[0],
        fullParameter: normalizedFull.net.edges[0].data.protocols[0].parameters[0],
        minimizedParameter: normalizedMinimized.net.edges[0].data.protocols[0].parameters[0],
      }
    })

    const expectedVariable = {
      id: variableId,
      name: 'retry_rounds',
      type: 'Int64',
      value: 7,
    }
    const expectedParameter = {
      name: 'rounds',
      type: 'Int64',
      value: { kind: 'variable', id: variableId },
    }
    expect(serialized.fullVariable).toEqual(expectedVariable)
    expect(serialized.minimizedVariable).toEqual(expectedVariable)
    expect(serialized.fullParameter).toEqual(expectedParameter)
    expect(serialized.minimizedParameter).toEqual(expectedParameter)

    await setCumulativeTargetTime(page, 1)
    await expect(addVariableButton).toBeDisabled()
    await expect(nameInput).toBeDisabled()
    await expect(typeSelect).toBeDisabled()
    await expect(valueInput).toBeDisabled()
    await expect(variableSelector).toBeDisabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeDisabled()

    await setCumulativeTargetTime(page, 0)
    await expect(addVariableButton).toBeEnabled()
    await expect(nameInput).toBeEnabled()
    await expect(typeSelect).toBeEnabled()
    await expect(valueInput).toBeEnabled()
    await expect(variableSelector).toBeEnabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeEnabled()
    await expect(deleteButton).toBeDisabled()
  })

  test('defaults legacy project data without variables to an empty list', async ({ page }) => {
    const variables = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      if (typeof setupState?.deserializeProjectData !== 'function') {
        throw new Error('Project deserializer is unavailable')
      }

      const project = setupState.deserializeProjectData({
        name: 'Legacy Project',
        simulationConfig: { time: 1, timeStep: 0.1 },
        net: { nodes: [], edges: [], protocols: [] },
      })
      return JSON.parse(JSON.stringify(project.variables))
    })

    expect(variables).toEqual([])
  })

  test('offers the same supported value forms as protocol parameters', async ({ page }) => {
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    const typeSelect = variableRow.locator('.variable-type-select')
    await expect(typeSelect.locator('option')).toHaveText([
      'Default',
      'Int64',
      'Float64',
      'Bool',
      'String',
      'Predefined function',
      'Custom function',
      'Symbolic',
      'QuantumSavory.Wildcard',
      'Vector{Int64}',
      'Vector{Float64}',
      'Nothing',
    ])

    await typeSelect.selectOption('Bool')
    await expect(variableRow.locator('input[type="checkbox"]')).toBeVisible()

    await typeSelect.selectOption('Function')
    await expect(variableRow.locator('.functionSelector')).toBeVisible()
    await expect(variableRow.locator('.functionSelector option[value="identity"]')).toBeEnabled()

    await typeSelect.selectOption('Lambda')
    await expect(variableRow.locator('.code-editor-with-symbols')).toBeVisible()

    await typeSelect.selectOption('Symbolic')
    await expect(variableRow.locator('.code-editor-with-symbols')).toBeVisible()

    await typeSelect.selectOption('QuantumSavory.Wildcard')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Wildcard')

    await typeSelect.selectOption('default')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Use protocol default')

    await typeSelect.selectOption('Vector{Int64}')
    await expect(variableRow.locator('.variable-value-input input[type="text"]')).toBeVisible()

    await typeSelect.selectOption('Nothing')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Nothing')
  })
})
