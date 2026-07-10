# Model — Color Management

## Purpose

Defines authoritative typed colors, swatches, document working spaces, linear premultiplied compositing, ICC output intent, and intentional-loss reporting.

## Requirements

### Requirement: Typed Color Values

A color value MUST be either a concrete color or swatch reference. A concrete color contains `kind: 'color'`, color `space`, exact finite `channels`, and finite `alpha` from 0 through 1. Supported spaces are `srgb`, `display-p3`, `rec2020`, `lab`, `oklab`, `oklch`, `cmyk`, and `gray`.

Channel count and numeric ranges MUST validate per space. Canonical colors MUST NOT be authored as CSS strings.

RGB-family channels (`srgb`, `display-p3`, and `rec2020`) are three values in the inclusive range 0 through 1. `lab` is `[L, a, b]` with `L` from 0 through 100 and `a`/`b` from -125 through 125. `oklab` is `[L, a, b]` with `L` from 0 through 1 and `a`/`b` from -0.4 through 0.4. `oklch` is `[L, C, h]` with `L` from 0 through 1, `C` from 0 through 0.4, and hue from 0 through 360. `cmyk` is four channels from 0 through 1. `gray` is one channel from 0 through 1. Alpha is always inclusive 0 through 1.

#### Acceptance Criteria

- [ ] Given valid channel counts and ranges for every supported space, validation succeeds
- [ ] Given the wrong channel count, non-finite channel, or invalid alpha, validation fails
- [ ] Given a wide-gamut concrete color, serialization preserves its authoritative channels

### Requirement: Swatches

A swatch reference MUST resolve to a project swatch and MAY contain typed adjustments. Swatches MAY define spot-ink metadata, alternate process color, tint behavior, and producer aliases. Producer theme slots map to swatches or interop records rather than becoming the universal color model.

```ts
type ConcreteColorValue = {
  readonly kind: 'color';
  readonly space: 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';
  readonly channels: readonly number[];
  readonly alpha: number;
};

type ColorValue =
  | ConcreteColorValue
  | {
      readonly kind: 'swatch';
      readonly swatchId: Id;
      readonly adjustments?: readonly { readonly kind: 'tint'; readonly amount: number }[];
    };

interface SwatchProducerAlias {
  readonly id: Id;
  readonly producer: string;
  readonly name: string;
}

type Swatch =
  | {
      readonly id: Id;
      readonly kind: 'process';
      readonly name: string;
      readonly color: ConcreteColorValue;
      readonly producerAliases: readonly SwatchProducerAlias[];
    }
  | {
      readonly id: Id;
      readonly kind: 'spot';
      readonly name: string;
      readonly inkName: string;
      readonly alternateColor: ConcreteColorValue;
      readonly tintBehavior: 'linear';
      readonly producerAliases: readonly SwatchProducerAlias[];
    };
```

Tint amounts are finite values from 0 through 1. Producer-alias IDs are unique within a swatch. A swatch definition contains a concrete process color rather than recursively referring to another swatch.

#### Acceptance Criteria

- [ ] Given a resolving swatch with valid tint adjustment, validation succeeds
- [ ] Given a missing swatch or incompatible adjustment, semantic validation fails
- [ ] Given a spot swatch, its spot identity and alternate color remain distinct

### Requirement: Document Working Space

Every document `color` configuration MUST declare a typed working space and `compositing: 'linear-premultiplied'`. The working space is authoring truth and is distinct from display preview and output profile transformations.

#### Acceptance Criteria

- [ ] Given a supported working space and required compositing mode, validation succeeds
- [ ] Given a preview profile change, canonical source colors do not change
- [ ] Given a different output profile, document working-space values remain unchanged

### Requirement: Linear Premultiplied Compositing

Opacity, blending, masks, and effects MUST resolve in the document working space using linear-light premultiplied alpha unless a typed effect explicitly requires another color domain. Boundary conversions MUST be explicit.

#### Acceptance Criteria

- [ ] Given semi-transparent layers, shared render and export kernels produce equivalent compositing
- [ ] Given a nonlinear preview transfer, it is applied after linear compositing
- [ ] Given a required alternate effect domain, conversion into and out of it is explicit and deterministic

### Requirement: ICC Output Intent

An optional document output intent MUST reference an ICC-profile asset and declare rendering intent (`perceptual`, `relative-colorimetric`, `saturation`, or `absolute-colorimetric`) plus black-point compensation. Profile class, color space, and output target MUST be compatible.

#### Acceptance Criteria

- [ ] Given a compatible ICC-profile asset and rendering intent, validation succeeds
- [ ] Given a missing, wrong-kind, or incompatible profile, semantic validation fails
- [ ] Given black-point compensation, its boolean setting is explicit rather than inferred

### Requirement: Output and Interop Fidelity

Output conversion MUST preserve representable color semantics and report every gamut, spot, overprint, HDR, profile, or alpha loss through structured preflight. Imported producer color identity MAY be retained in interop records without replacing canonical typed color.

#### Acceptance Criteria

- [ ] Given a target that supports the source color semantics, export preserves them
- [ ] Given an incapable target, preflight identifies each intentional color loss
- [ ] Given imported theme or producer color metadata, it remains associated through interop

## Spec Gaps

- Exact conversion tolerances, ICC engine selection, HDR transfer tables, and preflight severity policy are owned by the professional color program.

## Non-Goals

- Display calibration UI
- ICC transform implementation
- CSS color serialization as canonical authoring state
