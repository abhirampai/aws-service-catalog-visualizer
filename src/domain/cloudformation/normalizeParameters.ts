import type {
  CloudFormationDocument,
  NormalizationResult,
  OutputDefinition,
  ParameterConstraints,
  ParameterDefinition,
  RuleDefinition,
} from './types'
import { evaluateLocalExpression, expressionName, isSupportedLocalExpression, unsupportedLocalExpression } from './evaluateLocalExpression'

const supportedTypes = new Set(['String', 'Number', 'List<AWS::EC2::AvailabilityZone::Name>'])
const availabilityZoneType = 'List<AWS::EC2::AvailabilityZone::Name>'
export const LOCAL_AVAILABILITY_ZONES = ['us-east-1a', 'us-east-1b', 'us-east-1c'] as const

function labelFor(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase())
}

function isScalar(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isFindInMap(value: unknown): value is { 'Fn::FindInMap': unknown } {
  const record = asRecord(value)
  return !!record && Object.prototype.hasOwnProperty.call(record, 'Fn::FindInMap')
}

function warningForUnresolvedFindInMap(
  name: string,
  value: unknown,
  mappings: Record<string, unknown>,
  resolveRef: (name: string) => unknown,
): string | undefined {
  const record = asRecord(value)
  const lookup = record?.['Fn::FindInMap']
  if (!Array.isArray(lookup) || lookup.length !== 3) {
    return `Parameter ${name} has an invalid Fn::FindInMap default and it was ignored.`
  }

  const values = new Proxy({}, {
    get: (_, property) => typeof property === 'string' ? resolveRef(property) : undefined,
  }) as Record<string, unknown>
  const context = { values, mappings }
  const mapName = evaluateLocalExpression(lookup[0], context)
  const topLevelKey = evaluateLocalExpression(lookup[1], context)
  const secondLevelKey = evaluateLocalExpression(lookup[2], context)
  if (!isScalar(mapName) || !isScalar(topLevelKey) || !isScalar(secondLevelKey)) {
    return `Parameter ${name} has an unresolved Fn::FindInMap default and it was ignored.`
  }

  const mapRecord = asRecord(mappings[String(mapName)])
  if (!mapRecord) {
    return `Parameter ${name} references missing mapping ${String(mapName)} in Fn::FindInMap default.`
  }

  const topLevelRecord = asRecord(mapRecord[String(topLevelKey)])
  if (!topLevelRecord) {
    return `Parameter ${name} references missing mapping key ${String(topLevelKey)} in ${String(mapName)}.`
  }

  if (!isScalar(topLevelRecord[String(secondLevelKey)])) {
    return `Parameter ${name} references missing mapping value ${String(secondLevelKey)} in ${String(mapName)}.${String(topLevelKey)}.`
  }

  return undefined
}

function resolveParameterDefault(
  name: string,
  parameterRecords: Map<string, Record<string, unknown>>,
  mappings: Record<string, unknown>,
  conditions: Record<string, unknown>,
  defaultsByName: Map<string, unknown>,
  resolving: Set<string>,
): unknown {
  const cachedDefault = defaultsByName.get(name)
  if (cachedDefault !== undefined) return cachedDefault
  if (resolving.has(name)) return undefined

  const parameter = parameterRecords.get(name)
  if (!parameter) return undefined

  const defaultValue = parameter.Default
  if (isScalar(defaultValue) || Array.isArray(defaultValue)) return defaultValue
  if (!asRecord(defaultValue)) return undefined

  resolving.add(name)
  const values = new Proxy({}, {
    get: (_, property) => typeof property === 'string'
      ? resolveParameterDefault(property, parameterRecords, mappings, conditions, defaultsByName, resolving)
      : undefined,
  }) as Record<string, unknown>
  const resolvedDefault = evaluateLocalExpression(defaultValue, { values, mappings, conditions })
  resolving.delete(name)

  if (resolvedDefault !== undefined) defaultsByName.set(name, resolvedDefault)
  return resolvedDefault
}

function collectRefs(value: unknown, refs: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
    return
  }
  if (!value || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  if (typeof record.Ref === 'string') refs.add(record.Ref)
  for (const entry of Object.values(record)) collectRefs(entry, refs)
}

function collectRuleConditionRefs(
  value: unknown,
  conditions: Record<string, unknown>,
  refs: Set<string>,
  resolvingConditions: Set<string> = new Set(),
) {
  collectRefs(value, refs)
  if (Array.isArray(value)) {
    for (const item of value) collectRuleConditionRefs(item, conditions, refs, resolvingConditions)
    return
  }
  const record = asRecord(value)
  const conditionName = typeof record?.Condition === 'string' ? record.Condition : undefined
  if (conditionName && !resolvingConditions.has(conditionName)) {
    const conditionExpression = conditions[conditionName]
    if (conditionExpression !== undefined) {
      resolvingConditions.add(conditionName)
      collectRuleConditionRefs(conditionExpression, conditions, refs, resolvingConditions)
      resolvingConditions.delete(conditionName)
    }
    return
  }
  if (!record) return
  for (const item of Object.values(record)) collectRuleConditionRefs(item, conditions, refs, resolvingConditions)
}

function unsupportedConditionExpression(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (typeof record.Ref === 'string' && keys.length === 1) return undefined
  if (typeof record.Condition === 'string' && keys.length === 1) return undefined
  if (keys.length !== 1) return 'an unsupported expression'
  const key = keys[0]
  if (!new Set(['Fn::And', 'Fn::Or', 'Fn::Not', 'Fn::Equals']).has(key)) return key

  const args = record[key]
  if (!Array.isArray(args)) return key
  if (key === 'Fn::Equals' && args.length !== 2) return key
  if (key === 'Fn::Not' && args.length !== 1) return key
  if ((key === 'Fn::And' || key === 'Fn::Or') && (args.length < 2 || args.length > 10)) return key

  const validator = key === 'Fn::Equals'
    ? unsupportedConditionOperand
    : unsupportedConditionExpression
  for (const item of args) {
    const unsupported = validator(item)
    if (unsupported) return unsupported
  }

  return undefined
}

function unsupportedConditionOperand(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  return unsupportedConditionExpression(value)
}

function constraintsFor(raw: Record<string, unknown>): ParameterConstraints {
  return {
    ...(optionalNumber(raw.MinLength) === undefined ? {} : { minLength: raw.MinLength as number }),
    ...(optionalNumber(raw.MaxLength) === undefined ? {} : { maxLength: raw.MaxLength as number }),
    ...(typeof raw.AllowedPattern === 'string' ? { allowedPattern: raw.AllowedPattern } : {}),
    ...(optionalNumber(raw.MinValue) === undefined ? {} : { minValue: raw.MinValue as number }),
    ...(optionalNumber(raw.MaxValue) === undefined ? {} : { maxValue: raw.MaxValue as number }),
  }
}

export function normalizeParameters(document: CloudFormationDocument): NormalizationResult {
  const definitions: ParameterDefinition[] = []
  const rules: RuleDefinition[] = []
  const conditions: Record<string, unknown> = {}
  const outputs: OutputDefinition[] = []
  const warnings: string[] = []
  const parameters = document.Parameters
  const mappings = asRecord(document.Mappings) ?? {}
  const defaultsByName = new Map<string, unknown>()
  const parameterRecords = new Map<string, Record<string, unknown>>()
  const rawConditions = document.Conditions

  if (rawConditions && typeof rawConditions === 'object' && !Array.isArray(rawConditions)) {
    for (const [name, value] of Object.entries(rawConditions)) {
      conditions[name] = value
    }
  }

  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    for (const [name, value] of Object.entries(parameters)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parameterRecords.set(name, value as Record<string, unknown>)
      }
    }
  }

  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    for (const [name, value] of Object.entries(parameters)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        warnings.push(`Parameter ${name} has an unsupported definition and was omitted.`)
        continue
      }

      const raw = value as Record<string, unknown>
      const type = typeof raw.Type === 'string' ? raw.Type : 'String'
      const defaultValue = raw.Default
      const supported = supportedTypes.has(type)
      const listType = type === 'CommaDelimitedList' || type.startsWith('List<')

      const unsupportedListOrStructured = listType || (defaultValue !== undefined && !isScalar(defaultValue))
      if (!supported && unsupportedListOrStructured) {
        warnings.push(`Parameter ${name} has an unsupported structured or list type and was omitted.`)
        continue
      }
      if (!supported) {
        warnings.push(`Parameter ${name} uses unsupported type ${type}; it is treated as text.`)
      }

      const defaultExpressionName = expressionName(defaultValue)
      const unsupportedDefaultExpression = unsupportedLocalExpression(defaultValue)
      const resolvesLocally = unsupportedDefaultExpression === undefined && isSupportedLocalExpression(defaultValue)
      const resolveDefaultByName = (parameterName: string) =>
        resolveParameterDefault(parameterName, parameterRecords, mappings, conditions, defaultsByName, new Set<string>())
      const resolvedDefault = resolvesLocally
        ? resolveDefaultByName(name)
        : defaultValue

      if (resolvesLocally && resolvedDefault === undefined) {
        const warning = isFindInMap(defaultValue)
          ? warningForUnresolvedFindInMap(name, defaultValue, mappings, resolveDefaultByName)
          : defaultExpressionName === 'Ref'
            ? `Parameter ${name} has an unresolved Ref default and it was ignored.`
            : `Parameter ${name} has an unresolved ${defaultExpressionName ?? 'expression'} default and it was ignored.`
        if (warning) warnings.push(warning)
      } else if (defaultValue !== undefined && !isScalar(defaultValue) && !Array.isArray(defaultValue) && !resolvesLocally) {
        const warning = isFindInMap(defaultValue) && unsupportedDefaultExpression === 'Fn::FindInMap'
          ? warningForUnresolvedFindInMap(name, defaultValue, mappings, resolveDefaultByName)
          : `Parameter ${name} uses unsupported expression ${unsupportedDefaultExpression ?? defaultExpressionName ?? 'an unsupported expression'} in its default and it was ignored.`
        if (warning) warnings.push(warning)
      }

      const normalizedDefault = listType
        ? (typeof resolvedDefault === 'string'
            ? resolvedDefault.split(',').map((item) => item.trim()).filter(Boolean)
            : Array.isArray(resolvedDefault) && resolvedDefault.every((item) => typeof item === 'string')
              ? resolvedDefault
              : undefined)
        : isScalar(resolvedDefault) ? resolvedDefault : undefined

      const definition: ParameterDefinition = {
        name,
        label: labelFor(name),
        type,
        description: typeof raw.Description === 'string' ? raw.Description : undefined,
        defaultValue: normalizedDefault,
        required: normalizedDefault === undefined,
        allowedValues: Array.isArray(raw.AllowedValues) && raw.AllowedValues.every((item) => isScalar(item))
          ? raw.AllowedValues as Array<string | number>
          : undefined,
        ...(type === availabilityZoneType
          ? { options: LOCAL_AVAILABILITY_ZONES.filter((zone) => !Array.isArray(raw.AllowedValues) || raw.AllowedValues.some((allowed) => String(allowed) === zone)) }
          : {}),
        constraints: constraintsFor(raw),
      }

      definitions.push(definition)
      if (normalizedDefault !== undefined) defaultsByName.set(name, normalizedDefault)
    }
  }

  const existingDefinitionNames = new Set(definitions.map((definition) => definition.name))
  const resources = document.Resources
  if (resources && typeof resources === 'object' && !Array.isArray(resources)) {
    const refs = new Set<string>()
    collectRefs(resources, refs)

    for (const referenceName of refs) {
      if (referenceName.startsWith('AWS::') || existingDefinitionNames.has(referenceName)) continue

      definitions.push({
        name: referenceName,
        label: labelFor(referenceName),
        type: 'String',
        description: 'Derived from Resources section (Ref).',
        required: true,
        constraints: {},
      })
      warnings.push(`Resource reference ${referenceName} is not declared in Parameters and was added as a required text input.`)
      existingDefinitionNames.add(referenceName)
    }
  }

  if (rawConditions && typeof rawConditions === 'object' && !Array.isArray(rawConditions)) {
    for (const [name, value] of Object.entries(rawConditions)) {
      const unsupportedExpression = unsupportedConditionExpression(value)
      if (unsupportedExpression) {
        warnings.push(`Condition ${name} uses unsupported expression ${unsupportedExpression} and cannot be evaluated in local preview.`)
      }
    }
  }

  const rawRules = document.Rules
  if (rawRules && typeof rawRules === 'object' && !Array.isArray(rawRules)) {
    for (const [name, value] of Object.entries(rawRules)) {
      const ruleRecord = asRecord(value)
      if (!ruleRecord || !Array.isArray(ruleRecord.Assertions)) continue
      const conditionRefs = new Set<string>()
      collectRuleConditionRefs(ruleRecord.RuleCondition, conditions, conditionRefs)

      const assertions = ruleRecord.Assertions
        .map((assertion) => asRecord(assertion))
        .flatMap((assertion) => {
          if (!assertion || assertion.Assert === undefined) return []
          const refs = new Set(conditionRefs)
          collectRefs(assertion.Assert, refs)
          return [{
            assert: assertion.Assert,
            description: typeof assertion.AssertDescription === 'string' ? assertion.AssertDescription : undefined,
            parameterNames: Array.from(refs),
          }]
        })

      if (assertions.length === 0) continue
      rules.push({
        name,
        condition: ruleRecord.RuleCondition,
        assertions,
      })
    }
  }

  const rawOutputs = document.Outputs
  if (rawOutputs && typeof rawOutputs === 'object' && !Array.isArray(rawOutputs)) {
    for (const [name, value] of Object.entries(rawOutputs)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        warnings.push(`Output ${name} has an unsupported definition and was omitted.`)
        continue
      }

      const raw = value as Record<string, unknown>
      const outputValue = raw.Value

      if (isScalar(outputValue)) {
        outputs.push({
          name,
          description: typeof raw.Description === 'string' ? raw.Description : undefined,
          kind: 'literal',
          value: outputValue,
        })
        continue
      }

      const outputRecord = asRecord(outputValue)
      if (typeof outputRecord?.Ref === 'string') {
        outputs.push({
          name,
          description: typeof raw.Description === 'string' ? raw.Description : undefined,
          kind: 'ref',
          referenceName: outputRecord.Ref,
        })
        continue
      }

      const unsupportedOutputExpression = unsupportedLocalExpression(outputValue)
      if (unsupportedOutputExpression === undefined && isSupportedLocalExpression(outputValue)) {
        outputs.push({
          name,
          description: typeof raw.Description === 'string' ? raw.Description : undefined,
          kind: 'expression',
          valueExpression: outputValue,
        })
        continue
      }

      const expression = unsupportedOutputExpression ?? expressionName(outputValue) ?? 'an unsupported expression'
      warnings.push(`Output ${name} uses unsupported expression ${expression} and will be shown as unsupported in local preview.`)
      outputs.push({
        name,
        description: typeof raw.Description === 'string' ? raw.Description : undefined,
        kind: 'unsupported',
        expression,
      })
    }
  }

  const metadata = document.Metadata
  const playground = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).Playground
    : undefined
  const copy = playground && typeof playground === 'object' && !Array.isArray(playground)
    ? playground as Record<string, unknown>
    : undefined

  return {
    definitions,
    rules,
    conditions,
    mappings,
    outputs,
    warnings,
    productName: typeof copy?.ProductName === 'string' ? copy.ProductName : 'CloudFormation product',
    productDescription: typeof copy?.ProductDescription === 'string' ? copy.ProductDescription : 'Configure this product',
  }
}
