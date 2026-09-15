import type {
  CloudFormationDocument,
  NormalizationResult,
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
  const warnings: string[] = []
  const parameters = document.Parameters

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

      const normalizedDefault = listType
        ? (typeof defaultValue === 'string'
            ? defaultValue.split(',').map((item) => item.trim()).filter(Boolean)
            : Array.isArray(defaultValue) && defaultValue.every((item) => typeof item === 'string')
              ? defaultValue
              : undefined)
        : isScalar(defaultValue) ? defaultValue : undefined

      const definition: ParameterDefinition = {
        name,
        label: labelFor(name),
        type,
        description: typeof raw.Description === 'string' ? raw.Description : undefined,
        defaultValue: normalizedDefault,
        required: !Object.prototype.hasOwnProperty.call(raw, 'Default'),
        allowedValues: Array.isArray(raw.AllowedValues) && raw.AllowedValues.every((item) => isScalar(item))
          ? raw.AllowedValues as Array<string | number>
          : undefined,
        ...(type === availabilityZoneType
          ? { options: LOCAL_AVAILABILITY_ZONES.filter((zone) => !Array.isArray(raw.AllowedValues) || raw.AllowedValues.some((allowed) => String(allowed) === zone)) }
          : {}),
        constraints: constraintsFor(raw),
      }

      definitions.push(definition)
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

  const metadata = document.Metadata
  const playground = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).Playground
    : undefined
  const copy = playground && typeof playground === 'object' && !Array.isArray(playground)
    ? playground as Record<string, unknown>
    : undefined

  return {
    definitions,
    warnings,
    productName: typeof copy?.ProductName === 'string' ? copy.ProductName : 'CloudFormation product',
    productDescription: typeof copy?.ProductDescription === 'string' ? copy.ProductDescription : 'Configure this product',
  }
}
