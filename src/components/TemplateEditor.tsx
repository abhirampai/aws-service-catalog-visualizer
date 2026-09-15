import { yaml } from '@codemirror/lang-yaml'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { useEffect, useRef, useState } from 'react'
import { parse, stringify } from 'yaml'
import { parseTemplate } from '../domain/cloudformation/parseTemplate'

export const SAMPLE_TEMPLATE = `AWSTemplateFormatVersion: '2010-09-09'
Description: A local Service Catalog playground product
Metadata:
  Playground:
    ProductName: Web application baseline
    ProductDescription: Configure a small web application for local review.
Parameters:
  ApplicationName:
    Type: String
    Description: Name for the application.
    MinLength: 3
    Default: playground-app
  Environment:
    Type: String
    Description: Deployment environment.
    AllowedValues: [dev, staging, prod]
    Default: dev
  InstanceCount:
    Type: Number
    Description: Number of application instances.
    MinValue: 1
    MaxValue: 10
    Default: 2
  AvailabilityZones:
    Type: List<AWS::EC2::AvailabilityZone::Name>
    Description: Local availability-zone examples.
`

interface TemplateEditorProps {
  value: string
  onChange: (value: string) => void
}

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const [fileError, setFileError] = useState('')
  onChangeRef.current = onChange

  const readFileText = (file: File) => new Promise<string>((resolve, reject) => {
    if (typeof file.text === 'function') {
      file.text().then(resolve, reject)
      return
    }

    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected file.'))
    reader.readAsText(file)
  })

  const loadSelectedFile = async (file?: File) => {
    if (!file) return
    const source = await readFileText(file)
    const result = parseTemplate(source)
    if (!result.document) {
      setFileError('Choose a valid YAML or JSON template file.')
      return
    }

    setFileError('')
    onChangeRef.current(source)
  }

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          yaml(),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          EditorView.contentAttributes.of({ 'aria-label': 'CloudFormation template' }),
          keymap.of([...defaultKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return (
    <div className="editor-shell">
      <div className="editor-actions">
        <button type="button" onClick={() => onChange(SAMPLE_TEMPLATE)}>Load sample</button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>Load file</button>
        <button
          type="button"
          onClick={() => {
            try {
              onChange(stringify(parse(value)))
            } catch {
              onChange(value)
            }
          }}
        >
          Format template
        </button>
      </div>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".yml,.yaml,.json,application/yaml,application/x-yaml,application/json"
        aria-label="Load a CloudFormation template file"
        onChange={async (event) => {
          await loadSelectedFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <label className="sr-only" htmlFor="template-source">CloudFormation template</label>
      <div id="template-source" ref={containerRef} className="code-editor" />
      {fileError && <p className="field-error" role="alert">{fileError}</p>}
    </div>
  )
}
