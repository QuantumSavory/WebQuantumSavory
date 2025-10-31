
import { ref, readonly } from 'vue'
import { generateUUid } from './Utils.js'

export class ApiConnector {
  
  constructor(baseUrl='http://localhost:8000') {
    this.baseUrl = baseUrl
    this._config  = ref({})
    this._platformInfo = ref(null)
    this._loading = ref(false)
    this._error   = ref(null)
    this.known_functions = ref([]);
    this.requestHeaders = {
      'Content-Type': 'application/json', 
      'Accept': 'application/json'
    };
  }

  get config()  { return readonly(this._config) }
  get loading() { return readonly(this._loading) }
  get error()   { return readonly(this._error) }

  async fetchKnownFunctions(){
    const res = await fetch(`${this.baseUrl}/known_functions`, {
      headers: this.requestHeaders,
    })
    const responseObject = await res.json()
    this.known_functions.value = responseObject.known_functions
  }

  getKnownFunctions(){
    return this.known_functions.value
  }

  getUserUuid(){
    const STORAGE_KEY = 'user_uuid'
    let uuid = localStorage.getItem(STORAGE_KEY)
    if (!uuid) {
      uuid = generateUUid('', 8)
      localStorage.setItem(STORAGE_KEY, uuid)
    }
    return uuid
  }

  getDefaultBgNoise(){
    return {
      type: 'default',
      doc: 'No background noise',
      parameters: []
    }
  }

  async init() {
    try {
      this._loading.value = true
      await this.fetchKnownFunctions();
      // Get background noise types
      const res = await fetch(`${this.baseUrl}/background_types`, {
        headers: this.requestHeaders,
      })
      if (!res.ok) throw new Error(`Background-noise types fetch failed: ${res.status}`)
      const responseObject = await res.json()
      this._config.value.bgNoiseOptions = [ ...responseObject.background_types ];
      this._config.value.bgNoiseOptions.unshift( this.getDefaultBgNoise() );

      // Get protocol types
      const resProtTypes = await fetch(`${this.baseUrl}/protocol_types`, {
        headers: this.requestHeaders,
      })
      if (!resProtTypes.ok) throw new Error(`Protocol types fetch failed: ${resProtTypes.status}`)
      const responseObjectProtTypes = await resProtTypes.json()
      let parsedTypes = responseObjectProtTypes.protocol_types;
      
      // Remove non-string parameters
      // To-do: parse these so we don't need to exclude them
      parsedTypes = parsedTypes.map(type => ({
        ...type,
        parameters: type.parameters.filter(param => {
          return typeof param.type === 'string' || param.type === 'Function' || Array.isArray( param.type )
        })
      }));
      this._config.value.protocolTypes = {
        floating: [], 
        node: [], 
        edge: []
      }

      parsedTypes.forEach(type => {
        const groupName = type.group;
        if( groupName ){
          this._config.value.protocolTypes[groupName].push(type);
        }else{
          this._config.value.protocolTypes.floating.push(type);
        }
      });
    } catch (e) {
      this._error.value = e
    } finally {
      this._loading.value = false
    }
  }

  getPlatformInfo(){
    if( !this._platformInfo.value ){
      return "Not set";
    }
    return this._platformInfo.value
  }

  async fetchPlatformInfo(){
    try{
      const res = await fetch(`${this.baseUrl}/platform_info`, {
        headers: this.requestHeaders,
      })
      const result = await res.json()
      this._platformInfo.value = {
        versions: {
          julia: result.versions.julia, 
          quantumSavory: result.versions.quantumsavory, 
          app: result.versions.app
        }
      }
      return result
    } catch (e) {
      console.error( 'getPlatformInfo error', e );
    } finally {
    }
  }

