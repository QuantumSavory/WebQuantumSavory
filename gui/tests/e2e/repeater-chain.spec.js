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
  await page.route('**/destroy_simulation', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true },
  }))
  await page.route('**/get_state**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: false, error_code: 'NOT_FOUND' },
  }))
  await page.route('**/logs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, logs: [], count: 0 },
  }))
}

async function createProjectWithNodes(page, projectName, count = 3) {
  await mockBackendMetadata(page)
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.click('.hamburger-btn')
  await page.click('text=New')
  await page.fill('input[placeholder="Project name"]', projectName)
  await page.click('button.primary')

  for (let index = 0; index < count; index += 1) {
    await page.keyboard.down('Alt')
    await page.click('canvas', {
      position: { x: 350 + (index * 180), y: 250 + (index * 70) },
    })
    await page.keyboard.up('Alt')
    await expect(page.locator('.node-marker')).toHaveCount(index + 1)
  }
}

async function connectNodes(page, sourceIndex, targetIndex, virtual = false) {
  const source = page.locator('.node-marker').nth(sourceIndex)
  const target = page.locator('.node-marker').nth(targetIndex)
  await source.hover()
  if (virtual) await page.keyboard.down('Shift')
  await source.locator('.connector.output').dragTo(target)
  if (virtual) await page.keyboard.up('Shift')
}

async function openGenerator(page) {
  const layoutTab = page.getByRole('tab', { name: 'Layout Tools' })
  await layoutTab.click()
  const helper = page.getByRole('button', { name: 'Repeater Chain Generator' })
  await helper.click()
  await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toBeVisible()
}

async function fillGenerator(page, {
  start = 'Node 1',
  end = 'Node 2',
  template = 'Node 3',
  count = 3,
} = {}) {
  await page.locator('#chain-start-node').selectOption({ label: start })
  await page.locator('#chain-end-node').selectOption({ label: end })
  await page.locator('#chain-template-node').selectOption({ label: template })
  await page.locator('#chain-template-edge').selectOption({ index: 1 })
  await page.locator('#chain-repeater-count').fill(String(count))
}

