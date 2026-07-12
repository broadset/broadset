import { projectFormatV1 } from '@broadset/model';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1PagePreview } from './v1-page-preview';

describe('V1PagePreview', () => {
  it('renders the resolved v1 page tree and project assets', () => {
    const { container } = render(
      <V1PagePreview
        documentId={projectFormatV1.idSchema.parse('doc-broadcast-main')}
        pageId={projectFormatV1.idSchema.parse('page-match-live')}
        project={SAMPLE_PROJECT_V1}
      />,
    );

    expect(container.querySelector('[data-element-id="el-scorebug"]')).not.toBeNull();
    expect(container.querySelector('[data-element-id="el-sb-home-score"]')?.textContent).toBe('2');
    expect(container.querySelector<HTMLImageElement>('[data-element-id="el-sb-home-crest"] img')?.src).toBe(
      'https://picsum.photos/id/102/150/150',
    );
  });
});
