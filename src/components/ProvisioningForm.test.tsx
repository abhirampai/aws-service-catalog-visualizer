import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import type { ParameterDefinition } from '../domain/cloudformation/types'
import { ProvisioningForm } from './ProvisioningForm'

const definitions: ParameterDefinition[] = [
  {
    name: 'ProjectName',
    label: 'Project Name',
    type: 'String',
    description: 'Name shown to operators.',
    required: true,
    constraints: {},
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

  it('blocks review for missing required values and shows a field error', async () => {
    const user = userEvent.setup()
    render(<ProvisioningForm definitions={definitions} warnings={[]} onReview={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Review payload' }))

    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Review payload' })).not.toBeInTheDocument()
  })
})

describe('App', () => {
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
})
