/**
 * Shared row-layout style for the state-machine editor's state/transition rows and the
 * transition-row/trigger-draft sub-components. Kept as its own module (rather than duplicated
 * inline in both call sites) so they stay byte-identical by construction.
 */

import { sp } from '../tokens';

export function rowStyle(): { display: 'flex'; alignItems: 'center'; gap: string; flexWrap: 'wrap' } {
  return { display: 'flex', alignItems: 'center', gap: sp('sp-02'), flexWrap: 'wrap' };
}
