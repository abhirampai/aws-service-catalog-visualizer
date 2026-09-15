import { describe, expect, it } from 'vitest'
import type { ParameterDefinition, RuleDefinition } from '../cloudformation/types'
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

  it('rejects availability zones outside AllowedValues', () => {
    const definition: ParameterDefinition = {
      name: 'AvailabilityZones',
      label: 'Availability Zones',
      type: 'List<AWS::EC2::AvailabilityZone::Name>',
      required: true,
      options: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
      allowedValues: ['us-east-1a', 'us-east-1b'],
      constraints: {},
    }

    expect(validateValues([definition], {
      AvailabilityZones: ['us-east-1a', 'us-east-1c'],
    })).toEqual({
      AvailabilityZones: 'Must be one of: us-east-1a, us-east-1b.',
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

  it('reports failing rule assertions on each referenced field', () => {
    const definitions: ParameterDefinition[] = [
      stringDefinition({ name: 'Environment', label: 'Environment', allowedValues: ['dev', 'prod'], required: true }),
      {
        name: 'InstanceCount',
        label: 'Instance Count',
        type: 'Number',
        required: true,
        constraints: {},
      },
    ]
    const rules: RuleDefinition[] = [
      {
        name: 'ProdNeedsTwoInstances',
        assertions: [
          {
            assert: {
              'Fn::Or': [
                { 'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] }] },
                { 'Fn::Equals': [{ Ref: 'InstanceCount' }, 2] },
              ],
            },
            description: 'Production requires two instances.',
            parameterNames: ['Environment', 'InstanceCount'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, {
      Environment: 'prod',
      InstanceCount: '1',
    }, rules)).toEqual({
      Environment: 'Production requires two instances.',
      InstanceCount: 'Production requires two instances.',
    })

    expect(validateValues(definitions, {
      Environment: 'prod',
      InstanceCount: '2',
    }, rules)).toEqual({})
  })

  it('skips assertions when a rule condition is false', () => {
    const definitions = [stringDefinition({ name: 'Environment', label: 'Environment', required: true })]
    const rules: RuleDefinition[] = [
      {
        name: 'ProdOnlyRule',
        condition: { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
        assertions: [
          {
            assert: { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
            description: 'Environment must be prod.',
            parameterNames: ['Environment'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, { Environment: 'dev' }, rules)).toEqual({})
  })

  it('still evaluates assertions when a rule condition is unsupported locally', () => {
    const definitions = [stringDefinition({ name: 'Environment', label: 'Environment', required: true })]
    const rules: RuleDefinition[] = [
      {
        name: 'UnsupportedCondition',
        condition: { 'Fn::ValueOfAll': ['AWS::EC2::VPC::Id', 'Tags.Owner'] },
        assertions: [
          {
            assert: { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
            description: 'Environment must be prod.',
            parameterNames: ['Environment'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, { Environment: 'dev' }, rules)).toEqual({
      Environment: 'Environment must be prod.',
    })
  })

  it('treats unsupported nested condition expressions as unknown instead of false', () => {
    const definitions: ParameterDefinition[] = [
      stringDefinition({ name: 'Environment', label: 'Environment', required: true }),
      stringDefinition({ name: 'Owner', label: 'Owner', required: true }),
    ]
    const rules: RuleDefinition[] = [
      {
        name: 'ConditionIncludesUnsupportedOperand',
        condition: {
          'Fn::And': [
            { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
            { 'Fn::ValueOfAll': ['AWS::EC2::VPC::Id', 'Tags.Owner'] },
          ],
        },
        assertions: [
          {
            assert: { 'Fn::Equals': [{ Ref: 'Owner' }, 'platform'] },
            description: 'Owner must be platform.',
            parameterNames: ['Owner'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, { Environment: 'prod', Owner: 'dev-team' }, rules)).toEqual({
      Owner: 'Owner must be platform.',
    })
  })

  it('does not fail assertions when Fn::And or Fn::Or produce unknown results', () => {
    const definitions = [stringDefinition({ name: 'Environment', label: 'Environment', required: true })]
    const rules: RuleDefinition[] = [
      {
        name: 'UnknownAnd',
        assertions: [
          {
            assert: {
              'Fn::And': [
                { 'Fn::Equals': [{ Ref: 'Environment' }, 'dev'] },
                { 'Fn::ValueOfAll': ['AWS::EC2::VPC::Id', 'Tags.Owner'] },
              ],
            },
            description: 'Unknown Fn::And should not be treated as false.',
            parameterNames: ['Environment'],
          },
        ],
      },
      {
        name: 'UnknownOr',
        assertions: [
          {
            assert: {
              'Fn::Or': [
                { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
                { 'Fn::ValueOfAll': ['AWS::EC2::VPC::Id', 'Tags.Owner'] },
              ],
            },
            description: 'Unknown Fn::Or should not be treated as false.',
            parameterNames: ['Environment'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, { Environment: 'dev' }, rules)).toEqual({})
  })

  it('evaluates Fn::Contains for list membership from literal and Ref values', () => {
    const definitions = [
      stringDefinition({ name: 'SelectedZone', label: 'Selected Zone', required: true }),
      {
        name: 'AvailabilityZones',
        label: 'Availability Zones',
        type: 'List<AWS::EC2::AvailabilityZone::Name>',
        required: true,
        options: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
        constraints: {},
      } satisfies ParameterDefinition,
    ]
    const rules: RuleDefinition[] = [
      {
        name: 'ContainsChecks',
        assertions: [
          {
            assert: {
              'Fn::Contains': [['us-east-1a', 'us-east-1b'], { Ref: 'SelectedZone' }],
            },
            description: 'Selected zone must be supported.',
            parameterNames: ['SelectedZone'],
          },
          {
            assert: {
              'Fn::Contains': [{ Ref: 'AvailabilityZones' }, 'us-east-1a'],
            },
            description: 'Availability zones must include us-east-1a.',
            parameterNames: ['AvailabilityZones'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, {
      SelectedZone: 'us-east-1a',
      AvailabilityZones: ['us-east-1a', 'us-east-1c'],
    }, rules)).toEqual({})

    expect(validateValues(definitions, {
      SelectedZone: 'us-west-2a',
      AvailabilityZones: ['us-east-1b', 'us-east-1c'],
    }, rules)).toEqual({
      SelectedZone: 'Selected zone must be supported.',
      AvailabilityZones: 'Availability zones must include us-east-1a.',
    })
  })

  it('evaluates Fn::EachMemberEquals and Fn::EachMemberIn for Ref-backed lists', () => {
    const definitions: ParameterDefinition[] = [
      {
        name: 'SelectedEnvironments',
        label: 'Selected Environments',
        type: 'CommaDelimitedList',
        required: true,
        constraints: {},
      },
      {
        name: 'ApprovedEnvironments',
        label: 'Approved Environments',
        type: 'CommaDelimitedList',
        required: true,
        constraints: {},
      },
    ]
    const rules: RuleDefinition[] = [
      {
        name: 'EnvironmentMembershipRules',
        assertions: [
          {
            assert: { 'Fn::EachMemberEquals': [{ Ref: 'SelectedEnvironments' }, 'prod'] },
            description: 'Every selected environment must be prod.',
            parameterNames: ['SelectedEnvironments'],
          },
          {
            assert: { 'Fn::EachMemberIn': [{ Ref: 'SelectedEnvironments' }, { Ref: 'ApprovedEnvironments' }] },
            description: 'Selected environments must all be approved.',
            parameterNames: ['SelectedEnvironments', 'ApprovedEnvironments'],
          },
        ],
      },
    ]

    expect(validateValues(definitions, {
      SelectedEnvironments: 'prod,prod',
      ApprovedEnvironments: 'dev,prod',
    }, rules)).toEqual({})

    expect(validateValues(definitions, {
      SelectedEnvironments: 'prod,stage',
      ApprovedEnvironments: 'prod,dev',
    }, rules)).toEqual({
      SelectedEnvironments: 'Every selected environment must be prod. Selected environments must all be approved.',
      ApprovedEnvironments: 'Selected environments must all be approved.',
    })
  })
})
