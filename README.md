# AWS Service Catalog Provisioning Playground

Browser-based AWS Service Catalog provisioning playground that turns CloudFormation parameters into an interactive, AWS Console-like form preview.

## What It Does

Paste or edit a CloudFormation YAML or JSON template and see its provisioning
experience rendered live. The playground supports parameter defaults, required
fields, allowed values, validation constraints, local review payloads, and
responsive desktop/mobile layouts.

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

Open the displayed local URL, edit the YAML or JSON in the template editor, and
use **Review payload** to inspect the generated request values.

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

The editor accepts CloudFormation YAML and JSON documents. Only the
`Parameters` section is used to generate controls. Supported parameter types
are:

- `String`, including `Default`, `Description`, `AllowedValues`, `MinLength`,
  `MaxLength`, and `AllowedPattern`.
- `Number`, including `Default`, `Description`, `AllowedValues`, `MinValue`,
  and `MaxValue`.
- `List<AWS::EC2::AvailabilityZone::Name>` with multiple selection.

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

## Local-Only Behavior

Parsing, normalization, validation, and payload generation happen in the
browser. The app makes no AWS network calls, does not require credentials, and
does not provision or submit anything. Templates, accounts, and shareable links
are not persisted.

## Unsupported CloudFormation Features

This is not a general CloudFormation interpreter. It does not evaluate or
provision `Resources`, `Mappings`, `Conditions`, `Rules`, `Outputs`, `Hooks`,
`Transform`/macros, intrinsic functions, dynamic references, pseudo
parameters, parameter groups, or AWS account and region metadata. Unsupported
parameter types are omitted or reported as local normalization warnings rather
than sent to AWS.
