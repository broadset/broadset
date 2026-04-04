import type { PlaybackController } from '@broadset/playback';
import { DocumentRenderer } from '@broadset/renderer';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createDemoController } from './animationSetup';
import { SAMPLE_DOCUMENT } from './sampleDocument';

export default function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DocumentRenderer | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Lock overflow on html/body/root for viewport overflow prevention
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevBodyMargin = body.style.margin;

    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    body.style.margin = '0';

    const host = canvasRef.current;

    if (host === null) {
      return;
    }

    const renderer = new DocumentRenderer();

    renderer.mount(SAMPLE_DOCUMENT, host);
    rendererRef.current = renderer;

    const controller = createDemoController(SAMPLE_DOCUMENT, host);

    controllerRef.current = controller;

    return (): void => {
      controller.destroy();
      controllerRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      body.style.margin = prevBodyMargin;
    };
  }, []);

  const handlePlayPause = useCallback((): void => {
    if (isPlaying) {
      controllerRef.current?.pause();
      setIsPlaying(false);
    } else {
      controllerRef.current?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleReset = useCallback((): void => {
    controllerRef.current?.pause();
    controllerRef.current?.seek(0);
    setIsPlaying(false);
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
        position: 'relative',
      }}
    >
      <div
        ref={canvasRef}
        style={{
          transformOrigin: 'center center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          data-testid="play-button"
          data-playing={String(isPlaying)}
          onClick={handlePlayPause}
          type="button"
          style={{
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          data-testid="reset-button"
          onClick={handleReset}
          type="button"
          style={{
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
