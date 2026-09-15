import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ParameterDefinition } from '../domain/cloudformation/types'
import { SAMPLE_TEMPLATE, TemplateEditor } from './TemplateEditor'
import { ProvisioningForm, reconcileValuesFromDefinitions } from './ProvisioningForm'

const definitions: ParameterDefinition[] = [
  {
    name: 'ProjectName',
    label: 'Project Name',
    type: 'String',
    description: 'Name shown to operators.',
    required: true,
    constraints: { minLength: 3, maxLength: 40, allowedPattern: '^[a-z-]+$' },
  },
  {
    name: 'Environment',
    label: 'Environment',
    type: 'String',
    defaultValue: 'dev',
    required: false,
    allowedValues: ['dev', 'prod'],
    constraints: {},
  },
  {
    name: 'InstanceCount',
    label: 'Instance Count',
    type: 'Number',
    defaultValue: 2,
    required: false,
    constraints: { minValue: 1, maxValue: 5 },
  },
  {
    name: 'AvailabilityZones',
    label: 'Availability Zones',
    type: 'List<AWS::EC2::AvailabilityZone::Name>',
    required: true,
    options: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
    constraints: {},
  },
]

describe('ProvisioningForm', () => {
  it('renders parameter controls, defaults, descriptions, and local zone choices', () => {
    render(<ProvisioningForm definitions={definitions} warnings={[]} onReview={() => undefined} />)

    expect(screen.getByLabelText('Project Name')).toBeInTheDocument()
    expect(screen.getByText('Name shown to operators.')).toBeInTheDocument()
    expect(screen.getAllByText('Required')).toHaveLength(2)
    expect(screen.getByLabelText('Environment')).toHaveValue('dev')
    expect(screen.getByLabelText('Instance Count')).toHaveValue(2)
    expect(screen.getByLabelText('Availability Zones')).toHaveValue([])
    expect(screen.getByText('Availability zones are fixed local examples; no AWS data is fetched.')).toBeInTheDocument()
    expect(screen.getByLabelText('Project Name')).toHaveAttribute('minLength', '3')
    expect(screen.getByLabelText('Project Name')).toHaveAttribute('maxLength', '40')
    expect(screen.getByLabelText('Project Name')).toHaveAttribute('pattern', '^[a-z-]+$')
    expect(screen.getByLabelText('Instance Count')).toHaveAttribute('min', '1')
    expect(screen.getByLabelText('Instance Count')).toHaveAttribute('max', '5')
  })

  it('renders metadata copy and generic fallback copy', () => {
    const { rerender } = render(
      <ProvisioningForm
        definitions={[]}
        warnings={[]}
        onReview={() => undefined}
        productName="Metadata product"
        productDescription="Metadata description"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Metadata product' })).toBeInTheDocument()
    expect(screen.getByText('Metadata description')).toBeInTheDocument()

    rerender(<ProvisioningForm definitions={[]} warnings={[]} onReview={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'CloudFormation product' })).toBeInTheDocument()
    expect(screen.getByText('Configure this product')).toBeInTheDocument()
  })

  it('updates field values and only shows a payload after valid review', async () => {
    const user = userEvent.setup()
    render(<ProvisioningForm definitions={definitions} warnings={['Unsupported parameter omitted.']} onReview={() => undefined} />)

    await user.type(screen.getByLabelText('Project Name'), 'catalog-demo')
    await user.selectOptions(screen.getByLabelText('Availability Zones'), ['us-east-1a', 'us-east-1b'])
    await user.click(screen.getByRole('button', { name: 'Review payload' }))

    expect(screen.getByText('Unsupported parameter omitted.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review payload' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Review payload' })).toHaveTextContent('catalog-demo')
    expect(screen.getByRole('region', { name: 'Review payload' })).toHaveTextContent('us-east-1a')
  })

  it('retains a comma-delimited list default in the control and review payload', async () => {
    const user = userEvent.setup()
    render(<ProvisioningForm definitions={[{
      name: 'AvailabilityZones',
      label: 'Availability Zones',
      type: 'List<AWS::EC2::AvailabilityZone::Name>',
      defaultValue: 'us-east-1a,us-east-1c',
      required: false,
      options: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
      constraints: {},
    }]} warnings={[]} onReview={() => undefined} />)

    expect(screen.getByLabelText('Availability Zones')).toHaveValue(['us-east-1a', 'us-east-1c'])
    await user.click(screen.getByRole('button', { name: 'Review payload' }))

    expect(screen.getByRole('region', { name: 'Review payload' })).toHaveTextContent('us-east-1a')
    expect(screen.getByRole('region', { name: 'Review payload' })).toHaveTextContent('us-east-1c')
  })

  it('blocks review for missing required values and shows a field error', async () => {
    const user = userEvent.setup()
    render(<ProvisioningForm definitions={definitions} warnings={[]} onReview={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Review payload' }))

    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Review payload' })).not.toBeInTheDocument()
  })

  it('preserves entered values while adding fields and refreshing untouched defaults', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ProvisioningForm definitions={definitions.slice(0, 3)} warnings={[]} onReview={() => undefined} />)

    await user.clear(screen.getByLabelText('Project Name'))
    await user.type(screen.getByLabelText('Project Name'), 'catalog-demo')
    expect(screen.getByLabelText('Environment')).toHaveValue('dev')

    rerender(
      <ProvisioningForm
        definitions={[
          ...definitions.slice(0, 1),
          { ...definitions[1], defaultValue: 'prod' },
          ...definitions.slice(2, 3),
          {
            name: 'OwnerName',
            label: 'Owner Name',
            type: 'String',
            description: 'Person responsible for the product.',
            required: true,
            constraints: { minLength: 3 },
          },
        ]}
        warnings={[]}
        onReview={() => undefined}
      />,
    )

    expect(screen.getByLabelText('Project Name')).toHaveValue('catalog-demo')
    expect(screen.getByLabelText('Environment')).toHaveValue('prod')
    expect(screen.getByLabelText('Owner Name')).toBeInTheDocument()
  })
})

describe('App', () => {
  it('shows normalization warnings beside the editor and preserves metadata copy', async () => {
    const user = userEvent.setup()
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'CloudFormation template' })
    const source = `${SAMPLE_TEMPLATE}\n  UnsupportedList:\n    Type: List<String>\n`

    expect(screen.getByRole('heading', { name: 'Web application baseline' })).toBeInTheDocument()
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('{Backspace}')
    fireEvent.paste(editor, { clipboardData: { getData: () => source } })

    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Template diagnostics' })).toHaveTextContent('unsupported structured or list type'))
  })

  it('retains the last valid form when the edited template becomes invalid', async () => {
    const user = userEvent.setup()
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'CloudFormation template' })

    expect(screen.getByLabelText('Application Name')).toBeInTheDocument()
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('{Backspace}')
    fireEvent.paste(editor, { clipboardData: { getData: () => '{' } })

    await waitFor(() => expect(screen.getByText(/parse error|invalid yaml|root must be an object/i)).toBeInTheDocument())
    expect(screen.getByLabelText('Application Name')).toBeInTheDocument()
  })

  it('updates the preview live for valid template edits without wiping preserved field values', async () => {
    const user = userEvent.setup()
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'CloudFormation template' })
    const updatedTemplate = SAMPLE_TEMPLATE
      .replace('ProductName: Web application baseline', 'ProductName: Live sync product')
      .replace('Default: dev', 'Default: prod')
      .concat(`
  OwnerName:
    Type: String
    Description: Person responsible for the product.
    MinLength: 3
`)

    await user.clear(screen.getByLabelText('Application Name'))
    await user.type(screen.getByLabelText('Application Name'), 'catalog-demo')
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('{Backspace}')
    fireEvent.paste(editor, { clipboardData: { getData: () => updatedTemplate } })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Live sync product' })).toBeInTheDocument())
    expect(screen.getByLabelText('Application Name')).toHaveValue('catalog-demo')
    expect(screen.getByLabelText('Environment')).toHaveValue('prod')
    expect(screen.getByLabelText('Owner Name')).toBeInTheDocument()
  })
})

describe('TemplateEditor', () => {
  it('loads the sample and formats valid YAML or JSON through the controlled callback', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TemplateEditor value='{"Parameters":{"Count":{"Type":"Number"}}}' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Load sample' }))
    expect(onChange).toHaveBeenCalledWith(SAMPLE_TEMPLATE)

    await user.click(screen.getByRole('button', { name: 'Format template' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('Parameters:\n'))
  })
})

describe('reconcileValuesFromDefinitions', () => {
  it('preserves custom values and refreshes untouched defaults for matching parameters', () => {
    const nextDefinitions = [
      definitions[0],
      { ...definitions[1], defaultValue: 'prod' },
      definitions[2],
      {
        name: 'OwnerName',
        label: 'Owner Name',
        type: 'String',
        required: true,
        constraints: { minLength: 3 },
      },
    ] satisfies ParameterDefinition[]

    expect(
      reconcileValuesFromDefinitions(
        { ProjectName: 'catalog-demo', Environment: 'dev', InstanceCount: 4 },
        definitions.slice(0, 3),
        nextDefinitions,
      ),
    ).toEqual({
      ProjectName: 'catalog-demo',
      Environment: 'prod',
      InstanceCount: 4,
    })
  })
})
