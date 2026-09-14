import type { ParseDiagnostic } from '../domain/cloudformation/types'

interface DiagnosticsPanelProps {
  diagnostics: ParseDiagnostic[]
  warnings?: string[]
}

export function DiagnosticsPanel({ diagnostics, warnings = [] }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0 && warnings.length === 0) return null
  return (
    <aside className="diagnostics" aria-label="Template diagnostics">
      <h3>Diagnostics</h3>
      {diagnostics.map((diagnostic, index) => (
        <p key={`${diagnostic.message}-${index}`} className={`diagnostic diagnostic-${diagnostic.severity}`}>
          {diagnostic.severity === 'error' ? 'Error: ' : 'Warning: '}{diagnostic.message}
          {diagnostic.line ? ` (line ${diagnostic.line}${diagnostic.column ? `, column ${diagnostic.column}` : ''})` : ''}
        </p>
      ))}
      {warnings.map((warning) => <p key={warning} className="diagnostic diagnostic-warning">Warning: {warning}</p>)}
    </aside>
  )
}
