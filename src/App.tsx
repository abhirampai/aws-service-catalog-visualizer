import './styles.css'

function App() {
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
        <section className="workspace-panel" aria-labelledby="template-editor-heading">
          <h2 id="template-editor-heading">Template editor</h2>
        </section>
        <section className="workspace-panel" aria-labelledby="provisioning-preview-heading">
          <h2 id="provisioning-preview-heading">Provisioning preview</h2>
        </section>
      </div>
    </main>
  )
}

export default App
