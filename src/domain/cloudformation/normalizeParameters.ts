import type {
  CloudFormationDocument,
  NormalizationResult,
  OutputDefinition,
  ParameterConstraints,
  ParameterDefinition,
} from './types'

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

function resolveScalar(
  value: unknown,
  mappings: Record<string, unknown>,
  resolveRef: (name: string) => string | number | undefined,
): string | number | undefined {
  if (isScalar(value)) return value

  const record = asRecord(value)
  if (!record) return undefined

  if (typeof record.Ref === 'string') {
    return resolveRef(record.Ref)
  }

  const lookup = record['Fn::FindInMap']
  if (!Array.isArray(lookup) || lookup.length !== 3) return undefined

  const mapName = resolveScalar(lookup[0], mappings, resolveRef)
  const topLevelKey = resolveScalar(lookup[1], mappings, resolveRef)
  const secondLevelKey = resolveScalar(lookup[2], mappings, resolveRef)
  if (mapName === undefined || topLevelKey === undefined || secondLevelKey === undefined) return undefined

  const mapRecord = asRecord(mappings[String(mapName)])
  const topLevelRecord = asRecord(mapRecord?.[String(topLevelKey)])
  const mappedValue = topLevelRecord?.[String(secondLevelKey)]
  return isScalar(mappedValue) ? mappedValue : undefined
}

function warningForUnresolvedFindInMap(
  name: string,
  value: unknown,
  mappings: Record<string, unknown>,
  resolveRef: (name: string) => string | number | undefined,
): string | undefined {
  const record = asRecord(value)
  const lookup = record?.['Fn::FindInMap']
  if (!Array.isArray(lookup) || lookup.length !== 3) {
    return `Parameter ${name} has an invalid Fn::FindInMap default and it was ignored.`
  }

  const mapName = resolveScalar(lookup[0], mappings, resolveRef)
  const topLevelKey = resolveScalar(lookup[1], mappings, resolveRef)
  const secondLevelKey = resolveScalar(lookup[2], mappings, resolveRef)
  if (mapName === undefined || topLevelKey === undefined || secondLevelKey === undefined) {
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
  defaultsByName: Map<string, string | number>,
  resolving: Set<string>,
): string | number | undefined {
  const cachedDefault = defaultsByName.get(name)
  if (cachedDefault !== undefined) return cachedDefault
  if (resolving.has(name)) return undefined

  const parameter = parameterRecords.get(name)
  if (!parameter) return undefined

  const defaultValue = parameter.Default
  if (isScalar(defaultValue)) return defaultValue

  const defaultRecord = asRecord(defaultValue)
  if (!isFindInMap(defaultValue) && typeof defaultRecord?.Ref !== 'string') return undefined

  resolving.add(name)
  const resolvedDefault = resolveScalar(defaultValue, mappings, (refName) =>
    resolveParameterDefault(refName, parameterRecords, mappings, defaultsByName, resolving),
  )
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

function expressionName(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  if (record.Ref !== undefined) return 'Ref'
  return Object.keys(record).find((key) => key.startsWith('Fn::'))
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
  const outputs: OutputDefinition[] = []
  const warnings: string[] = []
  const parameters = document.Parameters
  const mappings = asRecord(document.Mappings) ?? {}
  const defaultsByName = new Map<string, string | number>()
  const parameterRecords = new Map<string, Record<string, unknown>>()

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

      const resolvesFromReference = isFindInMap(defaultValue) || typeof asRecord(defaultValue)?.Ref === 'string'
      const resolveDefaultByName = (parameterName: string) =>
        resolveParameterDefault(parameterName, parameterRecords, mappings, defaultsByName, new Set<string>())
      const resolvedDefault = resolvesFromReference
        ? resolveDefaultByName(name)
        : defaultValue

      if (resolvesFromReference && resolvedDefault === undefined) {
        const warning = isFindInMap(defaultValue)
          ? warningForUnresolvedFindInMap(name, defaultValue, mappings, resolveDefaultByName)
          : `Parameter ${name} has an unresolved Ref default and it was ignored.`
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
      if (isScalar(normalizedDefault)) defaultsByName.set(name, normalizedDefault)
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

      const expression = expressionName(outputValue) ?? 'an unsupported expression'
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
    outputs,
    warnings,
    productName: typeof copy?.ProductName === 'string' ? copy.ProductName : 'CloudFormation product',
    productDescription: typeof copy?.ProductDescription === 'string' ? copy.ProductDescription : 'Configure this product',
  }
}
