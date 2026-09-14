import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App shell', () => {
  it('renders the page heading and both workspace regions', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Template editor' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Provisioning preview' })).toBeInTheDocument()
  })
})
