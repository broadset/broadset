# Model — View Models and Bindings

## Purpose

Defines typed runtime data contracts, sample data, safe expressions, deterministic formatting, property bindings, and repeater instance generation.

## Requirements

### Requirement: View Models

A document `viewModels` array MUST contain stable, uniquely identified view models. Each view model has `id`, `name`, ordered `fields`, and ordered `sampleDataSets`. Field IDs and sample-data IDs MUST be unique within the view model.

#### Acceptance Criteria

- [ ] Given uniquely identified fields and sample data sets, structural validation succeeds
- [ ] Given duplicate field or sample-data IDs, semantic validation fails
- [ ] Given a page sample-data reference, it resolves within the intended view-model contract

### Requirement: Recursive Value Schemas

A view-model field MUST define stable `id`, `name`, recursive typed `schema`, and MAY define label, type-compatible default, and stale policy (`keep-last`, `use-default`, `hide`, or `error`). Value schemas form a closed discriminated union for string, number, integer, boolean, date/time, color, asset, enum, object, and array values with type-specific constraints.

#### Acceptance Criteria

- [ ] Given nested object and array schemas with validating defaults, validation succeeds
- [ ] Given a default that violates its field schema, validation fails
- [ ] Given an unknown value-schema kind or constraint for another kind, structural validation fails

### Requirement: Typed Values

Canonical dynamic values MUST use a `TypedValue` discriminated union for null, boolean, integer, number, string, date-time, length, angle, color, asset, point2d, point3d, list, and object. Numbers MUST be finite; integers MUST be JSON-safe; date-times MUST be timezone-qualified; asset references MUST resolve.

#### Acceptance Criteria

- [ ] Given each typed-value variant with a matching payload, structural validation succeeds
- [ ] Given a non-finite number, unsafe integer, or mismatched payload, validation fails
- [ ] Given an asset typed value referencing a missing asset, semantic validation fails

### Requirement: Stable Property Targets

A binding or override target MUST combine an `EntityAddress` with an RFC 6901 JSON Pointer. Entity addresses contain stable project and entity identity, optional document identity, and optional component instance path. Array indexes MUST NOT serve as durable identity.

The addressed property MUST be schema-approved as overridable, and the expected value type is derived from its schema rather than duplicated on the target.

#### Acceptance Criteria

- [ ] Given a resolving entity and approved pointer, target validation derives the property type
- [ ] Given an invalid escape, missing entity, wrong instance path, or forbidden pointer, validation fails
- [ ] Given a reordered collection, stable target identity continues to address the same entity

### Requirement: Bindings

A binding MUST contain stable `id`, `target`, and a closed `expression`. It MAY contain deterministic formatter pipeline and type-compatible fallback. Binding IDs MUST be unique in the document. Expression result, formatter result, fallback, and target property types MUST be compatible.

#### Acceptance Criteria

- [ ] Given a type-correct expression, formatter, fallback, and target, validation succeeds
- [ ] Given a result or fallback incompatible with the target, semantic validation fails
- [ ] Given duplicate binding IDs, validation fails

### Requirement: Closed Expression AST

Expressions MUST be typed AST nodes: literal, field, variable, unary, binary, conditional, stable-field get, index, or registered safe function. Operators, function IDs, argument counts, operand types, and result types MUST validate. Arbitrary code and unparsed expression strings are forbidden.

Function registries MUST be closed, deterministic, side-effect-free, locale-explicit, and versioned by the core model.

#### Acceptance Criteria

- [ ] Given a valid nested conditional expression, type checking produces one deterministic result type
- [ ] Given an unknown operator, function, field, or variable, validation fails
- [ ] Given an expression string or executable function payload, structural validation fails

### Requirement: Formatter Pipelines

A formatter pipeline contains ordered stable steps with registered formatter IDs and typed arguments. Formatters MUST be deterministic, side-effect-free, locale-explicit, and type-checked step by step.

#### Acceptance Criteria

- [ ] Given compatible ordered formatter steps, each step consumes the preceding result
- [ ] Given an unknown formatter or incompatible step, validation fails
- [ ] Given identical input and locale, formatting is identical across consumers

### Requirement: Sample and Live Data

Sample data sets MUST validate against their view-model fields before entering canonical state. Live input is runtime data and MUST be validated against the same schemas. Stale policies determine explicit behavior when live values are unavailable.

#### Acceptance Criteria

- [ ] Given valid sample data selected by a page, binding evaluation uses it
- [ ] Given invalid sample or live data, typed diagnostics identify the field
- [ ] Given stale input, the field's declared policy determines keep, default, hide, or error behavior

### Requirement: Repeaters

Repeaters MUST be explicit typed instance-generation and layout definitions. They define a stable item-key rule, item source, direction, wrap or grid behavior, gap, maximum item count, empty state, and overflow behavior. Generated identity MUST be deterministic for the same stable item keys.

#### Acceptance Criteria

- [ ] Given stable item keys, reordering data preserves generated instance identity
- [ ] Given duplicate or missing required item keys, resolution returns typed diagnostics
- [ ] Given more items than the declared maximum, the explicit overflow behavior is applied

### Requirement: Binding Resolution Layer

Sample or live bindings apply after component, page, and variable-mode layers and before state-machine and sequence layers. Every effective value retains binding provenance and fallback use.

#### Acceptance Criteria

- [ ] Given a data value and a page override on the same target, the data binding takes precedence
- [ ] Given a later sequence value, it takes precedence over the binding at that tick
- [ ] Given fallback use, provenance identifies the failed expression and fallback source

## Spec Gaps

- The exact safe-function and formatter registries are versioned implementation deliverables owned by the view-model program.

## Non-Goals

- Network feed configuration or credentials
- Arbitrary scripting
- Persisting current live input in the project snapshot
