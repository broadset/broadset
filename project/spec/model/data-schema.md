# Model — Data Schema Specification

## Purpose

Defines the `DataSchema` contract — the document-level data binding declaration that tells operators, playout automation, and live data feeds _what_ data a template accepts. Every `BroadsetDocument` MUST have a `dataSchema`. Elements bind to schema fields via `dataField`, and conditional visibility and repeaters reference schema fields by name. This spec ensures any consumer can enumerate, validate, and feed data to a template from the schema alone. See [conventions](../../README.md).

---

## Requirements

### Requirement: DataSchema Structure

Every document MUST have a `dataSchema` object with:

- `fields`: array of `DataSchemaField` (may be empty — template accepts no external data)
- `description` (optional): human-readable description of the data contract

Field names MUST be unique within the schema. Field names MUST match the pattern `[a-zA-Z_][a-zA-Z0-9_]*` (identifier-safe).

#### Scenario: Schema with multiple fields

- GIVEN a document with `dataSchema: { fields: [{ name: 'playerName', type: 'string' }, { name: 'score', type: 'number' }] }`
- WHEN the schema is validated
- THEN validation succeeds

#### Scenario: Duplicate field names rejected

- GIVEN a schema with two fields both named `'playerName'`
- WHEN the schema is validated
- THEN validation fails

#### Scenario: Empty schema is valid

- GIVEN a document with `dataSchema: { fields: [] }`
- WHEN the document is validated
- THEN validation succeeds (template takes no external data)

#### Acceptance Criteria

- [ ] Given a schema with unique field names, validation succeeds
- [ ] Given duplicate field names, validation fails
- [ ] Given an empty fields array, validation succeeds
- [ ] Given a field name with invalid characters (spaces, special chars), validation fails

---

### Requirement: DataSchemaField Structure

Each field MUST have:

- `name`: identifier-safe string (unique within schema)
- `type`: `'string'` | `'number'` | `'boolean'` | `'image'` | `'color'` | `'date'` | `'array'`
- `label` (optional): human-readable display label for operator UIs
- `defaultValue` (optional): fallback value when no data is provided
- `constraints` (optional): `DataFieldConstraints` object
- `arrayItemSchema` (optional, required when `type: 'array'`): nested `DataSchemaField[]` defining the shape of each array item

#### Scenario: String field with default value

- GIVEN a field `{ name: 'title', type: 'string', label: 'Title Text', defaultValue: 'Untitled' }`
- WHEN no data is provided for this field
- THEN the element displays `'Untitled'`

#### Scenario: Array field with item schema

- GIVEN a field `{ name: 'standings', type: 'array', arrayItemSchema: [{ name: 'team', type: 'string' }, { name: 'points', type: 'number' }] }`
- WHEN data provides an array of team/points objects
- THEN the repeater element generates one instance per array item

#### Acceptance Criteria

- [ ] Given a field with valid name, type, and label, validation succeeds
- [ ] Given a field with an unsupported type, validation fails
- [ ] Given an array field without arrayItemSchema, validation fails
- [ ] Given a field with defaultValue, it is used when no data is provided

---

### Requirement: DataFieldConstraints

Constraints restrict the values a field may receive from external data:

- `required`: boolean — when true, data MUST provide a value for this field
- `minLength` / `maxLength`: for string fields
- `min` / `max`: for number fields (inclusive bounds)
- `pattern`: regex pattern string for string validation
- `enum`: array of allowed values

#### Scenario: Required field missing in data

- GIVEN a field with `constraints: { required: true }`
- WHEN data feed omits this field
- THEN validation warns (or the default value is used if present)

#### Scenario: Number field exceeds max

- GIVEN a field `score` with `constraints: { min: 0, max: 999 }`
- WHEN data provides `score: 1500`
- THEN the value is clamped or rejected based on implementation

#### Acceptance Criteria

- [ ] Given a required field with no data, a warning is emitted or default is used
- [ ] Given a number field with min/max constraints, out-of-range values are handled
- [ ] Given a string field with pattern constraint, non-matching values are rejected
- [ ] Given an enum constraint, only listed values are accepted

---

### Requirement: Element DataField Binding

Elements bind to schema fields via the `dataField` object on the element:

- `fieldName`: MUST reference a field in the document's `dataSchema.fields` by name
- `overflow`: `'clip'` | `'ellipsis'` | `'shrink'` | `'scroll'` — behavior when data exceeds element bounds
- `prefix` (optional): string prepended to the data value for display
- `suffix` (optional): string appended to the data value for display
- `formatPattern` (optional): format string (e.g., `'##,###'` for numbers, `'MMM dd'` for dates)

