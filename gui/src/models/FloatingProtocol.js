export default class FloatingProtocol {
  constructor({ id, type, parameters = [] }) {
    this.id = id
    this.type = type
    this.parameters = Array.isArray(parameters) ? [...parameters] : []
  }
}