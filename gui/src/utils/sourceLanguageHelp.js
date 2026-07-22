const PROFILE_PLACEMENTS = Object.freeze({
  custom_function: ['node', 'edge', 'floating', 'variable'],
  numeric_expression: ['node', 'edge', 'floating', 'variable'],
  query_predicate: ['query'],
  symbolic_expression: ['symbolic'],
})

function inlineCode(value) {
  const source = String(value ?? '')
  const fence = source.includes('`') ? '``' : '`'
  return `${fence}${source}${fence}`
}

function operationNames(definitions = []) {
  return definitions.map(definition => inlineCode(definition.syntax || definition.name)).join(', ')
}

function contextRows(catalog, profile) {
  const placements = PROFILE_PLACEMENTS[profile] || []
  const seen = new Set()
  const rows = []
  placements.forEach(placement => {
    const definitions = catalog?.contexts?.[placement] || []
    definitions.forEach(context => {
      if (seen.has(context.name)) return
      seen.add(context.name)
      const unit = context.unit ? ` (${context.unit})` : ''
      rows.push(`- ${inlineCode(context.syntax || context.name)}${unit}: ${context.description}`)
    })
  })
  return rows
}

function limitsText(limits = {}) {
  return [
    `${limits.source_bytes ?? 4096} source bytes`,
    `${limits.ast_nodes ?? 256} AST nodes (${limits.symbolic_ast_nodes ?? 128} for Symbolic)`,
    `depth ${limits.ast_depth ?? 32}`,
    `${limits.function_arguments ?? 8} function arguments`,
    `${limits.call_operands ?? 8} call operands`,
    `${limits.literal_elements ?? 256} literal elements`,
  ].join('; ')
}

function functionHelp(catalog) {
  const forms = catalog?.function_forms || []
  const curry = catalog?.comparison_currying || {}
  const examples = [...new Set([
    ...forms.map(form => form.example),
    ...(curry.examples || []),
  ].filter(Boolean))]
  return [
    '### Function forms',
    '',
    '```julia',
    ...examples,
    '```',
    '',
    `${curry.direction || 'Comparison currying uses Julia Fix2 direction.'} `
      + `The exact operators are ${operationNames((curry.operators || []).map(name => ({ name })))}. `
      + 'Currying is allowed only at the function root.',
  ]
}

export function sourceLanguageHelpMarkdown(catalog, profile = 'custom_function') {
  if (!catalog) {
    return 'Restricted Julia language metadata is loading.'
  }

  const lines = []
  if (profile === 'custom_function' || profile === 'query_predicate') {
    lines.push(...functionHelp(catalog), '')
  }

  const context = contextRows(catalog, profile)
  lines.push('### Context', '')
  if (context.length) lines.push(...context)
  else lines.push('This profile has no protocol context bindings.')
  lines.push('')

  const ordinary = catalog.operations?.ordinary || []
  const symbolic = catalog.operations?.symbolic || []
  lines.push('### Allowed language', '')
  lines.push(`Operations and direct functions: ${operationNames(ordinary)}.`)
  if (profile === 'symbolic_expression') {
    lines.push(`Symbolic operations: ${operationNames(symbolic)}.`)
    const atomNames = (catalog.symbolic?.atoms || []).map(atom => inlineCode(atom.name)).join(', ')
    const constructors = (catalog.symbolic?.constructors || [])
      .map(constructor => `${inlineCode(constructor.name)} (arity ${constructor.arity})`)
      .join(', ')
    if (atomNames) lines.push(`Symbolic atoms: ${atomNames}.`)
    if (constructors) lines.push(`Eligible constructors: ${constructors}.`)
    if (catalog.symbolic?.states_zoo) lines.push(catalog.symbolic.states_zoo)
  }
  lines.push(`Constants: ${operationNames(catalog.constants || [])}.`)
  lines.push('')

  const nonFinite = catalog.non_finite_float64 || {}
  lines.push('### Float64 and limits', '')
  lines.push(nonFinite.description || 'Float64 expressions follow normal IEEE Inf and NaN behavior.')
  lines.push(
    `Use ${inlineCode('Inf')}, ${inlineCode('-Inf')}, ${inlineCode('NaN')}, `
      + `${inlineCode('isfinite')}, ${inlineCode('isinf')}, and ${inlineCode('isnan')}.`,
  )
  if (catalog.virtual_edge_note && ['custom_function', 'numeric_expression'].includes(profile)) {
    lines.push(catalog.virtual_edge_note)
  }
  lines.push(`Static limits: ${limitsText(catalog.limits)}.`)
  lines.push('')

  const contract = catalog.result_contracts?.[profile]
  if (contract) lines.push(`Result contract: ${contract}`, '')
  if (Array.isArray(catalog.forbidden_syntax)) {
    lines.push('### Not supported', '', ...catalog.forbidden_syntax.map(item => `- ${item}`), '')
  }
  if (catalog.advanced_guidance) lines.push(catalog.advanced_guidance, '')
  if (catalog.security_note) lines.push(catalog.security_note)
  lines.push(
    '',
    catalog.unsafe_evaluation
      ? 'Server-side evaluation is currently enabled.'
      : 'Server-side evaluation is currently disabled; this language reference remains available.',
  )
  return lines.join('\n')
}
