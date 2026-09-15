import { describe, expect, it } from 'vitest'
import { parseTemplate } from './parseTemplate'

describe('parseTemplate', () => {
  it('parses a YAML CloudFormation document', () => {
    const result = parseTemplate('AWSTemplateFormatVersion: "2010-09-09"\nParameters:\n  Environment:\n    Type: String\n')

    expect(result).toEqual({
      document: {
        AWSTemplateFormatVersion: '2010-09-09',
        Parameters: { Environment: { Type: 'String' } },
      },
      diagnostics: [],
    })
  })

  it('parses a JSON CloudFormation document', () => {
    const result = parseTemplate('{"Parameters":{"Count":{"Type":"Number"}}}')

    expect(result.document).toEqual({ Parameters: { Count: { Type: 'Number' } } })
    expect(result.diagnostics).toEqual([])
  })

  it('preserves CloudFormation YAML intrinsic tags in long-form object syntax', () => {
    const result = parseTemplate('Resources:\n  Bucket:\n    Type: AWS::S3::Bucket\n    Properties:\n      BucketName: !Ref BucketName\n')

    expect(result.document).toEqual({
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: { Ref: 'BucketName' },
          },
        },
      },
    })
    expect(result.diagnostics).toEqual([])
  })

  it('parses !FindInMap with nested intrinsic values into long-form syntax', () => {
    const result = parseTemplate('Parameters:\n  Environment:\n    Type: String\n    Default: dev\n  AmiId:\n    Type: String\n    Default: !FindInMap [RegionMap, !Ref Environment, Ami]\n')

    expect(result.document).toEqual({
      Parameters: {
        Environment: {
          Type: 'String',
          Default: 'dev',
        },
        AmiId: {
          Type: 'String',
          Default: {
            'Fn::FindInMap': [
              'RegionMap',
              { Ref: 'Environment' },
              'Ami',
            ],
          },
        },
      },
    })
    expect(result.diagnostics).toEqual([])
  })

  it('reports malformed YAML with a one-based line number', () => {
    const result = parseTemplate('Parameters:\n  Name:\n    Type: [String\n')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 3 })
    expect(result.diagnostics[0].message).toBeTruthy()
  })

  it('reports malformed JSON', () => {
    const result = parseTemplate('{\n  "Parameters": }')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 2 })
    expect(result.diagnostics[0].column).toEqual(expect.any(Number))
    expect(result.diagnostics[0].message).toContain('JSON')
  })

  it('rejects an empty document', () => {
    const result = parseTemplate('  \n')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error' })
  })

  it('rejects a scalar root', () => {
    const result = parseTemplate('hello')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error' })
  })
})
