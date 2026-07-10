import { test, expect } from '@playwright/test'

const KNOWN_FUNCTIONS = [
  'minimum',
  'maximum',
  'abs',
  'identity',
  '<(self)',
  '>(self)',
  '≤(self)',
  '≥(self)',
  '==(self)',
]

const SELF_FUNCTIONS = KNOWN_FUNCTIONS.filter(name => name.endsWith('(self)'))

const SWAPPER_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.SwapperProt',
  doc: 'Swap entanglement at a node.',
  group: 'node',
  virtual: null,
  parameters: [
    {
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Remote low node, a predicate, or a wildcard.',
    },
    {
      field: 'nodeH',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Remote high node, a predicate, or a wildcard.',
    },
  ],
}

const ENTANGLER_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Generate entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'chooseslotA',
    type: ['Int64', 'Function'],
    doc: 'Select a slot in node A by index or predicate.',
  }],
}

async function mockConfiguration(page) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: KNOWN_FUNCTIONS },
  }))
  await page.route('**/background_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { background_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [SWAPPER_TYPE, ENTANGLER_TYPE] },
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

async function createProjectWithEdge(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill('Protocol Parameter Options')
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
    if (!projectData?.net?.nodes?.[0] || !projectData.net.edges?.[0]) {
      throw new Error('Reactive project state is unavailable')
    }

    projectData.net.nodes[0].data.protocols.push({
      id: 'protocol_swapper_parameter_options',
      type: 'QuantumSavory.ProtocolZoo.SwapperProt',
      parameters: [
        {
          name: 'nodeL',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
        },
        {
          name: 'nodeH',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
        },
      ],
    })
    projectData.net.edges[0].data.protocols.push({
      id: 'protocol_entangler_parameter_options',
      type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
      parameters: [{
        name: 'chooseslotA',
        type: ['Int64', 'Function'],
      }],
    })
  })
}

function parameterRow(editor, name) {
  return editor.locator('.param-item').filter({ hasText: name })
}

async function openProtocolEditor(panel, protocolName) {
  const editor = panel.locator('.protocol-editor', { hasText: protocolName })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.locator('.protocol-container')).toBeVisible()
  return editor
}

test.describe('Protocol parameter options', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await createProjectWithEdge(page)
  })

  test('supports Wildcard and self predicates for node protocols only', async ({ page }) => {
    await page.locator('.node-marker').first().click()
    const swapperEditor = await openProtocolEditor(page.locator('#nodePanel'), 'SwapperProt')
    const nodeLRow = parameterRow(swapperEditor, 'nodeL')
    const nodeLTypeSelector = nodeLRow.locator('.complexTypeSelector')

    await expect(nodeLTypeSelector.locator('option[value="QuantumSavory.Wildcard"]')).toBeEnabled()
    await nodeLTypeSelector.selectOption('Function')

    const nodeFunctionSelector = nodeLRow.locator('.functionSelector')
    await expect(nodeFunctionSelector).toBeVisible()
    for (const name of KNOWN_FUNCTIONS) {
      await expect(nodeFunctionSelector.locator(`option[value="${name}"]`)).toBeEnabled()
    }

    await nodeLTypeSelector.selectOption('QuantumSavory.Wildcard')
    await expect(nodeLRow.locator('.param-value')).toHaveText('Wildcard')
    await expect(nodeLRow.locator('.param-value input, .param-value select')).toHaveCount(0)

    const serializedParameter = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const minimized = setupState?.minimizedProjectData
      const payload = minimized?.value ?? minimized
      return payload?.net?.nodes?.[0]?.data?.protocols?.[0]?.parameters?.find(
        parameter => parameter.name === 'nodeL',
      )
    })
    expect(serializedParameter).toEqual({
      name: 'nodeL',
      type: 'QuantumSavory.Wildcard',
      value: 'Wildcard',
    })

    await nodeLTypeSelector.selectOption('Int64')
    await expect(nodeLRow.locator('input[type="number"]')).toHaveValue('')

    await page.locator('.edge-list-item').first().click()
    const entanglerEditor = await openProtocolEditor(page.locator('#edgePanel'), 'EntanglerProt')
    const chooseslotRow = parameterRow(entanglerEditor, 'chooseslotA')
    await chooseslotRow.locator('.complexTypeSelector').selectOption('Function')

    const edgeFunctionSelector = chooseslotRow.locator('.functionSelector')
    for (const name of ['minimum', 'maximum', 'abs', 'identity']) {
      await expect(edgeFunctionSelector.locator(`option[value="${name}"]`)).toBeEnabled()
    }
    for (const name of SELF_FUNCTIONS) {
      await expect(edgeFunctionSelector.locator(`option[value="${name}"]`)).toHaveCount(0)
    }
  })
})
