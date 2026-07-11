import { generateUUid } from '../utils/Utils'

export const VARIABLE_REFERENCE_KIND = 'variable'

export default class Variable {
  constructor({ id = generateUUid('variable'), name = '', type = 'Float64', value = null } = {}) {
    this.id = id
    this.name = name
    this.type = type
    this.value = value
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      value: this.value
    }
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
