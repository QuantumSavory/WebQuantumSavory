import Tooltip from 'primevue/tooltip'
import { renderMarkdown } from '../utils/markdown.js'

const lifecycleHooks = [
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeUnmount',
  'unmounted'
]

export function renderTooltipBindingValue(bindingValue) {
  if (typeof bindingValue === 'string') {
    return {
      value: renderMarkdown(bindingValue),
      escape: false
    }
  }

  if (
    bindingValue
    && typeof bindingValue === 'object'
    && typeof bindingValue.value === 'string'
  ) {
    return {
      ...bindingValue,
      value: renderMarkdown(bindingValue.value),
      escape: false
    }
  }

  return bindingValue
}

function renderTooltipBinding(binding) {
  if (!binding) return binding

  return {
    ...binding,
    value: renderTooltipBindingValue(binding.value),
    oldValue: renderTooltipBindingValue(binding.oldValue)
  }
}

const MarkdownTooltip = {}

for (const hook of lifecycleHooks) {
  MarkdownTooltip[hook] = (element, binding, vnode, previousVnode) => (
    Tooltip[hook](
      element,
      renderTooltipBinding(binding),
      vnode,
      previousVnode
    )
  )
}

export default MarkdownTooltip
