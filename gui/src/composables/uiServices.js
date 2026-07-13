import { inject } from 'vue'

export const UI_SERVICES_KEY = Symbol('web-quantum-savory-ui-services')
export const SIMULATION_EDITING_LOCK_MESSAGE =
  'Reset or stop the simulation before changing the network.'

export function useUiServices() {
  const services = inject(UI_SERVICES_KEY, null)
  if (!services) {
    throw new Error('UI services were not provided by the application root')
  }
  return services
}
