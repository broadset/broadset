import { createScreenRenderer } from '@broadset/renderer';
import { render } from '@testing-library/react';

import { DemoApp } from './DemoApp';

jest.mock('@broadset/renderer', () => ({
  createScreenRenderer: jest.fn(),
}));

describe('DemoApp renderer lifecycle', () => {
  it('does not recreate the renderer when the shell rerenders with the same document', () => {
    const destroy = jest.fn();
    const updateDocument = jest.fn();
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument,
      destroy,
    });

    const { rerender, unmount } = render(<DemoApp />);

    expect(mockedCreateScreenRenderer).toHaveBeenCalledTimes(1);

    rerender(<DemoApp />);

    expect(mockedCreateScreenRenderer).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
