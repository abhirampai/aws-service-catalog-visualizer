import { expect, test, type Page } from '@playwright/test'

const editableTemplate = `AWSTemplateFormatVersion: '2010-09-09'
Metadata:
  Playground:
    ProductName: Browser test product
    ProductDescription: Generated from the visible template editor.
Parameters:
  ApplicationName:
    Type: String
    Description: Name for the application.
    MinLength: 3
    Default: playground-app
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev
  OwnerName:
    Type: String
    Description: Person responsible for the product.
    MinLength: 3
  InstanceCount:
    Type: Number
    MinValue: 1
    MaxValue: 10
    Default: 2
  AvailabilityZones:
    Type: List<AWS::EC2::AvailabilityZone::Name>
`

async function replaceEditorContents(page: Page, source: string) {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(source)
}

test('loads, edits, validates, and reviews a local provisioning workflow', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Load sample' }).click()
  await replaceEditorContents(page, editableTemplate)

  await expect(page.getByLabel('Owner name')).toBeVisible()
  await page.getByLabel('Owner name').fill('Abhiram')
  await page.getByLabel('Availability zones').selectOption(['us-east-1a', 'us-east-1b'])
  await page.getByRole('button', { name: 'Review payload' }).click()

  await expect(page.getByRole('heading', { name: 'Review payload' })).toBeVisible()
  await expect(page.locator('.review-payload pre')).toContainText('"OwnerName": "Abhiram"')
  await expect(page.locator('.review-payload')).toContainText('Nothing is sent to AWS or provisioned.')

  await replaceEditorContents(page, 'Parameters:\n  Broken: [')

  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible()
  await expect(page.getByText(/Error:/)).toBeVisible()
  await expect(page.getByLabel('Owner name')).toBeVisible()
})

test('stacks the editor and preview panes on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto('/')

  const panesAreStacked = await page.locator('.workspace').evaluate((workspace) => {
    const panels = Array.from(workspace.children) as HTMLElement[]
    return panels.length === 2 && panels[1].offsetTop > panels[0].offsetTop + panels[0].offsetHeight - 1
  })

  expect(panesAreStacked).toBe(true)
})
