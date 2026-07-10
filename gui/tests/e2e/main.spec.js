// Test edge creation workflow - Sequential tests that depend on each other
import { test, expect } from '@playwright/test';

// Use test.describe.serial() to ensure tests run sequentially and share the same page context
test.describe.serial('Main Workflow', () => {
  
  // Shared page instance that persists across all tests
  let sharedPage;
  
  // Shared setup that runs once before all tests
  test.beforeAll(async ({ browser }) => {
    // Create a page that will be shared across all tests
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    sharedPage = await context.newPage();
    
    // Load app and set up
    await sharedPage.goto('/');
    await expect(sharedPage.locator('#app')).toBeVisible();
    
    // Also try to set the browser window size via JavaScript
    await sharedPage.evaluate(() => {
      window.resizeTo(1920, 1080);
    });
    
    // Wait a moment for the resize to take effect
    await sharedPage.waitForTimeout(500);
    
    // Wait for map to load
    const mapCanvas = sharedPage.locator('canvas').first();
    await expect(mapCanvas).toBeVisible({ timeout: 15000 });
  });

  // Clean up shared page after all tests
  test.afterAll(async () => {
    if (sharedPage) {
      await sharedPage.close();
    }
  });

  // Test 1: Initial Setup and Project Creation
  test('setup app and create project', async () => {
    // Use sharedPage instead of the page fixture
    const page = sharedPage;

    // Create new project
    await page.click('.hamburger-btn');
    await page.click('text=New');
    await expect(page.locator('.modal-dialog')).toBeVisible();
    await page.fill('input[placeholder="Project name"]', 'Edge Test Project');
    await page.click('button.primary');
    await expect(page.locator('.modal-dialog')).not.toBeVisible();
    
    // Wait for project to be fully initialized
    await page.waitForTimeout(1000);
    await expect(page.locator('.project-name-label')).toContainText('Edge Test Project');

    // Current QuantumSavory may expose no floating protocol types.
    const floatingProtocolsPanel = page.locator('#floatingProtocolsPanel');
    if (await floatingProtocolsPanel.count()) {
      await expect(floatingProtocolsPanel).toBeVisible();
    }
  });

  // Test 2: Create Nodes
  test('create nodes', async () => {
    const page = sharedPage;
    // Add first node using alt+click
    await page.keyboard.down('Alt');
    await page.click('canvas', { position: { x: 400, y: 300 } });
    await page.keyboard.up('Alt');
    
    // Wait for first node to be created
    await expect(page.locator('.node-marker')).toBeVisible();
    await expect(page.locator('.node-list-item')).toBeVisible();

    // Add second node using alt+click at different position
    await page.keyboard.down('Alt');
    await page.click('canvas', { position: { x: 600, y: 400 } });
    await page.keyboard.up('Alt');
    
    // Wait for second node to be created
    await expect(page.locator('.node-marker')).toHaveCount(2);
    await expect(page.locator('.node-list-item')).toHaveCount(2);
  });

  // Test 3: Create Edge by Dragging
  test('create edge by dragging between nodes', async () => {
    const page = sharedPage;
    // Create edge by dragging from first node's connector to second node
    const firstNode = page.locator('.node-marker').first();
    const secondNode = page.locator('.node-marker').nth(1);
    
    // Hover over first node to make connector handle visible
    await firstNode.hover();
    
    // Wait for connector handle to appear
    const connectorHandle = firstNode.locator('.connector.output');
    await expect(connectorHandle).toBeVisible();
    
    // Start drag from connector handle to second node
    await connectorHandle.dragTo(secondNode);

    // Wait for edge to be created (check the Edges panel)
    await expect(page.locator('.edge-list-item')).toBeVisible();

    // Verify edge appears in the edges list
    const edgeItems = await page.locator('.edge-list-item').allTextContents();
    expect(edgeItems.length).toBeGreaterThan(0);

    // Verify the edge shows both nodes
    const edgeText = edgeItems[0];
    expect(edgeText).toContain('Node 1');
    expect(edgeText).toContain('Node 2');
  });

  // Test 4: Test Panel Collapse/Expand Functionality
  test('collapse and expand panels', async () => {
    const page = sharedPage;
    // Click the "Nodes" panel title to collapse, confirm it collapses
    await page.click('#nodeListPanel .panel-title-text');
    await expect(page.locator('#nodeListPanel .panel-content')).not.toBeVisible();

    // Click the "Edges" panel title to collapse, confirm it collapses
    await page.click('#edgeListPanel .panel-title-text');
    await expect(page.locator('#edgeListPanel .panel-content')).not.toBeVisible();
    
    const floatingProtocolsPanel = page.locator('#floatingProtocolsPanel');
    if (await floatingProtocolsPanel.count()) {
      // Click the "Floating Protocols" panel title to collapse, confirm it collapses
      await floatingProtocolsPanel.locator('.panel-title-text').click();
      await expect(floatingProtocolsPanel.locator('.panel-content')).not.toBeVisible();
    }
  });

  // Test 5: Create Slots in Nodes
  test('create slots in nodes', async () => {
    const page = sharedPage;
    const firstNode = page.locator('.node-marker').first();
    const secondNode = page.locator('.node-marker').nth(1);

    // Select first Node and create slots
    await firstNode.click();

    // Click the "Add Slots" button 2 times to create 2 slots
    await page.click('.add-slot-btn');
    await page.click('.add-slot-btn');

    // Expect to have 2 .slot-row-container
    await expect(page.locator('.slot-row-container')).toHaveCount(2);
    
    // Select second Node and create slots
    await secondNode.click();

    // Click the "Add Slots" button 2 times to create 2 slots
    await page.click('.add-slot-btn');
    await page.click('.add-slot-btn');

    // Expect to have 2 .slot-row-container (belonging to the second node)
    await expect(page.locator('.slot-row-container')).toHaveCount(2);

    await expect(page.locator('#nodePanel .slots-container > .slots-header')).toHaveCount(0);
    const firstSlot = page.locator('#nodePanel .slot-row-container').first();
    const slotActions = firstSlot.locator('.slot-actions');
    await expect(slotActions.getByRole('button')).toHaveCount(3);

    for (const name of ['Toggle details', 'Show results', 'Delete slot']) {
      const actionButton = slotActions.getByRole('button', { name });
      await expect(actionButton).toBeVisible();
      await actionButton.hover();
      await expect(page.locator('.p-tooltip-text')).toHaveText(name);
    }

    const toggleDetailsButton = slotActions.getByRole('button', { name: 'Toggle details' });
    await toggleDetailsButton.click();
    await expect(firstSlot.locator('.slot-row-expanded')).toBeVisible();
    await toggleDetailsButton.click();
    await expect(firstSlot.locator('.slot-row-expanded')).toBeHidden();
  });

  // Test 6: Create Protocol in Edge
  test('create protocol in edge', async () => {
    const page = sharedPage;
    // Select the edge through its stable list item rather than map coordinates.
    const edgeListItem = page.locator('.edge-list-item').first();
    if (!await edgeListItem.isVisible()) {
      await page.click('#edgeListPanel .panel-title-text');
    }
    await expect(edgeListItem).toBeVisible();
    await edgeListItem.click();

    await expect(page.locator('#edgePanel .panel-content .add-protocol-btn')).toBeVisible();
    await page.click('#edgePanel .panel-content .add-protocol-btn');

    // click a.p-menu-item-link containing text "EntanglerProt"
    await page.click('.p-menu-item-link:has-text("EntanglerProt")');
    await expect(page.locator('#edgePanel .panel-content .protocol-editor.protocol-list-item')).toBeVisible();
  });

  // Test 7: Run Simulation with Pause/Resume
  test('run simulation with pause and resume', async () => {
    const page = sharedPage;
    const expectedSeconds = 1000;
    
    // Set the simulation time
    await page.fill('#runnerPanel .run-duration-group .duration-input', expectedSeconds.toString());

    // check stop button is visible and disabled
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeVisible();
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeDisabled();

    // Click the "Run Simulation" button
    await expect(page.locator('#runnerPanel .main-buttons .run-btn')).toBeVisible();
    await expect(page.locator('#runnerPanel .main-buttons .run-btn')).toBeEnabled();

    const runButton = page.locator('#runnerPanel .main-buttons .run-btn');
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();

    const runAccepted = page.waitForResponse(response =>
      response.url().endsWith('/run_simulation') &&
      response.request().method() === 'POST' &&
      response.status() === 202
    );
    await runButton.click();
    await runAccepted;

    // Click as soon as the accepted-running response makes the real control
    // actionable, before status polling can replace it with a completed state.
    await page.locator('#runnerPanel .main-buttons .pause-btn').click({ timeout: 5000 });

    // The resume control appears only after the backend acknowledges the pause.
    await expect(page.locator('#runnerPanel .main-buttons .resume-btn')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#runnerPanel .main-buttons .resume-btn')).toBeEnabled();
    await expect(page.locator('#logsPanel .logs-content .log-entry:has-text("Simulation paused")').first()).toBeVisible();

    // Click the "Resume Simulation" button
    await page.click('#runnerPanel .main-buttons .resume-btn');

    // Wait for simulation to finish - check for run button to appear (indicates completion)
    await expect(page.locator('#runnerPanel .main-buttons .run-btn')).toBeVisible({ timeout: 30000 });
    
    // Also verify progress bar is gone
    await expect(page.locator('#runnerPanel .progress-bar')).not.toBeVisible();

    // Check .current-time-display reached total time of the simulation
    const timeLocator = page.locator('#runnerPanel .current-time-display');

    await expect.poll(async () => {
      const text = await timeLocator.innerText();
      const match = text.match(/(\d+):(\d{2})\.(\d{3})/);
      if (!match) return 0;

      const [_, mm, ss, mmm] = match;
      return parseInt(mm) * 60_000 + parseInt(ss) + parseInt(mmm);
    }).toBeGreaterThanOrEqual(expectedSeconds);

    console.log('Simulation completed');

    // Check run button and stop button are visible and enabled
    await expect(page.locator('#runnerPanel .main-buttons .run-btn')).toBeVisible();
    await expect(page.locator('#runnerPanel .main-buttons .run-btn')).toBeEnabled();
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeVisible();
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeEnabled(); 

    // Stop the simulation
    await page.click('#runnerPanel .main-buttons .stop-btn');
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeDisabled();
  });

  // Test 8: Verify Logs Panel and Log Entries
  test('verify logs panel and log entries', async () => {
    const page = sharedPage;
    // Check logs panel is visible by default
    await expect(page.locator('#logsPanel .panel-content')).toBeVisible();

    // Click the "Logs" panel title to COLLAPSE, confirm it collapses
    await page.click('#logsPanel .panel-title-text');
    await expect(page.locator('#logsPanel .panel-content')).not.toBeVisible();

    // Click the "Logs" panel title to EXPAND, confirm it expands
    await page.click('#logsPanel .panel-title-text');
    await expect(page.locator('#logsPanel .panel-content')).toBeVisible();

    // Check logs container is visible
    await expect(page.locator('#logsPanel .logs-content')).toBeVisible();

    // Check logs panel has logs (there's one or more of .log-entry)
    const logCount = await page.locator('#logsPanel .logs-content .log-entry').count();
    expect(logCount).toBeGreaterThan(0);

    // Check for specific log entries
    await expect(page.locator('#logsPanel .logs-content .log-entry:has-text("Parsing network graph")').first()).toBeVisible();
    await expect(page.locator('#logsPanel .logs-content .log-entry:has-text("Simulation completed")').first()).toBeVisible();
  });
});
