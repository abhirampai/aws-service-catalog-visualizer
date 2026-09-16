import { describe, expect, it } from 'vitest'
import { evaluateLocalExpression, unsupportedLocalExpression } from './evaluateLocalExpression'

describe('evaluateLocalExpression', () => {
  it('evaluates the local intrinsic subset against refs, mappings, and conditions', () => {
    const values = {
      ApplicationName: 'catalog-demo',
      Environment: 'prod',
      AvailabilityZones: ['us-east-1a', 'us-east-1c'],
    }
    const mappings = {
      EnvConfig: {
        dev: { Domain: 'dev.internal' },
        prod: { Domain: 'prod.internal' },
      },
    }
    const conditions = {
      IsProd: { 'Fn::Equals': [{ Ref: 'Environment' }, 'prod'] },
    }

    expect(evaluateLocalExpression({ 'Fn::FindInMap': ['EnvConfig', { Ref: 'Environment' }, 'Domain'] }, { values, mappings, conditions })).toBe('prod.internal')
    expect(evaluateLocalExpression({ 'Fn::If': ['IsProd', 'live', 'preview'] }, { values, mappings, conditions })).toBe('live')
    expect(evaluateLocalExpression({ 'Fn::Join': ['-', [{ Ref: 'ApplicationName' }, 'assets']] }, { values, mappings, conditions })).toBe('catalog-demo-assets')
    expect(evaluateLocalExpression({ 'Fn::Split': ['-', 'prod-blue'] }, { values, mappings, conditions })).toEqual(['prod', 'blue'])
    expect(evaluateLocalExpression({ 'Fn::Select': [1, { 'Fn::Split': ['-', 'prod-blue'] }] }, { values, mappings, conditions })).toBe('blue')
    expect(evaluateLocalExpression({ 'Fn::Sub': 'https://${ApplicationName}.${Domain}' }, {
      values: { ...values, Domain: 'example.com' },
      mappings,
      conditions,
    })).toBe('https://catalog-demo.example.com')
    expect(evaluateLocalExpression({ 'Fn::Sub': ['https://${Host}.${Domain}', {
      Host: { Ref: 'ApplicationName' },
      Domain: { 'Fn::FindInMap': ['EnvConfig', { Ref: 'Environment' }, 'Domain'] },
    }] }, { values, mappings, conditions })).toBe('https://catalog-demo.prod.internal')
    expect(evaluateLocalExpression({ 'Fn::Contains': [{ Ref: 'AvailabilityZones' }, 'us-east-1a'] }, { values, mappings, conditions })).toBe(true)
    expect(unsupportedLocalExpression({ 'Fn::FindInMap': ['EnvConfig', { Ref: 'Environment' }, 'Domain'] })).toBeUndefined()
  })

  it('returns undefined for unresolved or unsupported local expressions', () => {
    expect(evaluateLocalExpression({ 'Fn::If': ['MissingCondition', 'yes', 'no'] }, { values: {} })).toBeUndefined()
    expect(evaluateLocalExpression({ 'Fn::Sub': 'arn:${Bucket.Arn}' }, { values: {} })).toBeUndefined()
    expect(evaluateLocalExpression({ 'Fn::GetAtt': ['Bucket', 'Arn'] }, { values: {} })).toBeUndefined()
    expect(evaluateLocalExpression({ 'Fn::Select': [0, 'a,b'] }, { values: {} })).toBeUndefined()
  })
})
