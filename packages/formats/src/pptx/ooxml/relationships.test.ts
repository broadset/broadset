import { describe, expect, it } from 'vitest';

import { OOXML_REL_TYPES } from './namespaces';
import { buildRelationshipsXml, parseRelationshipsXml, RelationshipAllocator } from './relationships';

/**
 * @description RelationshipAllocator enforces the `rId{n}` convention
 * OOXML requires and keeps allocation deterministic per part. Multiple
 * slides or shapes may allocate relationships concurrently in the
 * exporter; a stable allocator is what keeps output reproducible.
 */
describe('RelationshipAllocator', () => {
  it('starts at rId1 by default', () => {
    const allocator = new RelationshipAllocator();
    const id = allocator.add(OOXML_REL_TYPES.image, '../media/image1.png');

    expect(id).toBe('rId1');
  });

  it('increments the allocated id', () => {
    const allocator = new RelationshipAllocator();

    allocator.add(OOXML_REL_TYPES.image, '../media/image1.png');

    const second = allocator.add(OOXML_REL_TYPES.image, '../media/image2.png');

    expect(second).toBe('rId2');
  });

  it('exposes the relationships via entries()', () => {
    const allocator = new RelationshipAllocator();

    allocator.add(OOXML_REL_TYPES.slideMaster, '../slideMasters/slideMaster1.xml');
    allocator.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');

    expect(allocator.entries()).toHaveLength(2);
    expect(allocator.entries()[0]?.target).toBe('../slideMasters/slideMaster1.xml');
    expect(allocator.entries()[1]?.type).toBe(OOXML_REL_TYPES.theme);
  });

  it('tags external targets with TargetMode="External"', () => {
    const allocator = new RelationshipAllocator();

    allocator.add('http://example.com/rel/link', 'https://example.com/thing', true);

    expect(allocator.entries()[0]?.external).toBe(true);
  });
});

/**
 * @description buildRelationshipsXml produces a package-rels part body.
 * The output must round-trip through parseRelationshipsXml so import +
 * export pipelines can read each other's files.
 */
describe('buildRelationshipsXml / parseRelationshipsXml', () => {
  it('round-trips a basic relationship list', () => {
    const allocator = new RelationshipAllocator();

    allocator.add(OOXML_REL_TYPES.slideMaster, '../slideMasters/slideMaster1.xml');
    allocator.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');
    allocator.add(OOXML_REL_TYPES.image, '../media/image1.png');

    const body = buildRelationshipsXml(allocator.entries());
    const parsed = parseRelationshipsXml(body);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.id).toBe('rId1');
    expect(parsed[0]?.type).toBe(OOXML_REL_TYPES.slideMaster);
    expect(parsed[1]?.type).toBe(OOXML_REL_TYPES.theme);
    expect(parsed[2]?.target).toBe('../media/image1.png');
  });

  it('preserves TargetMode="External" across round-trip', () => {
    const body = buildRelationshipsXml([
      { id: 'rId1', type: 'http://example.com/rel/link', target: 'https://example.com/x', external: true },
    ]);
    const parsed = parseRelationshipsXml(body);

    expect(parsed[0]?.external).toBe(true);
  });

  it('tolerates unknown attributes gracefully', () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="y" Futuristic="true"/></Relationships>`;
    const parsed = parseRelationshipsXml(body);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('rId1');
  });

  it('skips malformed entries (missing id / type / target)', () => {
    const body = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="x" Target="y"/><Relationship Id="rId5" Type="z" Target="w"/></Relationships>`;
    const parsed = parseRelationshipsXml(body);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('rId5');
  });
});