When live data provides a value for the referenced field, the element's content is updated to that value (with prefix/suffix/format applied).

#### Scenario: Text element bound to player name

- GIVEN a text element with `dataField: { fieldName: 'playerName', overflow: 'ellipsis' }`
- AND `dataSchema.fields` includes `{ name: 'playerName', type: 'string' }`
- WHEN data provides `playerName: 'John Smith'`
- THEN the element content updates to `'John Smith'`

#### Scenario: Number formatting

- GIVEN a text element with `dataField: { fieldName: 'score', overflow: 'clip', formatPattern: '##,###' }`
- WHEN data provides `score: 12345`
- THEN the element content displays `'12,345'`

#### Scenario: Invalid field reference

- GIVEN an element with `dataField: { fieldName: 'nonExistent', overflow: 'clip' }`
- AND `dataSchema.fields` does not contain a field named `'nonExistent'`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a valid fieldName reference, the element binds to the schema field
- [ ] Given an invalid fieldName, validation fails
- [ ] Given prefix and suffix, they are prepended/appended to the display value
- [ ] Given a formatPattern, the value is formatted accordingly
- [ ] Given overflow 'ellipsis', text that exceeds bounds shows an ellipsis

---

### Requirement: Conditional Visibility Expressions

The `visibleWhen` field on an element contains a boolean expression over data schema fields. Expression syntax:

- Field references: bare field names (e.g., `showSubtitle`)
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- Grouping: parentheses `()`
- Literals: `true`, `false`, number literals, single-quoted strings

The expression MUST be validated at document load time. Invalid expressions MUST cause validation to fail. All field references in the expression MUST exist in the document's `dataSchema`.

#### Scenario: Simple boolean field

- GIVEN `visibleWhen: 'showLogo == true'` and `dataSchema` includes `{ name: 'showLogo', type: 'boolean' }`
- WHEN data provides `showLogo: false`
- THEN the element is hidden

#### Scenario: Compound expression

- GIVEN `visibleWhen: "score > 0 && period != 'halftime'"`
- WHEN data provides `score: 3` and `period: 'halftime'`
- THEN the element is hidden (second condition fails)

#### Scenario: Invalid field reference in expression

- GIVEN `visibleWhen: 'unknownField == true'` where `unknownField` is not in `dataSchema`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a valid boolean expression, it is evaluated against provided data
- [ ] Given a false evaluation result, the element is hidden
- [ ] Given a true or absent visibleWhen, the element is visible
- [ ] Given an invalid expression syntax, validation fails
- [ ] Given a field reference not in dataSchema, validation fails

---

### Requirement: Repeater Data Binding

The `repeater` field on an element causes it to be replicated for each item in a data array field:

- `dataArrayField`: MUST reference an array-type field in `dataSchema`
- `direction`: `'horizontal'` | `'vertical'` | `'grid'` — layout direction for instances
- `gap`: spacing between instances (in document canvas units), non-negative
- `maxItems` (optional): positive integer cap on visible instances

Child elements within a repeated group bind to the array item's fields via `dataField.fieldName` using the item schema field names.

#### Scenario: Vertical list of standings

- GIVEN a group element with `repeater: { dataArrayField: 'standings', direction: 'vertical', gap: 4 }`
- AND `dataSchema.fields` includes `{ name: 'standings', type: 'array', arrayItemSchema: [...] }`
- WHEN data provides `standings` with 10 items
- THEN 10 instances are rendered vertically with 4-unit gaps

#### Scenario: maxItems caps instances

- GIVEN a repeater with `maxItems: 5` and data provides 10 items
- THEN only 5 instances are rendered

#### Scenario: Invalid array field reference

- GIVEN a repeater with `dataArrayField: 'nonExistent'`
- WHEN the document is validated
- THEN validation fails

#### Acceptance Criteria

- [ ] Given a valid array field reference, instances are generated per data item
- [ ] Given direction 'vertical', instances are stacked vertically
- [ ] Given direction 'horizontal', instances are placed side by side
- [ ] Given maxItems, instances are capped at that count
- [ ] Given an invalid dataArrayField reference, validation fails
- [ ] Given negative gap, validation fails

---

## Spec Gaps

_None — all requirements have acceptance criteria._

---

## Non-Goals

- How data is fetched from external sources → application-level concern
- Real-time data feed protocols → deferred to future phase
- Data transformation pipelines → application-level concern
