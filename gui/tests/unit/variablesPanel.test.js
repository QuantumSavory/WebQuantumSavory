import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Variable from '../../src/models/Variable'
import VariablesPanel from '../../src/components/panels/VariablesPanel.vue'
import TypedValueInput from '../../src/components/panels/TypedValueInput.vue'
import { createEmptyProject } from '../../src/utils/projectCodec'

describe('VariablesPanel', () => {
  it('validates custom functions with deferred assignment context', () => {
    const project = createEmptyProject('Variables')
    project.variables.push(new Variable({
      id: 'variable_context',
      name: 'contextual',
      type: 'Lambda',
      value: 'values -> length + Base.length(values)',
    }))

    const wrapper = shallowMount(VariablesPanel, {
      props: {
        variables: project.variables,
        projectData: project,
      },
    })

    expect(wrapper.getComponent(TypedValueInput).props('category')).toBe('variable')
  })
})
