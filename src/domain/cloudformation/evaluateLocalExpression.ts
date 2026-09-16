const supportedIntrinsicFunctions = new Set([
  'Fn::And',
  'Fn::Contains',
  'Fn::EachMemberEquals',
  'Fn::EachMemberIn',
  'Fn::Equals',
  'Fn::FindInMap',
  'Fn::If',
  'Fn::Join',
  'Fn::Not',
  'Fn::Or',
  'Fn::Select',
  'Fn::Split',
  'Fn::Sub',
])

interface LocalEvaluationContext {
  values?: Record<string, unknown>
  mappings?: Record<string, unknown>
  conditions?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]))
  }
  return left === right
}

function listFrom(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
  }
  return undefined
}

function selectIndexFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function stringValueForSubstitution(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.every((item) => isScalar(item)) ? value.map((item) => String(item)).join(',') : undefined
  }
  return isScalar(value) ? String(value) : undefined
}

function substituteTemplate(
  template: string,
  variables: Record<string, unknown>,
  values: Record<string, unknown>,
): string | undefined {
  let unresolved = false
  const substituted = template.replace(/\$\{([^}]+)\}/g, (_, rawToken: string) => {
    const token = rawToken.trim()
    const resolved = token in variables
      ? stringValueForSubstitution(variables[token])
      : token.includes('.')
        ? undefined
        : stringValueForSubstitution(values[token])

    if (resolved === undefined) {
      unresolved = true
      return ''
    }
    return resolved
  })

  return unresolved ? undefined : substituted
}

export function expressionName(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  if (record.Ref !== undefined) return 'Ref'
  if (record.Condition !== undefined) return 'Condition'
  return Object.keys(record).find((key) => key.startsWith('Fn::'))
}

export function isSupportedLocalExpression(value: unknown): boolean {
  const name = expressionName(value)
  return name === 'Ref' || name === 'Condition' || (name !== undefined && supportedIntrinsicFunctions.has(name))
}

