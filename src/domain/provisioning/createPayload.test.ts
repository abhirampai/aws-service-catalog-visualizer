import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../cloudformation/types'
import { createPayload } from './createPayload'

describe('createPayload', () => {
  const definitions: ParameterDefinition[] = [
    {
      name: 'EnvironmentName',
      label: 'Environment Name',
      type: 'String',
      required: true,
      constraints: {},
    },
    {
      name: 'InstanceCount',
      label: 'Instance Count',
      type: 'Number',
      required: true,
      constraints: {},
    },
    {
      name: 'AvailabilityZones',
      label: 'Availability Zones',
      type: 'List<AWS::EC2::AvailabilityZone::Name>',
      required: false,
      options: ['us-east-1a', 'us-east-1b'],
      constraints: {},
    },
    {
      name: 'OptionalValue',
      label: 'Optional Value',
      type: 'String',
      required: false,
      constraints: {},
    },
  ]

  it('stringifies scalar values and preserves availability-zone arrays', () => {
    expect(createPayload(definitions, {
      EnvironmentName: 'prod',
      InstanceCount: 3,
      AvailabilityZones: ['us-east-1a', 'us-east-1b'],
    })).toEqual({
      EnvironmentName: 'prod',
      InstanceCount: '3',
      AvailabilityZones: ['us-east-1a', 'us-east-1b'],
    })
  })

  it('omits absent optional values', () => {
    expect(createPayload(definitions, {
      EnvironmentName: 'prod',
      InstanceCount: 3,
    })).not.toHaveProperty('OptionalValue')
  })
})
