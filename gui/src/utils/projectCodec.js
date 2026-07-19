import Edge from '../models/Edge'
import FloatingProtocol from '../models/FloatingProtocol'
import Node from '../models/Node'
import Variable from '../models/Variable'
import { setEdgeCorrectNodeOrder } from './Utils'
import { normalizeAnnotations } from './annotationGeometry'
import {
  CURVE_POINT_TYPES,
  DEFAULT_REFRACTIVE_INDEX,
  resolveEdgePhysicalProperties,
} from './edgeGeometry'
import { isMapPosition } from './layoutTemplates'
import { normalizeRepresentationConfig } from './representations'

export const PROJECT_SCHEMA_VERSION = 1

const DEFAULT_PROJECT_NAME = 'New Project'
const DEFAULT_SIMULATION_TIME = 1.0
const DEFAULT_SIMULATION_TIME_STEP = 0.1
export const DEFAULT_MAP_CENTER = [-98.5795, 39.8283]
export const DEFAULT_MAP_ZOOM = 4
export const DEFAULT_PHYSICAL_CONFIG = Object.freeze({
  refractiveIndex: DEFAULT_REFRACTIVE_INDEX,
})
export const TRANSIENT_SLOT_FIELDS = Object.freeze([
  'isLocked',
  'assignment',
  'lastOperationTime',
  'representationType',
  'ui_expanded',
  'renderedResult',
])

const STORAGE_ONLY_PROJECT_FIELDS = new Set([
  'schemaVersion',
  'platformInfo',
  'uiGlobal',
])
const TRANSIENT_SLOT_FIELD_SET = new Set(TRANSIENT_SLOT_FIELDS)

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
    )
  }
  return value
}

function omitFields(value, fields) {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !fields.has(key))
      .map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  )
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function validateOptionalNumber(value, name, { positive = false } = {}) {
  if (value == null) return
  const valid = typeof value === 'number'
    && Number.isFinite(value)
    && (positive ? value > 0 : value >= 0)
  if (!valid) {
    throw new Error(`${name} must be a finite ${positive ? 'positive' : 'nonnegative'} number`)
  }
}

function normalizePhysicalConfig(value) {
  if (value == null) return { ...DEFAULT_PHYSICAL_CONFIG }
  if (!isRecord(value)) throw new Error('Project physicalConfig must be an object')
  validateOptionalNumber(value.refractiveIndex, 'Project refractive index', { positive: true })
  return {
    ...cloneValue(value),
    refractiveIndex: value.refractiveIndex ?? DEFAULT_REFRACTIVE_INDEX,
  }
}

function normalizeCurvePoints(value, edgeId) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`Project edge ${edgeId} curvePoints must be an array`)
  const ids = new Set()
  return value.map((point, index) => {
    if (!isRecord(point)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} must be an object`)
    }
    if (typeof point.id !== 'string' || !point.id) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} requires an ID`)
    }
    if (ids.has(point.id)) {
      throw new Error(`Project edge ${edgeId} contains duplicate curve point ID: ${point.id}`)
    }
    if (!isMapPosition(point.position)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} has an invalid position`)
    }
    if (!CURVE_POINT_TYPES.includes(point.type)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} must be smooth or sharp`)
    }
    ids.add(point.id)
    return cloneValue(point)
  })
}

function normalizePhysicalOverrides(value, edgeId) {
  if (value == null) return null
  if (!isRecord(value)) {
    throw new Error(`Project edge ${edgeId} physicalOverrides must be an object or null`)
  }
  validateOptionalNumber(value.distanceMeters, `Project edge ${edgeId} distance`)
  validateOptionalNumber(
    value.refractiveIndex,
    `Project edge ${edgeId} refractive index`,
    { positive: true },
  )
  validateOptionalNumber(value.delaySeconds, `Project edge ${edgeId} delay`)
  return {
    ...cloneValue(value),
    distanceMeters: value.distanceMeters ?? null,
    refractiveIndex: value.refractiveIndex ?? null,
    delaySeconds: value.delaySeconds ?? null,
  }
}

