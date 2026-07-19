import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { applyFormatterPipelineV1 } from './formatter-pipeline';

function truncate(value: string, maximum: number) {
  return applyFormatterPipelineV1({ type: 'string', value }, {
    steps: [{ id: model.idSchema.parse('truncate'), formatterId: 'truncate', arguments: [{ type: 'integer', value: maximum }] }],
  });
}

describe('truncate formatter grapheme semantics', () => {
  it('keeps combining marks and joined emoji together', () => {
    expect(truncate('e\u0301x', 1)).toEqual({ type: 'string', value: 'e\u0301' });
    expect(truncate('👩‍💻!', 1)).toEqual({ type: 'string', value: '👩‍💻' });
  });

  it('keeps Hangul Jamo, CRLF, and emoji tag sequences together', () => {
    const tagFlag = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';

    expect(truncate('\u1100\u1161x', 1)).toEqual({ type: 'string', value: '\u1100\u1161' });
    expect(truncate('\r\nx', 1)).toEqual({ type: 'string', value: '\r\n' });
    expect(truncate(`${tagFlag}!`, 1)).toEqual({ type: 'string', value: tagFlag });
  });

  it('keeps Indic conjunct consonants joined across a virama', () => {
    expect(truncate('\u0915\u094D\u0937x', 1)).toEqual({ type: 'string', value: '\u0915\u094D\u0937' });
  });

  it('processes one long combining emoji cluster with linear fallback work', () => {
    const cluster = `\u{1F469}${'\u0301'.repeat(2_048)}\u200D\u{1F4BB}`;
    const arrayFrom = vi.spyOn(Array, 'from');
    const result = truncate(`${cluster}x`, 1);
    const arrayFromCalls = arrayFrom.mock.calls.length;

    arrayFrom.mockRestore();

    expect(result).toEqual({ type: 'string', value: cluster });
    expect(arrayFromCalls).toBeLessThan(20);
  });
});
