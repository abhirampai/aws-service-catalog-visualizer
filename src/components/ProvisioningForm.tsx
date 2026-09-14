import { useEffect, useState } from 'react'
import type { ParameterDefinition } from '../domain/cloudformation/types'
import { createPayload } from '../domain/provisioning/createPayload'
import { validateValues, type FieldErrors } from '../domain/provisioning/validateValues'
import { ParameterField } from './ParameterField'
import { ReviewPayload } from './ReviewPayload'

interface ProvisioningFormProps {
  definitions: ParameterDefinition[]
  warnings: string[]
  onReview: (payload: Record<string, string | string[]>) => void
  productName?: string
  productDescription?: string
}

function valuesFromDefinitions(definitions: ParameterDefinition[]): Record<string, unknown> {
  return Object.fromEntries(definitions.filter((definition) => definition.defaultValue !== undefined).map((definition) => [definition.name, definition.defaultValue]))
}

export function ProvisioningForm({ definitions, warnings, onReview, productName = 'CloudFormation product', productDescription = 'Configure this product' }: ProvisioningFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => valuesFromDefinitions(definitions))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [payload, setPayload] = useState<Record<string, string | string[]> | null>(null)

  useEffect(() => {
    setValues(valuesFromDefinitions(definitions))
    setErrors({})
    setPayload(null)
  }, [definitions])

  const updateValue = (name: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setPayload(null)
  }

  const review = () => {
    const nextErrors = validateValues(definitions, values)
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
      {payload && <ReviewPayload payload={payload} />}
    </div>
  )
}
