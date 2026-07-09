import { type BroadsetElement, createDefaultElement, createDefaultStyle } from '@broadset/model';
import type { PanelElement } from '@broadset/ui';

import { toPanelElement } from '../demo-utils';
import { FIXTURE_IDS } from './ids';

function buildPanelElement(element: BroadsetElement): PanelElement {
  return toPanelElement(element);
}

export function createSidebarPanelFixtureElements(): Readonly<Record<string, PanelElement>> {
  const title = buildPanelElement(
    createDefaultElement('text', {
      id: FIXTURE_IDS.title,
      name: 'Title',
      content: '<b>TITLE</b>',
      style: {
        ...createDefaultStyle(),
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 700,
        fontColor: '#f7fbff',
      },
    }),
  );

  const logo = buildPanelElement(
    createDefaultElement('image', {
      id: FIXTURE_IDS.logo,
      name: 'Logo',
      width: 220,
      height: 220,
      content: 'data:image/svg+xml;base64,PHN2Zy8+',
      style: {
        ...createDefaultStyle(),
        objectFit: 'contain',
      },
    }),
  );

  const video = buildPanelElement(
    createDefaultElement('video', {
      id: FIXTURE_IDS.video,
      name: 'Video',
      content: 'data:application/octet-stream;base64,',
      typeConfig: {
        loop: true,
        autoplay: true,
        muted: true,
        startTimeS: 0,
        endTimeS: null,
      },
    }),
  );

  const clock = buildPanelElement(
    createDefaultElement('clock', {
      id: FIXTURE_IDS.clock,
      name: 'Clock',
      content: 'HH:mm:ss',
      typeConfig: {
        mode: 'realtime',
        startValue: null,
        targetValue: null,
        countdownTo: null,
      },
    }),
  );

  const ticker = buildPanelElement(
    createDefaultElement('ticker', {
      id: FIXTURE_IDS.ticker,
      name: 'Ticker',
      content: '["One","Two"]',
      typeConfig: {
        speed: 96,
        direction: 'left',
        gap: 48,
        paused: false,
      },
    }),
  );

  return {
    [FIXTURE_IDS.title]: title,
    [FIXTURE_IDS.logo]: logo,
    [FIXTURE_IDS.video]: video,
    [FIXTURE_IDS.clock]: clock,
    [FIXTURE_IDS.ticker]: ticker,
  };
}
