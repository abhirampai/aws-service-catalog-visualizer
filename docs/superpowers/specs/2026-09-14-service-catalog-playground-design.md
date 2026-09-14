# AWS Service Catalog Provisioning Playground

## Overview

Build a browser-only playground that accepts a CloudFormation YAML or JSON template and renders an AWS Console-like Service Catalog provisioning form from the template's `Parameters` section. The playground is a visualizer only: it does not connect to AWS, persist templates, or provision resources.

## Goals

- Let a user edit or paste a CloudFormation template.
- Generate a live provisioning form from supported CloudFormation parameters.
- Make the generated form resemble the AWS Console provisioning experience.
- Validate template syntax and parameter values locally.
- Show the local parameter payload during review.
- Keep the last valid preview visible while a new template contains syntax errors.
- Work on desktop and mobile layouts.

## Non-goals

- AWS credentials, API calls, or real provisioning.
- Session persistence, accounts, or shareable URLs.
- Full CloudFormation evaluation.
- AWS-specific resource discovery or selectors.
- Mappings, conditions, dynamic references, parameter groups, or labels.
- A separate `service-catalog.yml` schema in the MVP.

## User Flow

1. The user opens the playground and sees a sample CloudFormation template.
2. The user edits or replaces the template in the left editor pane.
3. The app detects YAML or JSON, parses the document, and validates its shape.
4. The app normalizes `Parameters` into an internal parameter model.
5. The right pane renders the provisioning form immediately.
6. The user enters or changes parameter values.
7. The user selects Review/Launch Preview.
8. The app validates values and displays the exact local parameter payload without making a network request.

## Architecture

The app is organized into four boundaries:

### Editor State

Owns the current template text and sample-template loading. It does not parse or interpret CloudFormation.

### Parser

Detects YAML or JSON and returns either a parsed document or line-aware syntax diagnostics. It also validates that the document is an object suitable for parameter extraction.

### Parameter Model

Converts `Parameters` into a stable internal model:

- parameter name
- display label
- CloudFormation type
- description
- default value
- required state
- allowed values
- validation constraints
- unsupported-feature warning, if applicable

The parser and normalizer are pure functions and have no React dependencies.

### Provisioning UI

Renders the internal model, tracks local values, validates them, and generates the review payload. It never reads raw CloudFormation directly.

## Supported Parameter Behavior

- `String` renders as a text input.
- `Number` renders as a numeric input.
- `List<AWS::EC2::AvailabilityZone::Name>` renders as a multi-select control populated from a fixed local example list; the UI explicitly states that the list is not fetched from AWS.
- `AllowedValues` renders as a select control where applicable.
- `Default` supplies the initial value.
- A parameter without `Default` is required.
- `Description` renders as helper text.
- `MinLength` and `MaxLength` validate strings.
- `MinValue` and `MaxValue` validate numbers.
- `AllowedPattern` validates strings client-side.

The initial product name and description come from `Metadata.Playground.ProductName` and `Metadata.Playground.ProductDescription` when present; otherwise the UI uses the generic values "CloudFormation product" and "Configure this product". The MVP does not infer resource behavior from the template.

## Layout

The primary layout is a split workspace:

- Left: editable, syntax-highlighted YAML/JSON template, sample loading, and formatting controls.
- Right: product heading, generated parameter controls, validation state, and review action.

On narrow screens, the panes stack vertically with the editor above the generated form. The form remains interactive in both layouts.

## Error Handling

- Syntax errors show line-aware diagnostics adjacent to the editor.
- The last valid generated form remains visible during syntax errors.
- A valid document without `Parameters` shows an empty state explaining the required input.
- Unsupported parameter types show a warning and use a text input only for scalar values; unsupported list or structured values are omitted from the form and identified in the warning panel.
- Invalid form values show field-level messages and block review.
- Review shows the generated parameter payload and makes clear that it is local only.

## Testing

Unit tests cover:

- YAML and JSON detection.
- Valid parsing and malformed input diagnostics.
- Parameter normalization.
- Supported type mappings.
- Defaults and required-state handling.
- String, number, and pattern constraints.
- Unsupported parameter behavior.
- Payload generation.

UI tests cover:

- Live form regeneration after valid edits.
- Retaining the previous form after invalid edits.
- Field-level validation and review blocking.
- Review payload display.
- Sample template loading.
- Desktop split layout and mobile stacked layout.

## Implementation Approach

Use a client-only React application with a browser-compatible YAML parser and a type-based form component registry. Keep parsing, normalization, validation, and payload generation as small pure modules so the renderer can be extended without coupling it to CloudFormation syntax. Future CloudFormation support or persistence can be added without changing the core provisioning UI contract.

## Success Criteria

- A user can paste a valid CloudFormation YAML or JSON template and see its supported parameters rendered within the same interaction.
- Defaults, required fields, allowed values, descriptions, and core constraints behave correctly.
- Invalid input produces useful diagnostics without destroying the last valid preview.
- Review produces a local payload and never calls AWS.
- The interface remains usable at desktop and mobile widths.
