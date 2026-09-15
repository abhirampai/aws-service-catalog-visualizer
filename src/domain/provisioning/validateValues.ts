import type { ParameterDefinition, RuleDefinition } from '../cloudformation/types'

export type FieldErrors = Record<string, string>

const availabilityZoneType = 'List<AWS::EC2::AvailabilityZone::Name>'

function isMissing(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0)
}

function matchesAllowedValue(value: unknown, allowedValue: string | number): boolean {
  return String(value) === String(allowedValue)
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

function evaluateValue(
  expression: unknown,
  values: Record<string, unknown>,
  conditions: Record<string, unknown>,
  cache: Map<string, boolean | undefined> = new Map(),
  resolving: Set<string> = new Set(),
): unknown {
  const evaluateCondition = (conditionName: string): boolean | undefined => {
    if (cache.has(conditionName)) return cache.get(conditionName)
    if (resolving.has(conditionName)) return undefined
    const conditionExpression = conditions[conditionName]
    if (conditionExpression === undefined) return undefined
    resolving.add(conditionName)
    const result = evaluateBoolean(conditionExpression, values, conditions, cache, resolving)
    resolving.delete(conditionName)
    cache.set(conditionName, result)
    return result
  }

  if (Array.isArray(expression)) return expression.map((item) => evaluateValue(item, values, conditions, cache, resolving))
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
      evaluateValue(args[0], values, conditions, cache, resolving),
      evaluateValue(args[1], values, conditions, cache, resolving),
    )
  }

  if (record['Fn::Not'] !== undefined) {
    const args = record['Fn::Not']
    if (!Array.isArray(args) || args.length !== 1) return undefined
    const value = evaluateBoolean(args[0], values, conditions, cache, resolving)
    return value === undefined ? undefined : !value
  }

  if (record['Fn::And'] !== undefined) {
    const args = record['Fn::And']
    if (!Array.isArray(args) || args.length < 2 || args.length > 10) return undefined
    let hasUnknown = false
    for (const item of args) {
      const value = evaluateBoolean(item, values, conditions, cache, resolving)
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
      const value = evaluateBoolean(item, values, conditions, cache, resolving)
      if (value === true) return true
      if (value === undefined) hasUnknown = true
    }
    return hasUnknown ? undefined : false
  }

  if (record['Fn::Contains'] !== undefined) {
    const args = record['Fn::Contains']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const list = listFrom(evaluateValue(args[0], values, conditions, cache, resolving))
    if (!list) return undefined
    const target = evaluateValue(args[1], values, conditions, cache, resolving)
    return list.some((item) => valuesEqual(item, target))
  }

  if (record['Fn::EachMemberEquals'] !== undefined) {
    const args = record['Fn::EachMemberEquals']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const list = listFrom(evaluateValue(args[0], values, conditions, cache, resolving))
    if (!list) return undefined
    const target = evaluateValue(args[1], values, conditions, cache, resolving)
    return list.every((item) => valuesEqual(item, target))
  }

  if (record['Fn::EachMemberIn'] !== undefined) {
    const args = record['Fn::EachMemberIn']
    if (!Array.isArray(args) || args.length !== 2) return undefined
    const candidates = listFrom(evaluateValue(args[0], values, conditions, cache, resolving))
    const allowed = listFrom(evaluateValue(args[1], values, conditions, cache, resolving))
    if (!candidates || !allowed) return undefined
    return candidates.every((candidate) => allowed.some((item) => valuesEqual(item, candidate)))
  }

  return undefined
}

function evaluateBoolean(
  expression: unknown,
  values: Record<string, unknown>,
  conditions: Record<string, unknown>,
  cache: Map<string, boolean | undefined> = new Map(),
  resolving: Set<string> = new Set(),
): boolean | undefined {
  const result = evaluateValue(expression, values, conditions, cache, resolving)
  return typeof result === 'boolean' ? result : undefined
}

function addError(errors: FieldErrors, name: string, message: string) {
  const existing = errors[name]
  if (!existing) {
    errors[name] = message
    return
  }
  if (!existing.includes(message)) {
    errors[name] = `${existing} ${message}`
  }
}

