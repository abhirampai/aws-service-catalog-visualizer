import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { CloudFormationDocument, ParseDiagnostic, ParseResult } from './types'

function diagnosticFromError(error: unknown, fallbackMessage: string): ParseDiagnostic {
  if (typeof error !== 'object' || error === null) {
    return { message: fallbackMessage, severity: 'error' }
  }

  const candidate = error as { message?: unknown; linePos?: unknown }
  const firstPosition = Array.isArray(candidate.linePos) && candidate.linePos[0] && typeof candidate.linePos[0] === 'object'
    ? candidate.linePos[0] as { line?: unknown; col?: unknown }
    : undefined

  return {
    message: typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
    line: typeof firstPosition?.line === 'number' ? firstPosition.line : undefined,
    column: typeof firstPosition?.col === 'number' ? firstPosition.col : undefined,
    severity: 'error',
  }
}

function jsonLocation(source: string, error: unknown): Pick<ParseDiagnostic, 'line' | 'column'> {
  const message = error instanceof Error ? error.message : ''
  const positionMatch = message.match(/position\s+(\d+)/i)
  const offset = positionMatch ? Number(positionMatch[1]) : source.length
  const beforePosition = source.slice(0, Math.min(offset, source.length))
  const line = beforePosition.split('\n').length
  const lastNewline = beforePosition.lastIndexOf('\n')
  return { line, column: offset - lastNewline }
}

const intrinsicTagMap = {
  '!And': 'Fn::And',
  '!Base64': 'Fn::Base64',
  '!Cidr': 'Fn::Cidr',
  '!Equals': 'Fn::Equals',
  '!FindInMap': 'Fn::FindInMap',
  '!GetAtt': 'Fn::GetAtt',
  '!GetAZs': 'Fn::GetAZs',
  '!If': 'Fn::If',
  '!ImportValue': 'Fn::ImportValue',
  '!Join': 'Fn::Join',
  '!Not': 'Fn::Not',
  '!Or': 'Fn::Or',
  '!Ref': 'Ref',
  '!Select': 'Fn::Select',
  '!Split': 'Fn::Split',
  '!Sub': 'Fn::Sub',
} as const

function intrinsicForTag(tag: unknown): string | undefined {
  return typeof tag === 'string' ? intrinsicTagMap[tag as keyof typeof intrinsicTagMap] : undefined
}

function valueFromYamlNode(node: unknown): unknown {
  const intrinsic = intrinsicForTag((node as { tag?: unknown })?.tag)
  if (isScalar(node)) {
    const value = node.value
    return intrinsic ? { [intrinsic]: value } : value
  }
  if (isSeq(node)) {
    const value = node.items.map((item) => valueFromYamlNode(item))
    return intrinsic ? { [intrinsic]: value } : value
  }
  if (isMap(node)) {
    const value = Object.fromEntries(node.items.flatMap((item) => {
      if (!isScalar(item.key)) return []
      return [[String(item.key.value), valueFromYamlNode(item.value)]]
    }))
    return intrinsic ? { [intrinsic]: value } : value
  }
  return undefined
}

export function parseTemplate(source: string): ParseResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return { diagnostics: [{ message: 'Template is empty.', severity: 'error' }] }
  }

  const firstCharacter = trimmed[0]
  if (firstCharacter === '{' || firstCharacter === '[') {
    try {
      const value: unknown = JSON.parse(trimmed)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { diagnostics: [{ message: 'Template root must be an object.', severity: 'error' }] }
      }
      return { document: value as CloudFormationDocument, diagnostics: [] }
    } catch (error) {
      const diagnostic = diagnosticFromError(error, 'Invalid JSON template.')
      diagnostic.message = `JSON parse error: ${diagnostic.message}`
      Object.assign(diagnostic, jsonLocation(trimmed, error))
      return { diagnostics: [diagnostic] }
    }
  }

  try {
    const parsed = parseDocument(trimmed)
    if (parsed.errors.length > 0) {
      return { diagnostics: parsed.errors.map((error) => diagnosticFromError(error, 'Invalid YAML template.')) }
    }

    const value: unknown = valueFromYamlNode(parsed.contents)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { diagnostics: [{ message: 'Template root must be an object.', severity: 'error' }] }
    }
    return { document: value as CloudFormationDocument, diagnostics: [] }
  } catch (error) {
    return { diagnostics: [diagnosticFromError(error, 'Invalid YAML template.')] }
  }
}
