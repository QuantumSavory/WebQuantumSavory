import { useId } from 'vue'

export function useDomId(prefix = '') {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return prefix ? `${prefix}-${generatedId}` : generatedId
}
