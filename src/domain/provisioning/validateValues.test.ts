import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../cloudformation/types'
import { validateValues } from './validateValues'

const stringDefinition = (overrides: Partial<ParameterDefinition> = {}): ParameterDefinition => ({
  name: 'EnvironmentName',
  label: 'Environment Name',
  type: 'String',
  required: true,
  constraints: {},
  ...overrides,
})

describe('validateValues', () => {
  it('reports a missing required string', () => {
    expect(validateValues([stringDefinition()], { EnvironmentName: '' })).toEqual({
      EnvironmentName: 'This field is required.',
    })
  })

  it('reports string length and pattern violations', () => {
    const definition = stringDefinition({
      constraints: { minLength: 3, maxLength: 5, allowedPattern: '^[a-z]+$' },
    })

    expect(validateValues([definition], { EnvironmentName: 'A' })).toEqual({
      EnvironmentName: 'Must be at least 3 characters.',
    })
    expect(validateValues([definition], { EnvironmentName: 'abcdef' })).toEqual({
      EnvironmentName: 'Must be no more than 5 characters.',
    })
    expect(validateValues([definition], { EnvironmentName: 'abc1' })).toEqual({
      EnvironmentName: 'Must match the required pattern.',
    })
  })

  it('reports invalid numbers and numeric range violations', () => {
    const definition: ParameterDefinition = {
      name: 'InstanceCount',
      label: 'Instance Count',
      type: 'Number',
      required: true,
      constraints: { minValue: 1, maxValue: 5 },
    }

    expect(validateValues([definition], { InstanceCount: 'many' })).toEqual({
      InstanceCount: 'Must be a valid number.',
    })
    expect(validateValues([definition], { InstanceCount: '0' })).toEqual({
      InstanceCount: 'Must be at least 1.',
    })
    expect(validateValues([definition], { InstanceCount: 6 })).toEqual({
      InstanceCount: 'Must be no more than 5.',
    })
  })

  it('reports values outside an allowed-values list', () => {
    const definition = stringDefinition({ allowedValues: ['dev', 'prod'] })

    expect(validateValues([definition], { EnvironmentName: 'test' })).toEqual({
      EnvironmentName: 'Must be one of: dev, prod.',
    })
  })

  it('reports unavailable selections for every selected availability zone', () => {
    const definition: ParameterDefinition = {
      name: 'AvailabilityZones',
      label: 'Availability Zones',
      type: 'List<AWS::EC2::AvailabilityZone::Name>',
      required: true,
      options: ['us-east-1a', 'us-east-1b'],
      constraints: {},
    }

    expect(validateValues([definition], {
      AvailabilityZones: ['us-east-1a', 'eu-west-1a'],
    })).toEqual({
      AvailabilityZones: 'Select only available options.',
    })
  })

  it('reports an empty required availability-zone selection', () => {
    const definition: ParameterDefinition = {
      name: 'AvailabilityZones',
      label: 'Availability Zones',
      type: 'List<AWS::EC2::AvailabilityZone::Name>',
      required: true,
      options: ['us-east-1a'],
      constraints: {},
    }

    expect(validateValues([definition], { AvailabilityZones: [] })).toEqual({
      AvailabilityZones: 'This field is required.',
    })
  })

  it('accepts valid scalar, constrained, and multi-value inputs', () => {
    const definitions: ParameterDefinition[] = [
      stringDefinition({
        constraints: { minLength: 2, maxLength: 8, allowedPattern: '^[a-z]+$' },
        allowedValues: ['dev', 'prod'],
      }),
      {
        name: 'InstanceCount',
        label: 'Instance Count',
        type: 'Number',
        required: true,
        allowedValues: [1, 2, 3],
        constraints: { minValue: 1, maxValue: 3 },
      },
      {
        name: 'AvailabilityZones',
        label: 'Availability Zones',
        type: 'List<AWS::EC2::AvailabilityZone::Name>',
        required: true,
        options: ['us-east-1a', 'us-east-1b'],
        constraints: {},
      },
    ]

    expect(validateValues(definitions, {
      EnvironmentName: 'prod',
      InstanceCount: '2',
      AvailabilityZones: ['us-east-1a', 'us-east-1b'],
    })).toEqual({})
  })
})
