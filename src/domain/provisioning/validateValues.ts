import type { ParameterDefinition } from '../cloudformation/types'

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

export function validateValues(
  definitions: ParameterDefinition[],
  values: Record<string, unknown>,
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

  return errors
}
