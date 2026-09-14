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

  it('reports malformed YAML with a one-based line number', () => {
    const result = parseTemplate('Parameters:\n  Name:\n    Type: [String\n')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 3 })
    expect(result.diagnostics[0].message).toBeTruthy()
  })

  it('reports malformed JSON', () => {
    const result = parseTemplate('{"Parameters":')

    expect(result.document).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error' })
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