  async destroySimulation(projectName){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const res = await fetch(`${this.baseUrl}/destroy_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify( { name: `${uuid}_${projectName}` } )
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'destroySimulation error', e );
    } finally {
      this._loading.value = false
    }
    return { success: false, message: 'Simulation destroyed' }
  }

  async parseNetworkGraph(data){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const modifiedData = {
        ...data,
        name: `${uuid}_${data.name}`
      }
      const res = await fetch(`${this.baseUrl}/parse_network_graph`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify(modifiedData)
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'parseNetworkGraph error', e );
    } finally {
      this._loading.value = false
    }
  }

  async prepareSimulation(data){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const res = await fetch(`${this.baseUrl}/prepare_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify( { name: `${uuid}_${data.name}` } )
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'prepareSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }

  async getSimulationStatus(data){
    console.log( 'ApiConnector::getSimulationStatus', data );
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      console.log( 'uuid', uuid );
      const res = await fetch(`${this.baseUrl}/get_state?name=${uuid}_${data.name}`, {
        headers: this.requestHeaders,
        method: 'GET',
      })
      const response = await res.json()

      // TEMPORARY TEST CODE: Randomly simulate no entanglements ~20% of the time
      // TODO: Remove this test code after testing the entanglement cleanup feature
      /* try{
        const chance = Math.random();
        if (chance < 0.2 && response && response.state && response.state.slots) {
          console.warn('🧪 TEST MODE (frontend): Simulating empty entanglements (Math.random() < 0.2)')
          if (response.state.slots.entanglements) {
            response.state.slots.entanglements = []
          }
          if (Array.isArray(response.state.slots.slots)) {
            response.state.slots.slots.forEach(slotInfo => {
              if (slotInfo && Array.isArray(slotInfo.entangled_slots)) {
                slotInfo.entangled_slots = []
              }
            })
          }
        }
      }catch (e){
        console.warn('Frontend entanglement simulation failed silently:', e)
      } */

      return response
    } catch (e) {
      this._error.value = e;
      console.error( 'getSimulationStatus error', e );
    } finally {
      this._loading.value = false
    }
  }

  async runSimulation( projectName, time_units){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const res = await fetch(`${this.baseUrl}/run_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify( { name: `${uuid}_${projectName}`, time_units: time_units } )
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'runSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }

  async pauseSimulation( projectName ){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const res = await fetch(`${this.baseUrl}/pause_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify( { name: `${uuid}_${projectName}` } )
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'pauseSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }


  
  async getProtocolResults( protocolObject ){
    const projectName = window.projectData.name;
    const uuid = this.getUserUuid()
    const res = await fetch(`${this.baseUrl}/protocols/${uuid}_${projectName}/${protocolObject.id}`, {
      headers: this.requestHeaders,
      method: 'GET',
    })
    const responseBody = await res.json()
    let result = responseBody;
    return result;
  }
  
  async getSlotResults( slotObject ){
    const projectName = window.projectData.name;
    const uuid = this.getUserUuid()
    const res = await fetch(`${this.baseUrl}/slots/${uuid}_${projectName}/${slotObject.id}`, {
      headers: this.requestHeaders,
      method: 'GET',
    })
    const responseBody = await res.json()
    let result = responseBody;
    return result;
  }

  updateConfig(patch) {
    if (!this._config.value) return
    this._config.value = { ...this._config.value, ...patch }
  }

  getProtocolDefinition( type, name ){
    const typedProtocols = this._config.value.protocolTypes[type] || []
    const protocol = typedProtocols.find(p => p.type === name)
    return protocol
  }

  getProtocolParameterDefinition( protocolType, protocolName, paramName ){
    const protocolDefinition = this.getProtocolDefinition( protocolType, protocolName )
    const param = protocolDefinition.parameters.find(p => p.field === paramName)
    return param
  }

  getBackgroundNoiseDefinition( bgNoiseName ){
    const bgNoiseDefinition = this._config.value.bgNoiseOptions.find(b => b.type === bgNoiseName)
    return bgNoiseDefinition
  }

  getBackgroundNoiseParameterDefinition( bgNoiseName, paramName ){
    const bgNoiseDefinition = this.getBackgroundNoiseDefinition( bgNoiseName )
    const param = bgNoiseDefinition.parameters.find(p => p.field === paramName)
    return param
  }

  async validateFunction( code ){
    if( code == undefined || code == null || code == '' ){
      return { success: false, error: 'Code is empty' }
    }
    const res = await fetch(`${this.baseUrl}/test_code`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify( { code: code || '' } )
    })
    return res.json()
  }

  async validateSymbolicFunction( expr ){
    if( expr == undefined || expr == null || expr == '' ){
      return { success: false, error: 'Expression is empty' }
    }
    const res = await fetch(`${this.baseUrl}/test_symbolic_expression`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify( { expr: expr || '' } )
    })
    return res.json()
  }

  async getBackendLogs( projectName, purge = true ){
    try{
      this._loading.value = true
      const uuid = this.getUserUuid()
      const res = await fetch(`${this.baseUrl}/logs/${uuid}_${projectName}?purge=${purge}`, {
        headers: this.requestHeaders,
        method: 'GET',
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'getBackendLogs error', e );
      return { success: false, logs: [] }
    } finally {
      this._loading.value = false
    }
  }
}

// shared instance: every import gets the same one
export const api = new ApiConnector()
