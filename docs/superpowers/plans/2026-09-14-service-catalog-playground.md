# AWS Service Catalog Provisioning Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only React playground that converts CloudFormation YAML/JSON parameters into an AWS Console-like provisioning form and local review payload.

**Architecture:** Keep the editor state and React rendering separate from pure parsing, normalization, validation, and payload modules. Parse every edit in the browser, retain the last valid model when syntax fails, and render the model in a responsive split workspace.

**Tech Stack:** Vite, React, TypeScript, `yaml`, CodeMirror 6, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-service-catalog-playground-design.md`

## Global Constraints

- Browser-only; never call AWS or require credentials.
- Accept CloudFormation YAML and JSON, using only the `Parameters` section for form generation.
- Support `String`, `Number`, and `List<AWS::EC2::AvailabilityZone::Name>` parameters.
- Keep the last valid generated form visible during syntax errors.
- Use the fixed local availability-zone values `us-east-1a`, `us-east-1b`, and `us-east-1c`, and explicitly say they are not fetched from AWS.
- Do not persist templates, accounts, or shareable links.
- Use `Metadata.Playground.ProductName` and `Metadata.Playground.ProductDescription` for optional product copy, with explicit generic fallbacks.
- Desktop uses a split editor/form workspace; mobile stacks editor above form.

---

### Task 1: Scaffold The React Application

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`
- Create: `vite.config.ts`
- Create: `tsconfig.json`

**Interfaces:**
- Produces the Vite React TypeScript runtime and test configuration used by every later task.

- [ ] **Step 1: Define the project scripts and dependencies**

Include scripts for `dev`, `build`, `test`, `test:watch`, and `test:e2e`. Add React, Vite, TypeScript, `yaml`, CodeMirror packages, Vitest, Testing Library, and Playwright.

- [ ] **Step 2: Add the minimal app shell**

Create an `App` component with an accessible page heading and two empty regions labelled `Template editor` and `Provisioning preview`. Render it from `src/main.tsx`.

- [ ] **Step 3: Add global layout tokens and responsive scaffolding**

Define CSS custom properties, base typography, the split workspace grid, and the mobile breakpoint that changes the grid to one column.

- [ ] **Step 4: Configure tests and verify the shell**

Add `jsdom` setup with Testing Library cleanup, then run:

```bash
yarn install
yarn test --run
yarn build
```

Expected: the test command exits successfully and the production build completes.

The workspace is not currently a git repository, so do not add a commit step until repository initialization is explicitly requested.

### Task 2: Implement Parsing And Parameter Normalization

**Files:**
- Create: `src/domain/cloudformation/types.ts`
- Create: `src/domain/cloudformation/parseTemplate.ts`
- Create: `src/domain/cloudformation/normalizeParameters.ts`
- Create: `src/domain/cloudformation/parseTemplate.test.ts`
- Create: `src/domain/cloudformation/normalizeParameters.test.ts`

**Interfaces:**
- `parseTemplate(source: string): ParseResult`
- `normalizeParameters(document: CloudFormationDocument): NormalizationResult`
- `ParameterDefinition` contains `name`, `label`, `type`, `description`, `defaultValue`, `required`, `allowedValues`, and `constraints`.
- `ParseDiagnostic` contains `message`, optional `line`, optional `column`, and `severity`.

- [ ] **Step 1: Write parser tests for YAML, JSON, malformed input, and document shape**

Cover a YAML template, a JSON template, malformed YAML with a line number, malformed JSON, an empty document, and a scalar root. Assert that valid results contain a document and invalid results contain diagnostics.

- [ ] **Step 2: Run parser tests and verify they fail**

Run `yarn test --run src/domain/cloudformation/parseTemplate.test.ts`. Expected: failures because the parser module does not exist.

- [ ] **Step 3: Implement `parseTemplate`**

Trim the source, detect JSON when the first non-whitespace character is `{` or `[`, parse JSON with native JSON errors, parse YAML with `yaml`, reject null/non-object roots, and convert parser locations into one-based diagnostics.

- [ ] **Step 4: Write normalization tests**

Cover string, number, availability-zone list, defaults, required state, descriptions, allowed values, all five core constraints, metadata product copy, and unsupported scalar/list types.

- [ ] **Step 5: Run normalization tests and verify they fail**

Run `yarn test --run src/domain/cloudformation/normalizeParameters.test.ts`. Expected: failures because normalization is not implemented.

- [ ] **Step 6: Implement `normalizeParameters`**

Read `document.Parameters`, map each definition into `ParameterDefinition`, derive labels from parameter names, mark parameters without `Default` as required, preserve scalar defaults, attach constraints, and classify unsupported scalar values as text warnings while omitting unsupported list/structured values. Read product copy only from `Metadata.Playground`.

- [ ] **Step 7: Run domain tests**

Run `yarn test --run src/domain/cloudformation`. Expected: all parser and normalization tests pass.

### Task 3: Implement Local Value Validation And Review Payloads

**Files:**
- Create: `src/domain/provisioning/validateValues.ts`
- Create: `src/domain/provisioning/createPayload.ts`
- Create: `src/domain/provisioning/validateValues.test.ts`
- Create: `src/domain/provisioning/createPayload.test.ts`

