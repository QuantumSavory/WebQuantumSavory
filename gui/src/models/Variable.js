import { generateUUid } from '../utils/Utils'

export const VARIABLE_REFERENCE_KIND = 'variable'
export const STATES_ZOO_VALUE_KIND = 'states_zoo'

export default class Variable {
  constructor({
    id = generateUUid('variable'),
    name = '',
    type = 'Float64',
    value = null,
    statesZooTraceSourceId = null
  } = {}) {
    this.id = id
    this.name = name
    this.type = type
    this.value = value
    if (typeof statesZooTraceSourceId === 'string' && statesZooTraceSourceId) {
      this.statesZooTraceSourceId = statesZooTraceSourceId
    }
  }

  toJSON() {
    const serialized = {
      id: this.id,
      name: this.name,
      type: this.type,
      value: this.value
    }
    if (typeof this.statesZooTraceSourceId === 'string' && this.statesZooTraceSourceId) {
      serialized.statesZooTraceSourceId = this.statesZooTraceSourceId
    }
    return serialized
  }
}

export class VariableReference {
  constructor(id) {
    this.kind = VARIABLE_REFERENCE_KIND
    this.id = id
  }

  toJSON() {
    return {
      kind: this.kind,
      id: this.id
    }
  }
}

export function isVariableReference(value) {
  return value !== null
    && typeof value === 'object'
    && value.kind === VARIABLE_REFERENCE_KIND
    && typeof value.id === 'string'
}

export function isStatesZooValue(value) {
  return value !== null
    && typeof value === 'object'
    && value.kind === STATES_ZOO_VALUE_KIND
    && typeof value.state_type === 'string'
    && value.parameters !== null
    && typeof value.parameters === 'object'
    && !Array.isArray(value.parameters)
}

export function isStatesZooVariable(variable) {
  return isStatesZooValue(variable?.value)
}

export function isStatesZooTraceVariable(variable) {
  const sourceId = variable?.statesZooTraceSourceId
  return typeof sourceId === 'string'
    && sourceId.length > 0
    && variable?.id === `${sourceId}_tr`
}

export function isVariableReferenced(projectData, variableId) {
  const net = projectData?.net
  if (!net) return false

  const protocols = [
    ...(net.protocols || []),
    ...(net.nodes || []).flatMap(node => node.data?.protocols || []),
    ...(net.edges || []).flatMap(edge => edge.data?.protocols || [])
  ]

  return protocols.some(protocol => (
    (protocol.parameters || []).some(parameter => (
      isVariableReference(parameter.value) && parameter.value.id === variableId
    ))
  ))
}
