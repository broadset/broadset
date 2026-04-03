import { DocumentRenderer } from '@broadset/renderer';
import { useEffect, useRef } from 'react';

import { SAMPLE_DOCUMENT } from './sampleDocument';

export default function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DocumentRenderer | null>(null);

  useEffect(() => {
    // Ensure no scrollbars on body
    const prevOverflow = document.body.style.overflow;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';

    const host = canvasRef.current;

    if (host === null) {
      return;
    }

    const renderer = new DocumentRenderer();

    renderer.mount(SAMPLE_DOCUMENT, host);
    rendererRef.current = renderer;

    return (): void => {
      renderer.destroy();
      rendererRef.current = null;
      document.body.style.overflow = prevOverflow;
      document.body.style.margin = prevMargin;
    };
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={canvasRef}
        style={{
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
}