function evaluateRules(
  definitions: ParameterDefinition[],
  rules: RuleDefinition[],
  values: Record<string, unknown>,
  conditions: Record<string, unknown>,
  errors: FieldErrors,
) {
  const ruleValues: Record<string, unknown> = { ...values }
  for (const definition of definitions) {
    const value = values[definition.name]
    if (value === undefined || value === null) continue
    if (definition.type === 'Number') {
      const number = typeof value === 'number' ? value : Number(value)
      ruleValues[definition.name] = Number.isFinite(number) ? number : undefined
      continue
    }
    if (definition.type === availabilityZoneType || definition.type === 'CommaDelimitedList' || definition.type.startsWith('List<')) {
      ruleValues[definition.name] = listFrom(value)?.map(String) ?? []
      continue
    }
    if (!Array.isArray(value)) {
      ruleValues[definition.name] = String(value)
    }
  }

  const definitionNames = new Set(definitions.map((definition) => definition.name))

  for (const rule of rules) {
    if (rule.condition !== undefined && evaluateValue(rule.condition, ruleValues, conditions) === false) continue

    for (const assertion of rule.assertions) {
      const matches = evaluateValue(assertion.assert, ruleValues, conditions)
      if (matches !== false) continue

      const message = assertion.description || `Rule ${rule.name} assertion failed.`
      const targetNames = assertion.parameterNames.filter((parameterName) => definitionNames.has(parameterName))
      if (targetNames.length === 0) continue
      for (const name of targetNames) addError(errors, name, message)
    }
  }
}

export function validateValues(
  definitions: ParameterDefinition[],
  values: Record<string, unknown>,
  rules: RuleDefinition[] = [],
  conditions: Record<string, unknown> = {},
): FieldErrors {
  const errors: FieldErrors = {}

  for (const definition of definitions) {
    const value = values[definition.name]

    if (isMissing(value)) {
      if (definition.required) {
        errors[definition.name] = 'This field is required.'
      }
      continue
    }

    if (definition.type === availabilityZoneType) {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        errors[definition.name] = 'Select at least one availability zone.'
        continue
      }

      if (definition.allowedValues && value.some((item) => !definition.allowedValues?.some((allowedValue) => matchesAllowedValue(item, allowedValue)))) {
        errors[definition.name] = `Must be one of: ${definition.allowedValues.join(', ')}.`
        continue
      }

      const availableOptions = definition.options
      if (availableOptions && value.some((item) => !availableOptions.includes(item))) {
        errors[definition.name] = 'Select only available options.'
      }
      continue
    }

    if (definition.type === 'Number') {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(number)) {
        errors[definition.name] = 'Must be a valid number.'
        continue
      }
      if (definition.constraints.minValue !== undefined && number < definition.constraints.minValue) {
        errors[definition.name] = `Must be at least ${definition.constraints.minValue}.`
        continue
      }
      if (definition.constraints.maxValue !== undefined && number > definition.constraints.maxValue) {
        errors[definition.name] = `Must be no more than ${definition.constraints.maxValue}.`
        continue
      }
    } else {
      const stringValue = String(value)
      if (definition.constraints.minLength !== undefined && stringValue.length < definition.constraints.minLength) {
        errors[definition.name] = `Must be at least ${definition.constraints.minLength} characters.`
        continue
      }
      if (definition.constraints.maxLength !== undefined && stringValue.length > definition.constraints.maxLength) {
        errors[definition.name] = `Must be no more than ${definition.constraints.maxLength} characters.`
        continue
      }
      if (definition.constraints.allowedPattern !== undefined) {
        try {
          if (!new RegExp(definition.constraints.allowedPattern).test(stringValue)) {
            errors[definition.name] = 'Must match the required pattern.'
            continue
          }
        } catch {
          errors[definition.name] = 'Must match the required pattern.'
          continue
        }
      }
    }

    if (definition.allowedValues && !definition.allowedValues.some((allowedValue) => matchesAllowedValue(value, allowedValue))) {
      errors[definition.name] = `Must be one of: ${definition.allowedValues.join(', ')}.`
    }
  }

  evaluateRules(definitions, rules, values, conditions, errors)

  return errors
}
