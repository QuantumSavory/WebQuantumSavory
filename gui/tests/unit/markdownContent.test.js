import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MarkdownContent from '../../src/components/ui/MarkdownContent.vue'

describe('MarkdownContent', () => {
  it('renders safe read-only Markdown as an independently mountable primitive', () => {
    const wrapper = mount(MarkdownContent, {
      attrs: {
        'aria-label': 'Release notes',
        'data-testid': 'release-notes',
      },
      props: {
        content: [
          '# Release notes',
          '- Safe item',
          '<script>alert(1)</script>',
        ].join('\n\n'),
      },
    })

    expect(wrapper.attributes('aria-label')).toBe('Release notes')
    expect(wrapper.attributes('data-testid')).toBe('release-notes')
    expect(wrapper.get('h1').text()).toBe('Release notes')
    expect(wrapper.get('li').text()).toBe('Safe item')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })
})
