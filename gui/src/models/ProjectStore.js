// ProjectStore.js
// Abstraction for saving/loading project data (localStorage for now)

const STORAGE_PREFIX = 'cqn_project_'
const METADATA_INDEX_KEY = 'cqn_projects_metadata_index'

export default class ProjectStore {
  // Get the metadata index (creates empty one if doesn't exist)
  static getMetadataIndex() {
    const raw = localStorage.getItem(METADATA_INDEX_KEY)
    if (!raw) return {}
    try {
      return JSON.parse(raw)
    } catch (e) {
      return {}
    }
  }

  // Save the metadata index
  static saveMetadataIndex(index) {
    localStorage.setItem(METADATA_INDEX_KEY, JSON.stringify(index))
  }

  // Update metadata for a specific project
  static updateProjectMetadata(name, projectData, isOpening = false) {
    const index = this.getMetadataIndex()
    const existingMetadata = index[name] || {}
    const now = new Date().toISOString()
    
    // Calculate aggregated counts
    const nodes = projectData.net?.nodes || []
    const edges = projectData.net?.edges || []
    const floatingProtocols = projectData.net?.protocols || []
    
    // Calculate total slots (sum of all slots in all nodes)
    const totalSlots = nodes.reduce((total, node) => {
      return total + (node.data?.slots?.length || 0)
    }, 0)
    
    // Calculate total protocols (nodes + edges + floating)
    const nodeProtocols = nodes.reduce((total, node) => {
      return total + (node.data?.protocols?.length || 0)
    }, 0)
    const edgeProtocols = edges.reduce((total, edge) => {
      return total + (edge.data?.protocols?.length || 0)
    }, 0)
    const totalProtocols = nodeProtocols + edgeProtocols + floatingProtocols.length
    
    // Extract metadata from project data
    const metadata = {
      createdAt: existingMetadata.createdAt || now, // Set only if new project
      updatedAt: now, // Always update when saving
      openedAt: isOpening ? now : existingMetadata.openedAt, // Only update when opening
      nodeCount: nodes.length,
      edgeCount: edges.length,
      slotCount: totalSlots,
      protocolCount: totalProtocols
    }
    
    index[name] = metadata
    this.saveMetadataIndex(index)
  }

  // Remove project from metadata index
  static removeProjectMetadata(name) {
    const index = this.getMetadataIndex()
    delete index[name]
    this.saveMetadataIndex(index)
  }

  // Save a project (serializes data as JSON)
  static saveProject(name, data) {
    if (!name) throw new Error('Project name required')
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data))
    
    // Update metadata index (not opening, just saving)
    this.updateProjectMetadata(name, data, false)
  }

  // Open a project and update openedAt timestamp
  static openProject(name, data) {
    if (!name) throw new Error('Project name required')
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data))
    
    // Update metadata index with opening flag
    this.updateProjectMetadata(name, data, true)
  }

  // Load a project (returns parsed data or null)
  static loadProject(name) {
    const raw = localStorage.getItem(STORAGE_PREFIX + name)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  // List all saved project names
  static listProjects() {
    const keys = Object.keys(localStorage)
    return keys
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .map(k => k.slice(STORAGE_PREFIX.length))
  }

  // Delete a project
  static deleteProject(name) {
    localStorage.removeItem(STORAGE_PREFIX + name)
    // Remove from metadata index
    this.removeProjectMetadata(name)
  }

  // Get projects sorted by most recently opened (with metadata)
  static getRecentProjects(limit = 10) {
    const index = this.getMetadataIndex()
    const projectNames = this.listProjects()
    
    // Filter index to only include projects that actually exist
    const validProjects = projectNames
      .map(name => ({
        name,
        metadata: index[name] || {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          openedAt: null, // Don't default - will be sorted to end
          nodeCount: 0,
          edgeCount: 0,
          slotCount: 0,
          protocolCount: 0
        }
      }))
      .sort((a, b) => {
        // Sort by openedAt (most recent first), fallback to updatedAt, then createdAt
        const aDate = a.metadata.openedAt || a.metadata.updatedAt || a.metadata.createdAt
        const bDate = b.metadata.openedAt || b.metadata.updatedAt || b.metadata.createdAt
        return new Date(bDate) - new Date(aDate)
      })
      .slice(0, limit)
    
    return validProjects
  }

  // Get all projects with metadata (for future use in project lists)
  static getAllProjectsWithMetadata() {
    const index = this.getMetadataIndex()
    const projectNames = this.listProjects()
    
    return projectNames.map(name => ({
      name,
      metadata: index[name] || {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        openedAt: null, // Don't default to current time
        nodeCount: 0,
        edgeCount: 0,
        slotCount: 0,
        protocolCount: 0
      }
    }))
  }

  // Rebuild metadata index from existing projects (utility function)
  static rebuildMetadataIndex() {
    const projectNames = this.listProjects()
    const existingIndex = this.getMetadataIndex()
    const newIndex = {}
    const now = new Date().toISOString()
    
    projectNames.forEach(name => {
      const projectData = this.loadProject(name)
      const existingMetadata = existingIndex[name] || {}
      
      if (projectData) {
        // Calculate aggregated counts for rebuild
        const nodes = projectData.net?.nodes || []
        const edges = projectData.net?.edges || []
        const floatingProtocols = projectData.net?.protocols || []
        
        const totalSlots = nodes.reduce((total, node) => {
          return total + (node.data?.slots?.length || 0)
        }, 0)
        
        const nodeProtocols = nodes.reduce((total, node) => {
          return total + (node.data?.protocols?.length || 0)
        }, 0)
        const edgeProtocols = edges.reduce((total, edge) => {
          return total + (edge.data?.protocols?.length || 0)
        }, 0)
        const totalProtocols = nodeProtocols + edgeProtocols + floatingProtocols.length
        
        newIndex[name] = {
          // For legacy projects, try to get timestamps from old format, otherwise use existing or defaults
          createdAt: projectData.uiGlobal?.createdAt || projectData.createdAt || existingMetadata.createdAt || now,
          updatedAt: projectData.uiGlobal?.updatedAt || projectData.updatedAt || existingMetadata.updatedAt || now,
          openedAt: projectData.uiGlobal?.openedAt || projectData.openedAt || existingMetadata.openedAt || null,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          slotCount: totalSlots,
          protocolCount: totalProtocols
        }
      }
    })
    
    this.saveMetadataIndex(newIndex)
    return newIndex
  }
} 