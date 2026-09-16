export type CloudFormationDocument = Record<string, unknown>

export type ParameterType = string

export interface ParameterConstraints {
  minLength?: number
  maxLength?: number
  allowedPattern?: string
  minValue?: number
  maxValue?: number
}

export interface ParameterDefinition {
  name: string
  label: string
  type: ParameterType
  description?: string
  defaultValue?: string | number | string[]
  required: boolean
  allowedValues?: Array<string | number>
  options?: string[]
  constraints: ParameterConstraints
}

export interface OutputDefinition {
  name: string
  description?: string
  kind: 'literal' | 'ref' | 'expression' | 'unsupported'
  value?: string | number
  referenceName?: string
  valueExpression?: unknown
  expression?: string
}

export interface RuleAssertionDefinition {
  assert: unknown
  description?: string
  parameterNames: string[]
}

export interface RuleDefinition {
  name: string
  condition?: unknown
  assertions: RuleAssertionDefinition[]
}

export interface ParseDiagnostic {
  message: string
  line?: number
  column?: number
  severity: 'error' | 'warning'
}

export interface ParseResult {
  document?: CloudFormationDocument
  diagnostics: ParseDiagnostic[]
}

export interface NormalizationResult {
  definitions: ParameterDefinition[]
  rules: RuleDefinition[]
  conditions: Record<string, unknown>
  mappings: Record<string, unknown>
  outputs: OutputDefinition[]
  warnings: string[]
  productName: string
  productDescription: string
}
