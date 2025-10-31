export default class EdgeProtocol {
  constructor({ id, type, data = { } }) {
    this.id = id
    this.type = type
    this.data = { ...data }
  }
}