export function normalizeProjectName(value, fallback = DEFAULT_PROJECT_NAME) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

function validateTopology(source) {
  const nodes = Array.isArray(source.net?.nodes) ? source.net.nodes : []
  const nodeIds = new Set()
  const physicalEndpointPairs = new Set()

  normalizePhysicalConfig(source.net?.physicalConfig)

  for (const node of nodes) {
    const id = node?.id
    if (typeof id !== 'string' || !id) throw new Error('Project contains a node without an ID')
    if (nodeIds.has(id)) throw new Error(`Project contains duplicate node ID: ${id}`)
    if (!Array.isArray(node.position) || node.position.length !== 2 || !node.position.every(Number.isFinite)) {
      throw new Error(`Project node ${id} has an invalid position`)
    }
    nodeIds.add(id)
  }

  for (const edge of Array.isArray(source.net?.edges) ? source.net.edges : []) {
    if (edge?.isLogic != null && typeof edge.isLogic !== 'boolean') {
      throw new Error(`Project edge ${edge?.id || '(unknown)'} isLogic must be a boolean`)
    }
    const sourceId = isRecord(edge?.source) ? edge.source.id : edge?.source
    const targetId = isRecord(edge?.target) ? edge.target.id : edge?.target
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      throw new Error(`Project edge ${edge?.id || '(unknown)'} references a missing node`)
    }
    if (edge?.isLogic !== true) {
      const endpointPair = [sourceId, targetId].sort().join('\u0000')
      if (physicalEndpointPairs.has(endpointPair)) {
        throw new Error(`Project contains duplicate physical edge endpoints: ${sourceId}, ${targetId}`)
      }
      physicalEndpointPairs.add(endpointPair)
      normalizeCurvePoints(edge?.data?.curvePoints, edge?.id || '(unknown)')
      normalizePhysicalOverrides(edge?.data?.physicalOverrides, edge?.id || '(unknown)')
    }
  }
}

function defaultBackgroundNoise(context) {
  const configuredDefault = typeof context.defaultBackgroundNoise === 'function'
    ? context.defaultBackgroundNoise()
    : context.defaultBackgroundNoise

  if (isRecord(configuredDefault)) {
    return cloneValue(configuredDefault)
  }
  return { type: 'default', parameters: [] }
}

function normalizeBackgroundNoise(value, context) {
  if (value == null || value === '' || value === 'default') {
    return defaultBackgroundNoise(context)
  }
  if (typeof value === 'string') {
    return { type: value, parameters: [] }
  }
  if (!isRecord(value)) {
    return defaultBackgroundNoise(context)
  }
  return {
    ...cloneValue(value),
    type: typeof value.type === 'string' && value.type ? value.type : 'default',
    parameters: Array.isArray(value.parameters) ? cloneValue(value.parameters) : [],
  }
}

function hydrateProtocol(rawProtocol) {
  const source = isRecord(rawProtocol) ? rawProtocol : {}
  const protocol = new FloatingProtocol({
    id: source.id,
    type: source.type,
    parameters: Array.isArray(source.parameters) ? cloneValue(source.parameters) : [],
  })
  Object.assign(protocol, omitFields(source, new Set(['id', 'type', 'parameters'])))
  return protocol
}

function hydrateNode(rawNode, context) {
  const source = isRecord(rawNode) ? rawNode : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const data = {
    ...omitFields(sourceData, new Set(['slots', 'protocols'])),
    slots: Array.isArray(sourceData.slots)
      ? sourceData.slots.map(slot => {
          const storedSlot = isRecord(slot) ? cloneValue(slot) : {}
          return {
            ...storedSlot,
            backgroundNoise: normalizeBackgroundNoise(storedSlot.backgroundNoise, context),
            isLocked: false,
            assignment: false,
          }
        })
      : [],
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(hydrateProtocol)
      : [],
  }
  const node = new Node({
    id: source.id,
    name: source.name,
    position: source.position,
    data,
  })
  Object.assign(node, omitFields(source, new Set(['id', 'name', 'position', 'data'])))
  return node
}

