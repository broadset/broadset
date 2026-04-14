import { broadsetDocumentSchema } from '@broadset/model';

import { FIXTURE_IDS } from './ids';
import {
  createDemoAppChromeTestDocument,
  createDemoAppPlaybackTestDocument,
  createParentingTransformTestDocument,
  createPlaybackAndParentingComboDocument,
  createSidebarPanelFixtureElements,
  createVisibilityAndDataBindingComboDocument,
} from './index';

describe('isolated demo test fixtures', () => {
  /** @description Chrome/menu fixture stays minimal, schema-valid, and includes at least one selectable element. */
  it('creates a schema-valid chrome fixture document with selectable content', () => {
    const fixture = createDemoAppChromeTestDocument();

    expect(() => broadsetDocumentSchema.parse(fixture)).not.toThrow();
    expect(fixture.elements.some((element) => !element.locked)).toBe(true);
  });

  /** @description Playback fixture provides a deterministic animated target with the expected timeline id/name used by shell tests. */
  it('creates a playback fixture document with the live pulse timeline', () => {
    const fixture = createDemoAppPlaybackTestDocument();

    expect(() => broadsetDocumentSchema.parse(fixture)).not.toThrow();

    const animatedElement = fixture.elements.find((element) => element.id === FIXTURE_IDS.liveOrb);
    const animation = fixture.animations.find((entry) => entry.elementId === FIXTURE_IDS.liveOrb);
    const livePulse = animation?.config.timelines.find((timeline) => timeline.id === 'tl-live-pulse');

    expect(animatedElement).toBeDefined();
    expect(animation).toBeDefined();
    expect(livePulse?.name).toBe('Live Pulse');
  });

  /** @description Parenting fixture must encode parent-relative child coordinates for transform regression coverage. */
  it('creates a parenting fixture where child coordinates are parent-relative and bounded', () => {
    const fixture = createParentingTransformTestDocument();

    expect(() => broadsetDocumentSchema.parse(fixture)).not.toThrow();

    const parent = fixture.elements.find((element) => element.id === FIXTURE_IDS.promoGroup);
    const child = fixture.elements.find((element) => element.id === FIXTURE_IDS.promoQr);

    expect(parent).toBeDefined();
    expect(child).toBeDefined();

    if (parent !== undefined && child !== undefined) {
      expect(child.parentId).toBe(parent.id);
      expect(child.position.x).toBeGreaterThanOrEqual(0);
      expect(child.position.y).toBeGreaterThanOrEqual(0);
      expect(child.position.x + child.width).toBeLessThanOrEqual(parent.width);
      expect(child.position.y + child.height).toBeLessThanOrEqual(parent.height);
    }
  });

  /** @description Sidebar fixture elements are isolated panel fixtures with stable IDs for CT panel assertions. */
  it('creates sidebar panel fixture elements for title/logo/video/clock/ticker', () => {
    const elements = createSidebarPanelFixtureElements();

    expect(elements[FIXTURE_IDS.title]?.id).toBe(FIXTURE_IDS.title);
    expect(elements[FIXTURE_IDS.logo]?.type).toBe('image');
    expect(elements[FIXTURE_IDS.video]?.type).toBe('video');
    expect(elements[FIXTURE_IDS.clock]?.type).toBe('clock');
    expect(elements[FIXTURE_IDS.ticker]?.type).toBe('ticker');
  });

  /** @description Combo fixture preserves both playback timelines and parent-relative child placement in one document. */
  it('creates a playback and parenting combo fixture with both scenario guarantees', () => {
    const fixture = createPlaybackAndParentingComboDocument();

    expect(() => broadsetDocumentSchema.parse(fixture)).not.toThrow();

    const animation = fixture.animations.find((entry) => entry.elementId === FIXTURE_IDS.liveOrb);
    const parent = fixture.elements.find((element) => element.id === FIXTURE_IDS.promoGroup);
    const child = fixture.elements.find((element) => element.id === FIXTURE_IDS.promoQr);

    expect(animation).toBeDefined();
    expect(parent).toBeDefined();
    expect(child?.parentId).toBe(FIXTURE_IDS.promoGroup);
  });

  /** @description Combo fixture encodes data-binding + visibility conditions used by document-driven UI flows. */
  it('creates a visibility and data binding combo fixture with schema-valid fields', () => {
    const fixture = createVisibilityAndDataBindingComboDocument();

    expect(() => broadsetDocumentSchema.parse(fixture)).not.toThrow();

    const logo = fixture.elements.find((element) => element.id === FIXTURE_IDS.logo);

    expect(logo?.visibleWhen).toBe('sponsorVisible == true');
    expect(logo?.dataField?.fieldName).toBe('sponsorLogo');
    expect(fixture.dataSchema.fields.some((field) => field.name === 'sponsorVisible')).toBe(true);
    expect(fixture.dataSchema.fields.some((field) => field.name === 'sponsorLogo')).toBe(true);
  });
});
