import type { ParameterDefinition } from '../cloudformation/types'

const availabilityZoneType = 'List<AWS::EC2::AvailabilityZone::Name>'

export function createPayload(
  definitions: ParameterDefinition[],
  values: Record<string, unknown>,
): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = {}

  for (const definition of definitions) {
    const value = values[definition.name]
    if (value === undefined) {
      continue
    }

    if (definition.type === availabilityZoneType) {
      payload[definition.name] = Array.isArray(value) ? value.map(String) : [String(value)]
    } else {
      payload[definition.name] = String(value)
    }
  }

  return payload
}
