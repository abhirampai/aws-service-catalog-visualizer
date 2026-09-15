# AWS Service Catalog Provisioning Playground

Browser-based AWS Service Catalog provisioning playground that turns CloudFormation parameters into an interactive, AWS Console-like form preview.

## What It Does

Paste, load, or edit a CloudFormation YAML or JSON template and see its
provisioning experience rendered live. The playground supports parameter
defaults, required fields, allowed values, validation constraints, local review
payloads, and responsive desktop/mobile layouts.

Everything runs in the browser. It does not require AWS credentials, make AWS
API calls, provision resources, or persist templates. It is intended for
exploring the form experience, not for provisioning products in AWS.

## Install

```bash
yarn install
```

Install the Playwright browser once when running the end-to-end suite locally:

```bash
yarn playwright install chromium
```

## Development

Start the Vite development server:

```bash
yarn dev
```

Open the displayed local URL, edit the YAML or JSON in the template editor or
load a local `.yml`, `.yaml`, or `.json` template file, and use **Review
payload** to inspect the generated request values.

## Checks

```bash
yarn test --run
yarn build
yarn test:e2e
```

The E2E command starts Vite automatically through Playwright's `webServer`
configuration. The browser tests cover generated fields, validation, parser
diagnostics, retention of the last valid form, local payload review, and the
responsive stacked layout.

## Supported Features

The editor accepts CloudFormation YAML and JSON documents. The preview uses
`Parameters` definitions and also interprets `Resources` references where
supported. Supported parameter and output behavior is:

- `String`, including `Default`, `Description`, `AllowedValues`, `MinLength`,
  `MaxLength`, and `AllowedPattern`.
- `Number`, including `Default`, `Description`, `AllowedValues`, `MinValue`,
  and `MaxValue`.
- `List<AWS::EC2::AvailabilityZone::Name>` with multiple selection.
- `Mappings` lookups used by parameter defaults through `Fn::FindInMap` and
  `Ref`, when they resolve to scalar values.
- Resource `Ref` values are interpreted locally. If a resource references a
  non-pseudo parameter name that is missing from `Parameters`, the preview adds
  a required text field for that name and shows a warning.
- `Outputs` values render in the preview with optional descriptions. Literal
  scalar values are shown directly, and direct `Ref` values use the current
  local preview value when available.

Availability zones use the fixed local examples `us-east-1a`, `us-east-1b`,
and `us-east-1c`. They are not fetched from AWS. Parameters without defaults
are required; supported defaults initialize the generated form.

Optional product copy can be supplied through these exact metadata keys:

```yaml
Metadata:
  Playground:
    ProductName: Web application baseline
    ProductDescription: Configure a small web application for local review.
```

Without those keys, the playground uses the generic product name and
description shown in the form.

Unsupported output expressions such as `Fn::GetAtt`, `Fn::Sub`, and unresolved
AWS-managed values are shown clearly as unsupported local preview values rather
than being sent anywhere or treated as real AWS results.

## Local-Only Behavior

Parsing, normalization, validation, and payload generation happen in the
browser. The app makes no AWS network calls, does not require credentials, and
does not provision or submit anything. Templates, accounts, and shareable links
are not persisted.

## Roadmap

- [Support CloudFormation Rules](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/3)
- [Support CloudFormation Outputs](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/4)
- [Support CloudFormation Conditions](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/5)
- [Support CloudFormation Hooks](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/6)
- [Support CloudFormation Dynamic References](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/7)
- [Support CloudFormation Intrinsic Functions](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/8)
- [Support CloudFormation Transforms and Macros](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/9)
- [Support AWS Account and Region Metadata](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/11)
- [Support CloudFormation Pseudo Parameters](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/12)
- [Support CloudFormation Parameter Groups](https://github.com/abhirampai/aws-service-catalog-visualizer/issues/13)
