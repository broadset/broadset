import { describe, expect, it } from 'vitest';

import { ContentTypesBuilder } from './content-types';
import { OOXML_CONTENT_TYPES } from './namespaces';

/**
 * @description `[Content_Types].xml` is the single source of truth
 * PowerPoint consults to load a PPTX package. Missing or misspelled
 * entries cause "repair" dialogs. The builder must emit every default
 * and override the exporter registered.
 */
describe('ContentTypesBuilder', () => {
  it('seeds the two defaults every PPTX package requires', () => {
    const builder = new ContentTypesBuilder();
    const body = builder.build();

    expect(body).toContain('Extension="rels"');
    expect(body).toContain('Extension="xml"');
    expect(body).toContain(OOXML_CONTENT_TYPES.rels);
  });

  it('adds an image default for each extension the exporter uses', () => {
    const builder = new ContentTypesBuilder();

    builder.addDefault('png', 'image/png');
    builder.addDefault('jpeg', 'image/jpeg');

    const body = builder.build();

    expect(body).toContain('Extension="png" ContentType="image/png"');
    expect(body).toContain('Extension="jpeg" ContentType="image/jpeg"');
  });

  it('deduplicates repeated defaults (idempotent)', () => {
    const builder = new ContentTypesBuilder();

    builder.addDefault('png', 'image/png');
    builder.addDefault('png', 'image/png');

    const body = builder.build();
    const hits = body.match(/Extension="png"/g) ?? [];

    expect(hits).toHaveLength(1);
  });

  it('adds an override per part (slide, master, layout, custom XML)', () => {
    const builder = new ContentTypesBuilder();

    builder.addOverride('ppt/presentation.xml', OOXML_CONTENT_TYPES.presentation);
    builder.addOverride('ppt/slides/slide1.xml', OOXML_CONTENT_TYPES.slide);
    builder.addOverride('ppt/slideMasters/slideMaster1.xml', OOXML_CONTENT_TYPES.slideMaster);
    builder.addOverride('customXml/broadset-project.xml', OOXML_CONTENT_TYPES.customXml);

    const body = builder.build();

    expect(body).toContain('PartName="/ppt/presentation.xml"');
    expect(body).toContain('PartName="/ppt/slides/slide1.xml"');
    expect(body).toContain('PartName="/ppt/slideMasters/slideMaster1.xml"');
    expect(body).toContain('PartName="/customXml/broadset-project.xml"');
  });

  it('prepends `/` to partNames lacking it (OOXML requires the leading slash)', () => {
    const builder = new ContentTypesBuilder();

    builder.addOverride('ppt/slides/slide1.xml', OOXML_CONTENT_TYPES.slide);
    builder.addOverride('/ppt/slides/slide2.xml', OOXML_CONTENT_TYPES.slide);

    const body = builder.build();

    expect(body).toContain('PartName="/ppt/slides/slide1.xml"');
    expect(body).toContain('PartName="/ppt/slides/slide2.xml"');
  });

  it('deduplicates repeated overrides (idempotent)', () => {
    const builder = new ContentTypesBuilder();

    builder.addOverride('ppt/slides/slide1.xml', OOXML_CONTENT_TYPES.slide);
    builder.addOverride('ppt/slides/slide1.xml', OOXML_CONTENT_TYPES.slide);

    const body = builder.build();
    const hits = body.match(/PartName="\/ppt\/slides\/slide1\.xml"/g) ?? [];

    expect(hits).toHaveLength(1);
  });
});
