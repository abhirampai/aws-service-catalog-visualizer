import type { ParameterDefinition } from '../domain/cloudformation/types'

interface ParameterFieldProps {
  definition: ParameterDefinition
  value: unknown
  error?: string
  onChange: (value: string | string[]) => void
}

const availabilityZoneType = 'List<AWS::EC2::AvailabilityZone::Name>'

export function ParameterField({ definition, value, error, onChange }: ParameterFieldProps) {
  const inputId = `parameter-${definition.name}`
  const descriptionId = `${inputId}-description`
  const errorId = `${inputId}-error`
  const describedBy = [definition.description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined
  const isMultiSelect = definition.type === availabilityZoneType
  const options = definition.options ?? definition.allowedValues?.map(String)
  const commonProps = { id: inputId, name: definition.name, 'aria-label': definition.label, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) }

  return (
    <div className={`parameter-field${error ? ' has-error' : ''}`}>
      <label htmlFor={inputId}>
        {definition.label} {definition.required && <span className="required-marker">Required</span>}
      </label>
      {definition.description && <p id={descriptionId} className="field-description">{definition.description}</p>}
      {isMultiSelect ? (
        <select
          {...commonProps}
          multiple
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
        >
          {options?.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      ) : options ? (
        <select {...commonProps} value={value === undefined ? '' : String(value)} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select an option</option>
          {options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select>
      ) : (
        <input
          {...commonProps}
          type={definition.type === 'Number' ? 'number' : 'text'}
          value={value === undefined ? '' : String(value)}
          min={definition.constraints.minValue}
          max={definition.constraints.maxValue}
          minLength={definition.constraints.minLength}
          maxLength={definition.constraints.maxLength}
          pattern={definition.constraints.allowedPattern}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {isMultiSelect && <p className="field-helper">Availability zones are fixed local examples; no AWS data is fetched.</p>}
      {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
    </div>
  )
}