**Interfaces:**
- `validateValues(definitions: ParameterDefinition[], values: Record<string, unknown>): FieldErrors`
- `createPayload(definitions: ParameterDefinition[], values: Record<string, unknown>): Record<string, string | string[]>`
- `FieldErrors` maps parameter names to user-facing validation messages.

- [ ] **Step 1: Write failing validation tests**

Test missing required strings, min/max length, allowed patterns, invalid numbers, min/max values, invalid allowed values, and valid values. Include multi-value availability-zone selections.

- [ ] **Step 2: Run the validation tests and verify failure**

Run `yarn test --run src/domain/provisioning/validateValues.test.ts`. Expected: failures because the validator is absent.

- [ ] **Step 3: Implement `validateValues`**

Return one deterministic message per invalid rule, treat empty required strings as missing, coerce numeric input only for validation, and validate each selected list value against its available options.

- [ ] **Step 4: Write failing payload tests**

Assert that string and number values become strings in the payload and availability-zone selections remain string arrays. Assert that omitted optional values are not added.

- [ ] **Step 5: Implement `createPayload` and run tests**

Convert scalar values to strings, preserve availability-zone selections as string arrays, omit absent optional values, then run `yarn test --run src/domain/provisioning`. Expected: all tests pass.

### Task 4: Build The Editor And Generated Provisioning Form

**Files:**
- Create: `src/components/TemplateEditor.tsx`
- Create: `src/components/ParameterField.tsx`
- Create: `src/components/ProvisioningForm.tsx`
- Create: `src/components/ReviewPayload.tsx`
- Create: `src/components/DiagnosticsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/ProvisioningForm.test.tsx`

**Interfaces:**
- `TemplateEditor` accepts `value` and `onChange`, and emits source text without parsing it.
- `ProvisioningForm` accepts `definitions`, `warnings`, `onReview`, and owns field values and errors.
- `ParameterField` accepts one `ParameterDefinition`, its current value, and an `onChange` handler.
- `ReviewPayload` accepts a payload object and renders JSON with local-only explanatory copy.

- [ ] **Step 1: Write UI tests for valid rendering and field behavior**

Render a sample model and assert labels, descriptions, required indicators, defaults, select controls for allowed values, numeric inputs, the local availability-zone notice, and field updates.

- [ ] **Step 2: Write UI tests for parse-error retention and review blocking**

Drive `App` from a valid template to an invalid one and assert the prior form remains. Submit invalid required data and assert the payload is not shown; submit valid data and assert the local payload appears.

- [ ] **Step 3: Implement `TemplateEditor`**

Use CodeMirror with YAML/JSON-compatible syntax highlighting, an accessible label, and controlled source updates. Add sample loading and format actions without adding persistence.

- [ ] **Step 4: Implement `ParameterField`**

Render text, number, select, and multi-select controls from the parameter type and allowed values. Use `us-east-1a`, `us-east-1b`, and `us-east-1c` as fixed local availability-zone options and show the non-AWS-fetched notice.

- [ ] **Step 5: Implement `ProvisioningForm`, diagnostics, and review**

Initialize values from defaults, call pure validation on review, show field errors, display normalization warnings, and render the payload only when values are valid.

- [ ] **Step 6: Wire `App` parse state**

Initialize with the sample template, parse on every editor change, update the active definitions only on successful parsing, preserve the previous definitions on failure, and show diagnostics beside the editor.

- [ ] **Step 7: Add responsive AWS Console-like styling**

Style headings, sections, helper text, required markers, validation states, review action, and empty states. Keep the editor and preview visually distinct in the desktop split and stacked on mobile.

- [ ] **Step 8: Run component tests**

Run `yarn test --run src/components/ProvisioningForm.test.tsx`. Expected: all component tests pass.

### Task 5: Add End-To-End Verification And Documentation

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/playground.spec.ts`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- The browser workflow must be testable through the visible editor, diagnostics, generated controls, and review payload.

- [ ] **Step 1: Write the end-to-end workflow test**

Test loading the sample, editing a parameter, seeing the generated field, submitting valid values, and viewing the local payload. Test invalid template edits preserve the prior form and show a diagnostic. Test a narrow viewport stacks the panes.

- [ ] **Step 2: Configure Playwright and run the test**

Start the Vite preview server through Playwright webServer configuration, then run `yarn test:e2e`. Expected: the workflow passes in the configured browser.

- [ ] **Step 3: Document usage and supported features**

Document install, development, test, build, supported parameter types, local-only behavior, fixed availability-zone examples, metadata keys, and explicitly unsupported CloudFormation features.

- [ ] **Step 4: Ignore generated local files**

Add dependencies, build output, Playwright artifacts, and `.superpowers/` to `.gitignore` without ignoring source, docs, or tests.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
yarn test --run
yarn build
yarn test:e2e
```

Expected: unit tests, production build, and browser tests all pass.

## Self-Review Checklist

- Parser, normalization, validation, payload, editor, form, error retention, responsive layout, and documentation requirements each have an explicit task.
- No AWS network behavior or persistence is introduced.
- Interfaces use the same `ParameterDefinition` and `FieldErrors` names across tasks.
- The fixed availability-zone behavior and metadata keys are deterministic.
- No placeholder steps or unspecified implementation decisions remain.
