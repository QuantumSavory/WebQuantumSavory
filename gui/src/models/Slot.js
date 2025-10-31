import { api } from '../utils/ApiConnector'

export default class Slot {
  constructor({ id, type }) {
    this.id = id
    this.type = type                        
    this.backgroundNoise = api.getDefaultBgNoise()        
    this.lastOperationTime = 0          
    this.assignment = false
    this.isLocked = false
    this.representationType = 'default'    
  }
}