const contextualKeywordDefinitions = [
  {
    id: 'nodeid',
    syntax: 'nodeid("Node name")',
    description: 'Returns the one-based simulator ID of the node with that exact name.',
    availability: 'Available in node, edge, and floating protocol functions.',
    recommendation: 'Use unique node names.'
  },
  {
    id: 'self',
    syntax: 'self',
    description: 'The one-based simulator ID of the current node.',
    availability: 'Available only when the function is assigned to a node protocol.'
  }
]

export const CUSTOM_FUNCTION_CONTEXT_KEYWORDS = Object.freeze(
  contextualKeywordDefinitions.map(keyword => Object.freeze(keyword))
)

export const CUSTOM_FUNCTION_CONTEXT_BY_ID = Object.freeze(
  Object.fromEntries(CUSTOM_FUNCTION_CONTEXT_KEYWORDS.map(keyword => [keyword.id, keyword]))
)