function hydrateEdge(rawEdge, nodeMap) {
  const source = isRecord(rawEdge) ? rawEdge : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const data = {
    ...omitFields(sourceData, new Set(['protocols'])),
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(hydrateProtocol)
      : [],
  }
  if (source.isLogic === true) {
    delete data.curvePoints
    delete data.physicalOverrides
  } else {
    data.curvePoints = normalizeCurvePoints(sourceData.curvePoints, source.id)
    data.physicalOverrides = normalizePhysicalOverrides(sourceData.physicalOverrides, source.id)
  }
  const sourceId = isRecord(source.source) ? source.source.id : source.source
  const targetId = isRecord(source.target) ? source.target.id : source.target
  const edge = new Edge({
    id: source.id,
    source: nodeMap[sourceId] || source.source,
    target: nodeMap[targetId] || source.target,
    data,
    isLogic: source.isLogic === true,
  })
  Object.assign(edge, omitFields(source, new Set(['id', 'source', 'target', 'data', 'isLogic'])))
  return edge
}

function plainProtocol(protocol) {
  const source = isRecord(protocol) ? protocol : {}
  return {
    ...omitFields(source, new Set(['parameters'])),
    parameters: Array.isArray(source.parameters) ? cloneValue(source.parameters) : [],
  }
}

function plainNode(node, { resetRuntimeSlotState = false } = {}) {
  const source = isRecord(node) ? node : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const slots = Array.isArray(sourceData.slots)
    ? sourceData.slots.map(slot => ({
        ...(isRecord(slot) ? cloneValue(slot) : {}),
        ...(resetRuntimeSlotState ? { isLocked: false, assignment: false } : {}),
      }))
    : []
  return {
    ...omitFields(source, new Set(['data'])),
    position: Array.isArray(source.position) ? [...source.position] : source.position,
    data: {
      ...omitFields(sourceData, new Set(['slots', 'protocols'])),
      slots,
      protocols: Array.isArray(sourceData.protocols)
        ? sourceData.protocols.map(plainProtocol)
        : [],
    },
  }
}

function endpointId(endpoint) {
  return isRecord(endpoint) ? endpoint.id : endpoint
}

function plainEdge(edge) {
  const source = isRecord(edge) ? edge : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const isLogic = source.isLogic === true
  const data = {
    ...omitFields(
      sourceData,
      new Set(['protocols', 'curvePoints', 'physicalOverrides', 'propagationDelaySeconds']),
    ),
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(plainProtocol)
      : [],
  }
  if (!isLogic) {
    data.curvePoints = normalizeCurvePoints(sourceData.curvePoints, source.id)
    data.physicalOverrides = normalizePhysicalOverrides(sourceData.physicalOverrides, source.id)
  }
  return {
    ...omitFields(source, new Set(['source', 'target', 'data', 'isLogic'])),
    source: endpointId(source.source),
    target: endpointId(source.target),
    isLogic,
    data,
  }
}

function plainVariable(variable) {
  return isRecord(variable) ? cloneValue(variable) : {}
}

function normalizeMap(rawMap, context) {
  const fallbackPosition = Array.isArray(context.defaultMapCenter)
    ? [...context.defaultMapCenter]
    : [...DEFAULT_MAP_CENTER]
  const fallbackZoom = finiteNumber(context.defaultMapZoom, DEFAULT_MAP_ZOOM)
  const source = isRecord(rawMap) ? rawMap : {}
  return {
    ...omitFields(source, new Set(['position', 'zoom'])),
    position: Array.isArray(source.position) && source.position.length === 2
      ? [...source.position]
      : fallbackPosition,
    zoom: finiteNumber(source.zoom, fallbackZoom),
  }
}

/**
 * Create the canonical in-memory shape for a project with no topology.
 */
export function createEmptyProject(name = DEFAULT_PROJECT_NAME) {
  return {
    name: normalizeProjectName(name),
    description: '',
    annotations: [],
    variables: [],
    simulationConfig: {
      time: DEFAULT_SIMULATION_TIME,
      timeStep: DEFAULT_SIMULATION_TIME_STEP,
      ...normalizeRepresentationConfig(),
    },
    net: {
      nodes: [],
      edges: [],
      protocols: [],
      physicalConfig: { ...DEFAULT_PHYSICAL_CONFIG },
    },
  }
}

