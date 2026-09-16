import { useEffect, useRef, useState } from 'react'
import type { OutputDefinition, ParameterDefinition, RuleDefinition } from '../domain/cloudformation/types'
import { evaluateLocalExpression, expressionName } from '../domain/cloudformation/evaluateLocalExpression'
import { createPayload } from '../domain/provisioning/createPayload'
import { validateValues, type FieldErrors } from '../domain/provisioning/validateValues'
import { ParameterField } from './ParameterField'
import { ReviewPayload } from './ReviewPayload'

interface ProvisioningFormProps {
  definitions: ParameterDefinition[]
  rules: RuleDefinition[]
  conditions?: Record<string, unknown>
  mappings?: Record<string, unknown>
  outputs: OutputDefinition[]
  warnings: string[]
  onReview: (payload: Record<string, string | string[]>) => void
  productName?: string
  productDescription?: string
}

const availabilityZoneType = 'List<AWS::EC2::AvailabilityZone::Name>'

function defaultValueForDefinition(definition: ParameterDefinition): string | number | string[] | undefined {
  const value = definition.defaultValue
  return definition.type === availabilityZoneType && typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : value
}

function normalizeValue(definition: ParameterDefinition, value: unknown): string | number | string[] | undefined {
  if (value === undefined) return undefined
  if (definition.type === availabilityZoneType) {
    const selectedValues = Array.isArray(value)
      ? value.map(String)
      : typeof value === 'string'
        ? value.split(',').map((item) => item.trim()).filter(Boolean)
        : []
    const options = definition.options ?? definition.allowedValues?.map(String)
    return options ? selectedValues.filter((item) => options.includes(item)) : selectedValues
  }
  if (value === '') return ''
  if (Array.isArray(value)) return undefined
  if (definition.allowedValues) {
    const stringValue = String(value)
    return definition.allowedValues.some((option) => String(option) === stringValue) ? stringValue : undefined
  }
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function valuesEqual(left: string | number | string[] | undefined, right: string | number | string[] | undefined): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index])
  }
  return left === right
}

function valuesFromDefinitions(definitions: ParameterDefinition[]): Record<string, unknown> {
  return Object.fromEntries(definitions
    .flatMap((definition) => {
      const value = defaultValueForDefinition(definition)
      return value === undefined ? [] : [[definition.name, value]]
    }))
}

function renderedOutputValue(
  output: OutputDefinition,
  values: Record<string, unknown>,
  definitionNames: Set<string>,
  conditions: Record<string, unknown>,
  mappings: Record<string, unknown>,
): string {
  if (output.kind === 'literal') return String(output.value)
  if (output.kind === 'expression') {
    const value = evaluateLocalExpression(output.valueExpression, { values, conditions, mappings })
    if (value === undefined) {
      return `Local preview could not resolve ${expressionName(output.valueExpression) ?? 'this output expression'}.`
    }
    return Array.isArray(value) ? value.join(', ') : String(value)
  }
  if (output.kind === 'unsupported') {
    return `Unsupported local output expression: ${output.expression ?? 'unknown'}.`
  }

  const referenceName = output.referenceName ?? ''
  if (!definitionNames.has(referenceName)) {
    return `Local preview does not resolve Ref ${referenceName}.`
  }

  const value = values[referenceName]
  if (value === undefined || value === '') return `Awaiting a value for Ref ${referenceName}.`
  return Array.isArray(value) ? value.join(', ') : String(value)
}

export function reconcileValuesFromDefinitions(
  currentValues: Record<string, unknown>,
  previousDefinitions: ParameterDefinition[],
  nextDefinitions: ParameterDefinition[],
): Record<string, unknown> {
  const previousDefinitionsByName = new Map(previousDefinitions.map((definition) => [definition.name, definition]))

  return Object.fromEntries(nextDefinitions.flatMap((definition) => {
    const previousDefinition = previousDefinitionsByName.get(definition.name)
    const nextDefaultValue = defaultValueForDefinition(definition)
    if (!previousDefinition) {
      return nextDefaultValue === undefined ? [] : [[definition.name, nextDefaultValue]]
    }

    const currentValue = currentValues[definition.name]
    const previousDefaultValue = defaultValueForDefinition(previousDefinition)
    const normalizedCurrentValue = normalizeValue(definition, currentValue)
    const normalizedPreviousValue = normalizeValue(previousDefinition, currentValue)
    const matchesPreviousDefault = valuesEqual(normalizedPreviousValue, previousDefaultValue)
    const shouldApplyUpdatedDefault = matchesPreviousDefault && !valuesEqual(previousDefaultValue, nextDefaultValue)
    const resolvedValue = normalizedCurrentValue === undefined || shouldApplyUpdatedDefault
      ? nextDefaultValue
      : normalizedCurrentValue

    return resolvedValue === undefined ? [] : [[definition.name, resolvedValue]]
  }))
}

export function ProvisioningForm({ definitions, rules, conditions = {}, mappings = {}, outputs, warnings, onReview, productName = 'CloudFormation product', productDescription = 'Configure this product' }: ProvisioningFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => valuesFromDefinitions(definitions))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [payload, setPayload] = useState<Record<string, string | string[]> | null>(null)
  const previousDefinitionsRef = useRef(definitions)
  const modelSignature = JSON.stringify({ definitions, rules })
  const definitionNames = new Set(definitions.map((definition) => definition.name))

  useEffect(() => {
    setValues((current) => reconcileValuesFromDefinitions(current, previousDefinitionsRef.current, definitions))
    setErrors({})
    setPayload(null)
    previousDefinitionsRef.current = definitions
  }, [modelSignature, definitions])

  const updateValue = (name: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setPayload(null)
  }

  const review = () => {
    const nextErrors = validateValues(definitions, values, rules, conditions)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setPayload(null)
      return
    }
    const nextPayload = createPayload(definitions, values)
    setPayload(nextPayload)
    onReview(nextPayload)
  }

  return (
    <div className="provisioning-content">
      <div className="product-summary">
        <p className="eyebrow">Service Catalog product</p>
        <h3>{productName}</h3>
        <p>{productDescription}</p>
      </div>
      {warnings.length > 0 && <div className="warning-list" aria-label="Normalization warnings">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {definitions.length === 0 ? <p className="empty-state">No supported parameters are available in this template.</p> : (
        <form onSubmit={(event) => { event.preventDefault(); review() }}>
          <div className="parameter-list">
            {definitions.map((definition) => <ParameterField key={definition.name} definition={definition} value={values[definition.name]} error={errors[definition.name] || undefined} onChange={(value) => updateValue(definition.name, value)} />)}
          </div>
          <button className="review-button" type="submit">Review payload</button>
        </form>
      )}
      {outputs.length > 0 && (
        <section className="review-outputs" aria-labelledby="review-outputs-heading">
          <h3 id="review-outputs-heading">CloudFormation outputs</h3>
          <p className="field-helper">Local preview of supported output values and references.</p>
          <dl className="output-list">
            {outputs.map((output) => (
              <div key={output.name} className="output-item">
                <dt>{output.name}</dt>
                {output.description && <p className="field-description">{output.description}</p>}
                <dd>{renderedOutputValue(output, values, definitionNames, conditions, mappings)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {payload && <ReviewPayload payload={payload} />}
    </div>
  )
}
