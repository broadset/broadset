import type { PanelElement } from '@broadset/ui';

import { FIXTURE_IDS } from './ids';

function createPanelElement(options: {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly content?: string | undefined;
  readonly overrides?: Partial<PanelElement> | undefined;
}): PanelElement {
  return {
    id: options.id,
    type: options.type,
    name: options.name,
    content: options.content ?? '',
    assetId: null,
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    rotation: 0,
    backgroundColor: '',
    backgroundGradient: '',
    borderWidth: 0,
    borderColor: '',
    borderStyle: 'solid',
    borderRadius: [0, 0, 0, 0],
    opacity: 1,
    mixBlendMode: 'normal',
    isolation: 'auto',
    boxShadow: '',
    filter: '',
    backdropFilter: '',
    fontFamily: '',
    fontSize: 16,
    fontColor: '#000000',
    fontWeight: 400,
    fontStyle: 'normal',
    textAlignment: 'left',
    verticalAlignment: 'top',
    textDecoration: 'none',
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 'normal',
    wordSpacing: 0,
    textStroke: '',
    textShadow: '',
    writingMode: 'horizontal-tb',
    fontVariationSettings: '',
    padding: [0, 0, 0, 0],
    stroke: '',
    strokeWidth: 1,
    strokeDasharray: '',
    strokeDashoffset: 0,
    strokeLinecap: 'butt',
    strokeLinejoin: 'miter',
    strokeOpacity: 1,
    fill: '',
    fillOpacity: 1,
    fillRule: 'nonzero',
    trimStart: 0,
    trimEnd: 1,
    trimOffset: 0,
    maskType: 'none',
    customClipPath: '',
    clipChildren: false,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    translateZ: 0,
    objectFit: 'fill',
    autoSize: 'none',
    errorCorrection: 'M',
    qrForegroundColor: '#000000',
    qrBackgroundColor: '#ffffff',
    booleanOperation: null,
    ...options.overrides,
  };
}

export function createSidebarPanelFixtureElements(): Readonly<Record<string, PanelElement>> {
  const title = createPanelElement({
    id: FIXTURE_IDS.title,
    name: 'Title',
    type: 'text',
    content: '<b>TITLE</b>',
    overrides: { fontFamily: 'Inter', fontSize: 48, fontWeight: 700, fontColor: '#f7fbff' },
  });
  const logo = createPanelElement({
    id: FIXTURE_IDS.logo,
    name: 'Logo',
    type: 'image',
    content: 'data:image/svg+xml;base64,PHN2Zy8+',
    overrides: { width: 220, height: 220, objectFit: 'contain' },
  });
  const video = createPanelElement({
    id: FIXTURE_IDS.video,
    name: 'Video',
    type: 'video',
    content: 'data:application/octet-stream;base64,',
    overrides: { videoAutoplay: true, videoLoop: true, videoMuted: true, videoStartTime: 0 },
  });
  const clock = createPanelElement({
    id: FIXTURE_IDS.clock,
    name: 'Clock',
    type: 'clock',
    content: 'HH:mm:ss',
    overrides: { clockMode: 'realtime' },
  });
  const ticker = createPanelElement({
    id: FIXTURE_IDS.ticker,
    name: 'Ticker',
    type: 'ticker',
    content: '["One","Two"]',
    overrides: {
      tickerItems: ['One', 'Two'],
      tickerSpeed: 96,
      tickerDirection: 'left',
      tickerGap: 48,
      tickerPaused: false,
    },
  });

  return {
    [FIXTURE_IDS.title]: title,
    [FIXTURE_IDS.logo]: logo,
    [FIXTURE_IDS.video]: video,
    [FIXTURE_IDS.clock]: clock,
    [FIXTURE_IDS.ticker]: ticker,
  };
}
