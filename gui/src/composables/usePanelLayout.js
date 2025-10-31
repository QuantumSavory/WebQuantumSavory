import { ref, computed } from 'vue'

/**
 * usePanelLayout - Composable for panel layout management
 */
export function usePanelLayout() {
  const isRightSidebarVisible = ref(true)
  
  const panelCollapsedStates = ref({
    selectedElementPanel: 
      localStorage.getItem('panelCollapsed_node_panel') === 'true' ||
      localStorage.getItem('panelCollapsed_edge_panel') === 'true' ||
      localStorage.getItem('panelCollapsed_void_panel') === 'true',
    nodeListPanel: localStorage.getItem('panelCollapsed_node_list') === 'true',
    edgeListPanel: localStorage.getItem('panelCollapsed_edge_list') === 'true',
    floatingProtocolsPanel: localStorage.getItem('panelCollapsed_floating_protocols') === 'true'
  })

  const panelContainerKey = ref(0)

  function handlePanelCollapse(panelId, isCollapsed) {
    console.log(`🔽 Panel ${panelId} collapsed state:`, isCollapsed)
    
    if (panelId === 'node_panel' || panelId === 'edge_panel' || panelId === 'void_panel') {
      panelCollapsedStates.value.selectedElementPanel = isCollapsed
      localStorage.setItem('panelCollapsed_node_panel', isCollapsed)
      localStorage.setItem('panelCollapsed_edge_panel', isCollapsed)
      localStorage.setItem('panelCollapsed_void_panel', isCollapsed)
    } else if (panelId === 'node_list') {
      panelCollapsedStates.value.nodeListPanel = isCollapsed
    } else if (panelId === 'edge_list') {
      panelCollapsedStates.value.edgeListPanel = isCollapsed
    } else if (panelId === 'floating_protocols') {
      panelCollapsedStates.value.floatingProtocolsPanel = isCollapsed
    }
    
    console.log(`📊 All panel states:`, JSON.stringify(panelCollapsedStates.value, null, 2))
    panelContainerKey.value++
  }

  const panelFlexValues = computed(() => {
    const firstPaneCollapsed = panelCollapsedStates.value.selectedElementPanel
    
    const panes = [
      { id: 'first', collapsed: firstPaneCollapsed },
      { id: 'nodeList', collapsed: panelCollapsedStates.value.nodeListPanel },
      { id: 'edgeList', collapsed: panelCollapsedStates.value.edgeListPanel },
      { id: 'floating', collapsed: panelCollapsedStates.value.floatingProtocolsPanel }
    ]
    
    const collapsedCount = panes.filter(p => p.collapsed).length
    
    if (collapsedCount === 0) {
      return {
        first: '1 1 0',
        nodeList: '1 1 0',
        edgeList: '1 1 0',
        floating: '1 1 0'
      }
    }
    
    console.log(`📐 Panel flex values calculated:`, {
      collapsedCount,
      expandedCount: 4 - collapsedCount
    })
    
    return {
      first: firstPaneCollapsed ? '0 0 36px' : '1 1 0',
      nodeList: panelCollapsedStates.value.nodeListPanel ? '0 0 36px' : '1 1 0',
      edgeList: panelCollapsedStates.value.edgeListPanel ? '0 0 36px' : '1 1 0',
      floating: panelCollapsedStates.value.floatingProtocolsPanel ? '0 0 36px' : '1 1 0'
    }
  })

  function toggleRightSidebar() {
    isRightSidebarVisible.value = !isRightSidebarVisible.value
  }

  return {
    isRightSidebarVisible,
    panelCollapsedStates,
    panelContainerKey,
    handlePanelCollapse,
    panelFlexValues,
    toggleRightSidebar
  }
}
