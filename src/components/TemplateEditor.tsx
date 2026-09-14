import { yaml } from '@codemirror/lang-yaml'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { useEffect, useRef } from 'react'
import { parse, stringify } from 'yaml'

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
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          yaml(),
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
      <label className="sr-only" htmlFor="template-source">CloudFormation template</label>
      <div id="template-source" ref={containerRef} className="code-editor" />
    </div>
  )
}