export function evaluateLocalExpression(
  expression: unknown,
  context: LocalEvaluationContext,
  cache: Map<string, boolean | undefined> = new Map(),
  resolving: Set<string> = new Set(),
): unknown {
  const values = context.values ?? {}
  const mappings = context.mappings ?? {}
  const conditions = context.conditions ?? {}

  const evaluateCondition = (conditionName: string): boolean | undefined => {
    if (cache.has(conditionName)) return cache.get(conditionName)
    if (resolving.has(conditionName)) return undefined
    const conditionExpression = conditions[conditionName]
    if (conditionExpression === undefined) return undefined
    resolving.add(conditionName)
    const result = evaluateLocalBoolean(conditionExpression, context, cache, resolving)
    resolving.delete(conditionName)
    cache.set(conditionName, result)
    return result
  }

  if (Array.isArray(expression)) {
    return expression.map((item) => evaluateLocalExpression(item, context, cache, resolving))
  }
  if (!expression || typeof expression !== 'object') return expression

  const record = expression as Record<string, unknown>

  if (typeof record.Ref === 'string') {
    return values[record.Ref]
  }
  if (typeof record.Condition === 'string') {
    return evaluateCondition(record.Condition)
  }

  if (Object.keys(record).length !== 1) return undefined

  if (record['Fn::Equals'] !== undefined) {
    const args = record['Fn::Equals']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    return valuesEqual(
      evaluateLocalExpression(args[0], context, cache, resolving),
      evaluateLocalExpression(args[1], context, cache, resolving),
    )
  }

  if (record['Fn::Not'] !== undefined) {
    const args = record['Fn::Not']
    if (!Array.isArray(args) || args.length !== 1) return undefined
    const value = evaluateLocalBoolean(args[0], context, cache, resolving)
    return value === undefined ? undefined : !value
  }

  if (record['Fn::And'] !== undefined) {
    const args = record['Fn::And']
    if (!Array.isArray(args) || args.length < 2 || args.length > 10) return undefined
    let hasUnknown = false
    for (const item of args) {
      const value = evaluateLocalBoolean(item, context, cache, resolving)
      if (value === false) return false
      if (value === undefined) hasUnknown = true
    }
    return hasUnknown ? undefined : true
  }

  if (record['Fn::Or'] !== undefined) {
    const args = record['Fn::Or']
    if (!Array.isArray(args) || args.length < 2 || args.length > 10) return undefined
    let hasUnknown = false
    for (const item of args) {
      const value = evaluateLocalBoolean(item, context, cache, resolving)
      if (value === true) return true
      if (value === undefined) hasUnknown = true
    }
    return hasUnknown ? undefined : false
  }

  if (record['Fn::Contains'] !== undefined) {
    const args = record['Fn::Contains']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const list = listFrom(evaluateLocalExpression(args[0], context, cache, resolving))
    if (!list) return undefined
    const target = evaluateLocalExpression(args[1], context, cache, resolving)
    return list.some((item) => valuesEqual(item, target))
  }

  if (record['Fn::EachMemberEquals'] !== undefined) {
    const args = record['Fn::EachMemberEquals']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const list = listFrom(evaluateLocalExpression(args[0], context, cache, resolving))
    if (!list) return undefined
    const target = evaluateLocalExpression(args[1], context, cache, resolving)
    return list.every((item) => valuesEqual(item, target))
  }

  if (record['Fn::EachMemberIn'] !== undefined) {
    const args = record['Fn::EachMemberIn']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const candidates = listFrom(evaluateLocalExpression(args[0], context, cache, resolving))
    const allowed = listFrom(evaluateLocalExpression(args[1], context, cache, resolving))
    if (!candidates || !allowed) return undefined
    return candidates.every((candidate) => allowed.some((item) => valuesEqual(item, candidate)))
  }

  if (record['Fn::FindInMap'] !== undefined) {
    const args = record['Fn::FindInMap']
    if (!Array.isArray(args) || args.length !== 3) return undefined
    const mapName = evaluateLocalExpression(args[0], context, cache, resolving)
    const topLevelKey = evaluateLocalExpression(args[1], context, cache, resolving)
    const secondLevelKey = evaluateLocalExpression(args[2], context, cache, resolving)
    if (!isScalar(mapName) || !isScalar(topLevelKey) || !isScalar(secondLevelKey)) return undefined

    const mapRecord = asRecord(mappings[String(mapName)])
    const topLevelRecord = asRecord(mapRecord?.[String(topLevelKey)])
    const mappedValue = topLevelRecord?.[String(secondLevelKey)]
    return isScalar(mappedValue) || (Array.isArray(mappedValue) && mappedValue.every((item) => isScalar(item)))
      ? mappedValue
      : undefined
  }

  if (record['Fn::If'] !== undefined) {
    const args = record['Fn::If']
    if (!Array.isArray(args) || args.length !== 3 || typeof args[0] !== 'string') return undefined
    const condition = evaluateCondition(args[0])
    if (condition === undefined) return undefined
    return evaluateLocalExpression(condition ? args[1] : args[2], context, cache, resolving)
  }

  if (record['Fn::Join'] !== undefined) {
    const args = record['Fn::Join']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const delimiter = evaluateLocalExpression(args[0], context, cache, resolving)
    const items = evaluateLocalExpression(args[1], context, cache, resolving)
    if (typeof delimiter !== 'string' || !Array.isArray(items) || items.some((item) => !isScalar(item))) return undefined
    return items.map((item) => String(item)).join(delimiter)
  }

  if (record['Fn::Split'] !== undefined) {
    const args = record['Fn::Split']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const delimiter = evaluateLocalExpression(args[0], context, cache, resolving)
    const source = evaluateLocalExpression(args[1], context, cache, resolving)
    if (typeof delimiter !== 'string' || typeof source !== 'string') return undefined
    return source.split(delimiter)
  }

  if (record['Fn::Select'] !== undefined) {
    const args = record['Fn::Select']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const index = selectIndexFrom(evaluateLocalExpression(args[0], context, cache, resolving))
    const items = evaluateLocalExpression(args[1], context, cache, resolving)
    return index === undefined || !Array.isArray(items) ? undefined : items[index]
  }

  if (record['Fn::Sub'] !== undefined) {
    const value = record['Fn::Sub']
    if (typeof value === 'string') {
      return substituteTemplate(value, {}, values)
    }
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string') return undefined
    const variableRecord = asRecord(value[1])
    if (!variableRecord) return undefined
    const variables = Object.fromEntries(Object.entries(variableRecord).map(([name, entry]) => [
      name,
      evaluateLocalExpression(entry, context, cache, resolving),
    ]))
    return substituteTemplate(value[0], variables, values)
  }

  return undefined
}

export function evaluateLocalBoolean(
  expression: unknown,
  context: LocalEvaluationContext,
  cache: Map<string, boolean | undefined> = new Map(),
  resolving: Set<string> = new Set(),
): boolean | undefined {
  const result = evaluateLocalExpression(expression, context, cache, resolving)
  return typeof result === 'boolean' ? result : undefined
}