/**
 * Decode a stored v0/v1 project into model instances plus storage metadata.
 * The storage key is authoritative because it is how the project was selected.
 */
export function decodeStoredProject(raw, context = {}) {
  const source = isRecord(raw) ? raw : {}
  const schemaVersion = Number.isInteger(source.schemaVersion) ? source.schemaVersion : 0
  if (schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema version ${schemaVersion} is newer than supported version ${PROJECT_SCHEMA_VERSION}`,
    )
  }
  validateTopology(source)
  const name = normalizeProjectName(context.storageName, normalizeProjectName(source.name))
  const nodes = Array.isArray(source.net?.nodes)
    ? source.net.nodes.map(node => hydrateNode(node, context))
    : []
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]))
  const edges = Array.isArray(source.net?.edges)
    ? source.net.edges.map(edge => hydrateEdge(edge, nodeMap))
    : []
  edges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))

  const minimumTime = finiteNumber(context.minimumTime, DEFAULT_SIMULATION_TIME)
  const minimumTimeStep = finiteNumber(context.minimumTimeStep, DEFAULT_SIMULATION_TIME_STEP)
  const configuredTime = finiteNumber(source.simulationConfig?.time, DEFAULT_SIMULATION_TIME)
  const configuredTimeStep = finiteNumber(
    source.simulationConfig?.timeStep,
    DEFAULT_SIMULATION_TIME_STEP,
  )
  const representationConfig = normalizeRepresentationConfig(source.simulationConfig)
  const rawUiGlobal = isRecord(source.uiGlobal) ? source.uiGlobal : {}
  const map = normalizeMap(rawUiGlobal.map, context)

  const project = {
    ...omitFields(source, new Set([
      'name',
      'description',
      'annotations',
      'variables',
      'simulationConfig',
      'net',
      ...STORAGE_ONLY_PROJECT_FIELDS,
    ])),
    name,
    description: typeof source.description === 'string' ? source.description : '',
    annotations: normalizeAnnotations(source.annotations),
    variables: Array.isArray(source.variables)
      ? source.variables.map(variable => {
          const hydrated = new Variable(isRecord(variable) ? cloneValue(variable) : {})
          Object.assign(
            hydrated,
            omitFields(variable, new Set(['id', 'name', 'type', 'value'])),
          )
          return hydrated
        })
      : [],
    simulationConfig: {
      ...omitFields(source.simulationConfig, new Set([
        'time',
        'timeStep',
        'qubitRepresentation',
        'qumodeRepresentation',
      ])),
      time: Math.max(minimumTime, configuredTime),
      timeStep: Math.max(minimumTimeStep, configuredTimeStep),
      ...representationConfig,
    },
    net: {
      ...omitFields(source.net, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes,
      edges,
      protocols: Array.isArray(source.net?.protocols)
        ? source.net.protocols.map(hydrateProtocol)
        : [],
      physicalConfig: normalizePhysicalConfig(source.net?.physicalConfig),
    },
  }

  return {
    project,
    map,
    platformInfo: isRecord(source.platformInfo) ? cloneValue(source.platformInfo) : null,
    schemaVersion,
    uiGlobal: {
      ...omitFields(rawUiGlobal, new Set(['map'])),
      map,
    },
  }
}

/**
 * Encode the live model graph into the stable local-storage/export shape.
 */
export function encodeStoredProject(project, context = {}) {
  const source = isRecord(project) ? project : createEmptyProject()
  const name = normalizeProjectName(context.name, normalizeProjectName(source.name))
  const sourceNet = isRecord(source.net) ? source.net : {}
  const sourceSimulationConfig = isRecord(source.simulationConfig)
    ? source.simulationConfig
    : {}
  const mapSource = context.map || context.uiGlobal?.map
  const uiGlobal = {
    ...omitFields(context.uiGlobal, new Set(['map'])),
    map: normalizeMap(mapSource, context),
  }
  const platformInfo = context.platformInfo ?? source.platformInfo
  const representationConfig = normalizeRepresentationConfig(sourceSimulationConfig)

  return {
    ...omitFields(source, new Set([
      'name',
      'description',
      'annotations',
      'variables',
      'simulationConfig',
      'net',
      ...STORAGE_ONLY_PROJECT_FIELDS,
    ])),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    description: typeof source.description === 'string' ? source.description : '',
    annotations: normalizeAnnotations(source.annotations),
    variables: Array.isArray(source.variables) ? source.variables.map(plainVariable) : [],
    simulationConfig: {
      ...omitFields(sourceSimulationConfig, new Set([
        'time',
        'timeStep',
        'qubitRepresentation',
        'qumodeRepresentation',
      ])),
      time: finiteNumber(sourceSimulationConfig.time, DEFAULT_SIMULATION_TIME),
      timeStep: finiteNumber(sourceSimulationConfig.timeStep, DEFAULT_SIMULATION_TIME_STEP),
      ...representationConfig,
    },
    ...(isRecord(platformInfo) ? { platformInfo: cloneValue(platformInfo) } : {}),
    net: {
      ...omitFields(sourceNet, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(node => plainNode(node, { resetRuntimeSlotState: true }))
        : [],
      edges: Array.isArray(sourceNet.edges) ? sourceNet.edges.map(plainEdge) : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(plainProtocol)
        : [],
      physicalConfig: normalizePhysicalConfig(sourceNet.physicalConfig),
    },
    uiGlobal,
  }
}

/**
 * Encode the transport-neutral collaborative design document.
 *
 * This is deliberately a projection of the established stored-project codec:
 * storage migrations and model normalization therefore remain implemented in
 * exactly one place.
 */
export function encodeDesignDocument(project) {
  const document = encodeStoredProject(project)
  delete document.platformInfo
  delete document.uiGlobal

  for (const node of document.net?.nodes || []) {
    delete node.expanded
    for (const slot of node.data?.slots || []) {
      for (const field of TRANSIENT_SLOT_FIELDS) delete slot[field]
    }
  }
  return document
}

/**
 * Hydrate a collaborative design document through the same model codec used by
 * local storage and imports.
 */
export function decodeDesignDocument(document, context = {}) {
  return decodeStoredProject(document, context).project
}

function hasValue(parameter) {
  return parameter?.value != null && parameter.value !== ''
}

function cleanProtocol(protocol, excludedParameterNames) {
  const plain = plainProtocol(protocol)
  return {
    ...plain,
    parameters: plain.parameters
      .filter(parameter => (
        !excludedParameterNames.has(parameter?.name) && hasValue(parameter)
      ))
      .map(parameter => {
        const cleaned = cloneValue(parameter)
        if (cleaned.selectedType != null) {
          cleaned.type = cleaned.selectedType
        }
        delete cleaned.selectedType
        return cleaned
      }),
  }
}

function cleanBackgroundNoise(value) {
  if (typeof value === 'string') {
    return { type: value, parameters: [] }
  }
  const source = isRecord(value) ? cloneValue(value) : { type: 'default', parameters: [] }
  delete source.doc
  source.parameters = Array.isArray(source.parameters)
    ? source.parameters
        .filter(hasValue)
        .map(parameter => ({
          name: parameter.field ?? parameter.name,
          value: cloneValue(parameter.value),
        }))
    : []
  return source
}

/**
 * Convert the live project to the backend simulation request shape.
 */
export function toSimulationPayload(project) {
  const source = isRecord(project) ? project : createEmptyProject()
  const sourceNet = isRecord(source.net) ? source.net : {}
  const nodeExclusions = new Set(['sim', 'net', 'node'])
  const edgeExclusions = new Set(['sim', 'net', 'nodeA', 'nodeB'])
  const physicalConfig = normalizePhysicalConfig(sourceNet.physicalConfig)

  return {
    ...omitFields(source, new Set([
      'schemaVersion',
      'description',
      'annotations',
      'simulationConfig',
      'platformInfo',
      'uiGlobal',
      'variables',
      'net',
    ])),
    simulationConfig: normalizeRepresentationConfig(source.simulationConfig),
    variables: Array.isArray(source.variables)
      ? source.variables.map(variable => ({
          id: variable?.id,
          name: variable?.name,
          type: variable?.type,
          value: cloneValue(variable?.value),
          ...(typeof variable?.statesZooTraceSourceId === 'string'
            && variable.statesZooTraceSourceId
            ? { statesZooTraceSourceId: variable.statesZooTraceSourceId }
            : {}),
        }))
      : [],
    net: {
      ...omitFields(sourceNet, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(node => {
            const plain = plainNode(node)
            const sourceData = isRecord(plain.data) ? plain.data : {}
            return {
              ...plain,
              data: {
                ...sourceData,
                slots: (sourceData.slots || []).map(slot => {
                  const cleaned = omitFields(slot, TRANSIENT_SLOT_FIELD_SET)
                  cleaned.backgroundNoise = cleanBackgroundNoise(cleaned.backgroundNoise)
                  return cleaned
                }),
                protocols: (sourceData.protocols || [])
                  .map(protocol => cleanProtocol(protocol, nodeExclusions)),
              },
            }
          })
        : [],
      edges: Array.isArray(sourceNet.edges)
        ? sourceNet.edges.map(edge => {
            const plain = plainEdge(edge)
            const resolvedPhysical = resolveEdgePhysicalProperties(edge, physicalConfig)
            const payloadData = omitFields(
              plain.data,
              new Set(['curvePoints', 'physicalOverrides', 'propagationDelaySeconds']),
            )
            return {
              ...plain,
              data: {
                ...payloadData,
                ...(resolvedPhysical
                  ? { propagationDelaySeconds: resolvedPhysical.propagationDelaySeconds }
                  : {}),
                protocols: (payloadData.protocols || [])
                  .map(protocol => cleanProtocol(protocol, edgeExclusions)),
              },
            }
          })
        : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(protocol => cleanProtocol(protocol, edgeExclusions))
        : [],
    },
  }
}

/**
 * Add the run configuration required by the script-export endpoint.
 */
export function toScriptExportPayloadFromSimulationPayload(payload, simulationConfig) {
  const sourceConfig = isRecord(simulationConfig) ? simulationConfig : {}
  const representationConfig = normalizeRepresentationConfig({
    ...(isRecord(payload?.simulationConfig) ? payload.simulationConfig : {}),
    ...sourceConfig,
  })
  return {
    ...payload,
    simulationConfig: {
      time: finiteNumber(sourceConfig.time, DEFAULT_SIMULATION_TIME),
      timeStep: finiteNumber(sourceConfig.timeStep, DEFAULT_SIMULATION_TIME_STEP),
      ...representationConfig,
    },
  }
}

/**
 * Compatibility wrapper for callers that still have a live project graph.
 */
export function toScriptExportPayload(project, simulationConfig = project?.simulationConfig) {
  return toScriptExportPayloadFromSimulationPayload(
    toSimulationPayload(project),
    simulationConfig,
  )
}

/**
 * Calculate project-list metadata without persistence concerns.
 */
export function summarizeProject(project) {
  const nodes = Array.isArray(project?.net?.nodes) ? project.net.nodes : []
  const edges = Array.isArray(project?.net?.edges) ? project.net.edges : []
  const floatingProtocols = Array.isArray(project?.net?.protocols) ? project.net.protocols : []
  const slotCount = nodes.reduce(
    (total, node) => total + (Array.isArray(node?.data?.slots) ? node.data.slots.length : 0),
    0,
  )
  const nodeProtocolCount = nodes.reduce(
    (total, node) => total + (
      Array.isArray(node?.data?.protocols) ? node.data.protocols.length : 0
    ),
    0,
  )
  const edgeProtocolCount = edges.reduce(
    (total, edge) => total + (
      Array.isArray(edge?.data?.protocols) ? edge.data.protocols.length : 0
    ),
    0,
  )

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    slotCount,
    protocolCount: nodeProtocolCount + edgeProtocolCount + floatingProtocols.length,
  }
}
