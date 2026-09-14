import './styles.css'
import { useState } from 'react'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { ProvisioningForm } from './components/ProvisioningForm'
import { SAMPLE_TEMPLATE, TemplateEditor } from './components/TemplateEditor'
import { normalizeParameters } from './domain/cloudformation/normalizeParameters'
import { parseTemplate } from './domain/cloudformation/parseTemplate'
import type { NormalizationResult, ParseDiagnostic } from './domain/cloudformation/types'

function initialModel(): { source: string; model: NormalizationResult; diagnostics: ParseDiagnostic[] } {
  const source = SAMPLE_TEMPLATE
  const result = parseTemplate(source)
  return {
    source,
    model: result.document ? normalizeParameters(result.document) : { definitions: [], warnings: [], productName: 'CloudFormation product', productDescription: 'Configure this product' },
    diagnostics: result.diagnostics,
  }
}

function App() {
  const initial = initialModel()
  const [source, setSource] = useState(initial.source)
  const [model, setModel] = useState(initial.model)
  const [diagnostics, setDiagnostics] = useState(initial.diagnostics)

  const handleSourceChange = (nextSource: string) => {
    setSource(nextSource)
    const result = parseTemplate(nextSource)
    setDiagnostics(result.diagnostics)
    if (result.document) setModel(normalizeParameters(result.document))
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">AWS Service Catalog</p>
        <h1>Provisioning Playground</h1>
        <p className="intro">
          Build and review a local provisioning request from a CloudFormation template.
        </p>
      </header>

      <div className="workspace">
        <section className="workspace-panel editor-panel" aria-labelledby="template-editor-heading">
          <h2 id="template-editor-heading">Template editor</h2>
          <p className="panel-helper">Edit YAML or JSON to generate a local provisioning form.</p>
          <TemplateEditor value={source} onChange={handleSourceChange} />
          <DiagnosticsPanel diagnostics={diagnostics} />
        </section>
        <section className="workspace-panel preview-panel" aria-labelledby="provisioning-preview-heading">
          <h2 id="provisioning-preview-heading">Provisioning preview</h2>
          <ProvisioningForm definitions={model.definitions} warnings={model.warnings} productName={model.productName} productDescription={model.productDescription} onReview={() => undefined} />
        </section>
      </div>
    </main>
  )
}

export default App
