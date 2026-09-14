import { parseDocument } from 'yaml'
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
      return { diagnostics: [diagnostic] }
    }
  }

  try {
    const parsed = parseDocument(trimmed)
    if (parsed.errors.length > 0) {
      return { diagnostics: parsed.errors.map((error) => diagnosticFromError(error, 'Invalid YAML template.')) }
    }

    const value: unknown = parsed.toJS()
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { diagnostics: [{ message: 'Template root must be an object.', severity: 'error' }] }
    }
    return { document: value as CloudFormationDocument, diagnostics: [] }
  } catch (error) {
    return { diagnostics: [diagnosticFromError(error, 'Invalid YAML template.')] }
  }
}