test.describe('Layout Tools repeater chain generator', () => {
  test('shows contextual docs and rejects a repeater node with extra incident edges', async ({ page }) => {
    await createProjectWithNodes(page, 'Repeater Validation')
    await connectNodes(page, 2, 0)
    await connectNodes(page, 2, 1)
    await expect(page.locator('.edge-list-item')).toHaveCount(2)

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await expect(page.getByRole('heading', { name: 'Layout controls' })).toBeVisible()
    await expect(page.getByText('Alt-click the map to add a node.')).toBeVisible()

    const helper = page.getByRole('button', { name: 'Repeater Chain Generator' })
    await helper.hover()
    await expect(page.getByRole('heading', { name: 'Repeater Chain Generator' })).toBeVisible()
    await expect(page.getByText('Create an evenly spaced chain')).toBeVisible()
    await page.getByRole('heading', { name: 'Helpers' }).hover()
    await expect(page.getByRole('heading', { name: 'Layout controls' })).toBeVisible()

    await openGenerator(page)
    await fillGenerator(page)
    await expect(page.getByRole('alert')).toContainText('must have exactly one incident edge')
    await expect(page.getByRole('button', { name: 'Generate Chain' })).toBeDisabled()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toHaveCount(0)
    await expect(page.locator('.node-marker')).toHaveCount(3)
    await expect(page.locator('.edge-list-item')).toHaveCount(2)

    await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      app._instance.setupState.simulationState.cumulativeTargetTime = 1
    })
    await expect(helper).toBeDisabled()
    await expect(page.getByText('Layout helpers are unavailable after a simulation has started.')).toBeVisible()
  })

  test('clones a configured virtual template into an evenly spaced persistent chain', async ({ page }) => {
    const projectName = 'Repeater Generation'
    await createProjectWithNodes(page, projectName)
    await connectNodes(page, 2, 0, true)
    await expect(page.locator('.edge-list-item')).toHaveCount(1)

    const templateIds = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const templateNode = projectData.net.nodes.find(node => node.name === 'Node 3')
      const templateEdge = projectData.net.edges[0]

      templateNode.data.customConfiguration = { nested: { value: 42 } }
      templateNode.data.slots.push({
        id: 'slot_template',
        type: 'Qubit',
        backgroundNoise: { type: 'custom', parameters: [{ value: 0.25 }] },
        assignment: false,
        isLocked: false,
      })
      templateNode.data.protocols.push({
        id: 'protocol_node_template',
        type: 'TestNodeProtocol',
        parameters: [{ name: 'rounds', type: 'Int64', value: 7 }],
      })
      templateEdge.data.customConfiguration = { fidelity: 0.91 }
      templateEdge.data.protocols.push({
        id: 'protocol_edge_template',
        type: 'TestEdgeProtocol',
        parameters: [{ name: 'attempts', type: 'Int64', value: 5 }],
      })

      return { nodeId: templateNode.id, edgeId: templateEdge.id }
    })

    await openGenerator(page)
    await fillGenerator(page, { count: 3 })
    await page.getByRole('button', { name: 'Generate Chain' }).click()
    await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toHaveCount(0)

    await expect(page.locator('.node-marker')).toHaveCount(5)
    await expect(page.locator('.edge-list-item')).toHaveCount(4)

    const generated = await page.evaluate(({ templateIds }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      const repeaters = nodes.filter(node => node.name.startsWith('Node 3-'))

      return {
        nodeNames: repeaters.map(node => node.name),
        positions: repeaters.map(node => [...node.position]),
        startPosition: [...nodes.find(node => node.name === 'Node 1').position],
        endPosition: [...nodes.find(node => node.name === 'Node 2').position],
        connections: edges.map(edge => [edge.source.name, edge.target.name]),
        allVirtual: edges.every(edge => edge.isLogic === true),
        templateNodeRemoved: !nodes.some(node => node.id === templateIds.nodeId),
        templateEdgeRemoved: !edges.some(edge => edge.id === templateIds.edgeId),
        nodeIds: repeaters.map(node => node.id),
        slotIds: repeaters.map(node => node.data.slots[0].id),
        nodeProtocolIds: repeaters.map(node => node.data.protocols[0].id),
        edgeIds: edges.map(edge => edge.id),
        edgeProtocolIds: edges.map(edge => edge.data.protocols[0].id),
        nodeConfigurationCopied: repeaters.every(node =>
          node.data.customConfiguration.nested.value === 42
          && node.data.slots[0].backgroundNoise.parameters[0].value === 0.25
          && node.data.protocols[0].parameters[0].value === 7
        ),
        edgeConfigurationCopied: edges.every(edge =>
          edge.data.customConfiguration.fidelity === 0.91
          && edge.data.protocols[0].parameters[0].value === 5
        ),
        independentNodeData: repeaters[0].data !== repeaters[1].data
          && repeaters[0].data.customConfiguration !== repeaters[1].data.customConfiguration,
        independentEdgeData: edges[0].data !== edges[1].data
          && edges[0].data.customConfiguration !== edges[1].data.customConfiguration,
      }
    }, { templateIds })

    expect(generated.nodeNames).toEqual(['Node 3-1', 'Node 3-2', 'Node 3-3'])
    for (let index = 0; index < generated.positions.length; index += 1) {
      const fraction = (index + 1) / 4
      expect(generated.positions[index][0]).toBeCloseTo(
        generated.startPosition[0] + ((generated.endPosition[0] - generated.startPosition[0]) * fraction),
      )
      expect(generated.positions[index][1]).toBeCloseTo(
        generated.startPosition[1] + ((generated.endPosition[1] - generated.startPosition[1]) * fraction),
      )
    }
    expect(generated.connections).toEqual([
      ['Node 1', 'Node 3-1'],
      ['Node 3-1', 'Node 3-2'],
      ['Node 3-2', 'Node 3-3'],
      ['Node 3-3', 'Node 2'],
    ])
    expect(generated.allVirtual).toBe(true)
    expect(generated.templateNodeRemoved).toBe(true)
    expect(generated.templateEdgeRemoved).toBe(true)
    expect(generated.nodeConfigurationCopied).toBe(true)
    expect(generated.edgeConfigurationCopied).toBe(true)
    expect(generated.independentNodeData).toBe(true)
    expect(generated.independentEdgeData).toBe(true)

    for (const ids of [
      generated.nodeIds,
      generated.slotIds,
      generated.nodeProtocolIds,
      generated.edgeIds,
      generated.edgeProtocolIds,
    ]) {
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(generated.slotIds).not.toContain('slot_template')
    expect(generated.nodeProtocolIds).not.toContain('protocol_node_template')
    expect(generated.edgeProtocolIds).not.toContain('protocol_edge_template')

    await page.click('.hamburger-btn')
    await page.getByText('Save', { exact: true }).click()
    await page.evaluate(name => localStorage.setItem('recentProjectName', name), projectName)
    await page.reload()
    await expect(page.locator('.node-marker')).toHaveCount(5, { timeout: 15_000 })
    await expect(page.locator('.edge-list-item')).toHaveCount(4)
    await expect(page.locator('.node-marker .node-name')).toHaveText([
      'Node 1',
      'Node 2',
      'Node 3-1',
      'Node 3-2',
      'Node 3-3',
    ])
  })
})
