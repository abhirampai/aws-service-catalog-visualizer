import { describe, expect, it } from 'vitest'
import { normalizeParameters } from './normalizeParameters'
import type { CloudFormationDocument } from './types'

describe('normalizeParameters', () => {
  it('normalizes supported parameters, defaults, descriptions, choices, and constraints', () => {
    const document: CloudFormationDocument = {
      Parameters: {
        EnvironmentName: {
          Type: 'String',
          Description: 'Environment name',
          Default: 'dev',
          AllowedValues: ['dev', 'prod'],
          MinLength: 2,
          MaxLength: 12,
          AllowedPattern: '^[a-z]+$',
        },
        InstanceCount: {
          Type: 'Number',
          Default: 2,
          MinValue: 1,
          MaxValue: 5,
        },
        AvailabilityZones: {
          Type: 'List<AWS::EC2::AvailabilityZone::Name>',
          Default: ['us-east-1a'],
          Description: 'Zones to use',
        },
        RequiredValue: { Type: 'String' },
      },
      Metadata: {
        Playground: {
          ProductName: 'Demo product',
          ProductDescription: 'A demo description',
        },
      },
    }

    const result = normalizeParameters(document)

    expect(result.definitions).toEqual([
      {
        name: 'EnvironmentName',
        label: 'Environment Name',
        type: 'String',
        description: 'Environment name',
        defaultValue: 'dev',
        required: false,
        allowedValues: ['dev', 'prod'],
        constraints: { minLength: 2, maxLength: 12, allowedPattern: '^[a-z]+$' },
      },
      {
        name: 'InstanceCount',
        label: 'Instance Count',
        type: 'Number',
        description: undefined,
        defaultValue: 2,
        required: false,
        allowedValues: undefined,
        constraints: { minValue: 1, maxValue: 5 },
      },
      {
        name: 'AvailabilityZones',
        label: 'Availability Zones',
        type: 'List<AWS::EC2::AvailabilityZone::Name>',
        description: 'Zones to use',
        defaultValue: ['us-east-1a'],
        required: false,
        allowedValues: undefined,
        constraints: {},
      },
      {
        name: 'RequiredValue',
        label: 'Required Value',
        type: 'String',
        description: undefined,
        defaultValue: undefined,
        required: true,
        allowedValues: undefined,
        constraints: {},
      },
    ])
    expect(result.productName).toBe('Demo product')
    expect(result.productDescription).toBe('A demo description')
    expect(result.warnings).toEqual([])
  })

  it('uses generic product copy and warns for unsupported values', () => {
    const result = normalizeParameters({
      Parameters: {
        Flag: { Type: 'AWS::EC2::KeyPair::KeyName', Default: 'key' },
        Structured: { Type: 'Custom::Thing', Default: { value: true } },
        UnsupportedList: { Type: 'List<String>', Default: ['one'] },
      },
      Metadata: { Playground: { ProductName: 'ignored without description' } },
    })

    expect(result.productName).toBe('ignored without description')
    expect(result.productDescription).toBe('Configure this product')
    expect(result.definitions.map(({ name, type, defaultValue }) => ({ name, type, defaultValue }))).toEqual([
      { name: 'Flag', type: 'AWS::EC2::KeyPair::KeyName', defaultValue: 'key' },
    ])
    expect(result.warnings).toHaveLength(3)
    expect(result.warnings.join(' ')).toContain('Structured')
    expect(result.warnings.join(' ')).toContain('UnsupportedList')
  })
})
