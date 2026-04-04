// ---------------------------------------------------------------------------
// Shared defaults
// ---------------------------------------------------------------------------

const DEFAULT_SCREEN = {
  name: '',
  anchorX: 'left' as const,
  anchorY: 'top' as const,
  visibility: 'onscreen' as const,
  activeState: null,
  modifiers: [] as string[],
  locked: false,
  maskType: 'none' as const,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  translateZ: 0,
  clipChildren: false,
  customClipPath: '',
};

const DEFAULT_STYLE = { opacity: 1 };

// ---------------------------------------------------------------------------
// Sample document fixture
// ---------------------------------------------------------------------------

/**
 * Hard-coded sample BroadsetDocument exercising all 8 built-in element types,
 * 2 pages, and valid canvas dimensions. Used as the initial demo document.
 *
 * No animation bindings — those are added in Phase 3.
 * Runtime validation against fullDocumentSchema is in sampleDocument.test.ts.
 */
export const SAMPLE_DOCUMENT = {
  id: 'sample-doc-001',
  documentMode: 'screen' as const,
  canvas: {
    width: 1920,
    height: 1080,
    padding: [0, 0, 0, 0] as const,
  },
  pages: [
    {
      id: 'page-1',
      elements: [
        // Rectangle — full-width background bar
        {
          id: 'el-bg-bar',
          type: 'rectangle',
          position: { x: 0, y: 0 },
          width: 1920,
          height: 220,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Background Bar' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#0f3460',
          },
        },
        // Text — title
        {
          id: 'el-title',
          type: 'text',
          position: { x: 80, y: 40 },
          width: 800,
          height: 140,
          rotation: 0,
          content: '<b>Broadset Demo</b>',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Title' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 64,
            fontColor: '#ffffff',
            fontWeight: '700',
          },
        },
        // Image — placeholder photo
        {
          id: 'el-logo',
          type: 'image',
          position: { x: 1720, y: 30 },
          width: 160,
          height: 160,
          rotation: 0,
          content: 'https://picsum.photos/160/160',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Logo' },
          style: {
            ...DEFAULT_STYLE,
            borderRadius: 16,
          },
        },
        // Ellipse — decorative circle
        {
          id: 'el-circle',
          type: 'ellipse',
          position: { x: 1500, y: 300 },
          width: 350,
          height: 350,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Decorative Circle' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#e94560',
            opacity: 0.8,
          },
        },
        // SVG — inline SVG content
        {
          id: 'el-icon',
          type: 'svg',
          position: { x: 80, y: 300 },
          width: 200,
          height: 200,
          rotation: 0,
          content:
            '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#16213e" stroke="#0f3460" stroke-width="2"/></svg>',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Icon SVG' },
          style: DEFAULT_STYLE,
        },
        // Path — a simple triangle
        {
          id: 'el-path',
          type: 'path',
          position: { x: 380, y: 300 },
          width: 300,
          height: 300,
          rotation: 0,
          content: 'M 0 300 L 150 0 L 300 300 Z',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Triangle Path' },
          style: {
            ...DEFAULT_STYLE,
            fill: '#0f3460',
            stroke: '#e94560',
            strokeWidth: 3,
          },
        },
        // QR Code
        {
          id: 'el-qr',
          type: 'qrcode',
          position: { x: 780, y: 300 },
          width: 300,
          height: 300,
          rotation: 0,
          content: 'https://broadset.dev',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'QR Code' },
          style: DEFAULT_STYLE,
        },
        // Score group — TV-style lower-third scoreboard
        {
          id: 'el-group-score',
          type: 'group',
          position: { x: 80, y: 900 },
          width: 700,
          height: 100,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Score Group' },
          style: DEFAULT_STYLE,
        },
        // Group child — scoreboard background box
        {
          id: 'el-score-bg',
          type: 'rectangle',
          position: { x: 0, y: 0 },
          width: 700,
          height: 100,
          rotation: 0,
          content: '',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Score Background' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#1a1a2e',
            opacity: 0.9,
            borderRadius: 8,
          },
        },
        // Group child — home label
        {
          id: 'el-home-label',
          type: 'text',
          position: { x: 20, y: 16 },
          width: 280,
          height: 68,
          rotation: 0,
          content: '<b>HOME</b>',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Home Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 44,
            fontColor: '#ffffff',
          },
        },
        // Group child — away label
        {
          id: 'el-away-label',
          type: 'text',
          position: { x: 400, y: 16 },
          width: 280,
          height: 68,
          rotation: 0,
          content: '<b>AWAY</b>',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Away Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 44,
            fontColor: '#ffffff',
          },
        },
        // Group child — home score (live data bound)
        {
          id: 'el-home-score',
          type: 'text',
          position: { x: 300, y: 16 },
          width: 80,
          height: 68,
          rotation: 0,
          content: '0',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Home Score' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 44,
            fontColor: '#e94560',
            fontWeight: '700',
            textAlignment: 'center',
          },
        },
        // Group child — away score (live data bound)
        {
          id: 'el-away-score',
          type: 'text',
          position: { x: 680, y: 16 },
          width: 80,
          height: 68,
          rotation: 0,
          content: '0',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Away Score' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 44,
            fontColor: '#e94560',
            fontWeight: '700',
            textAlignment: 'center',
          },
        },
        // Clock display (live data bound)
        {
          id: 'el-clock',
          type: 'text',
          position: { x: 1300, y: 920 },
          width: 300,
          height: 80,
          rotation: 0,
          content: '00:00',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Clock' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 48,
            fontColor: '#ffffff',
            fontWeight: '700',
            textAlignment: 'right',
          },
        },
        // Ticker display (live data bound)
        {
          id: 'el-ticker',
          type: 'text',
          position: { x: 80, y: 1030 },
          width: 1760,
          height: 50,
          rotation: 0,
          content: 'Breaking news: Welcome to the Broadset demo',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Ticker' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 24,
            fontColor: '#cccccc',
          },
        },
      ],
    },
    {
      id: 'page-2',
      elements: [
        // Second page — simpler layout
        {
          id: 'el-p2-bg',
          type: 'rectangle',
          position: { x: 0, y: 0 },
          width: 1920,
          height: 1080,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Page 2 Background' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#16213e',
          },
        },
        {
          id: 'el-p2-title',
          type: 'text',
          position: { x: 200, y: 300 },
          width: 1520,
          height: 200,
          rotation: 0,
          content: '<b>Replay</b>',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Page 2 Title' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 96,
            fontColor: '#e94560',
            textAlignment: 'center',
          },
        },
        {
          id: 'el-p2-divider',
          type: 'rectangle',
          position: { x: 400, y: 600 },
          width: 1120,
          height: 8,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Divider' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#e94560',
            borderRadius: 4,
          },
        },
      ],
    },
  ],
  animationRegistry: [
    // Title: slide in from left + fade in on IN state
    {
      elementId: 'el-title',
      config: {
        timelines: [
          {
            id: 'tl-title-in',
            name: 'title-entrance',
            entries: [
              {
                name: 'start',
                action: 'none' as const,
                offsetMs: 0,
                properties: {
                  opacity: { value: 0, interpolation: 'linear' },
                  transform: { value: 'translateX(-200px)', interpolation: 'ease-out' },
                },
              },
              {
                name: 'end',
                action: 'none' as const,
                offsetMs: 500,
                properties: {
                  opacity: { value: 1, interpolation: 'ease-out' },
                  transform: { value: 'translateX(0px)', interpolation: 'ease-out' },
                },
              },
            ],
          },
          {
            id: 'tl-title-out',
            name: 'title-exit',
            entries: [
              {
                name: 'start',
                action: 'none' as const,
                offsetMs: 0,
                properties: {
                  opacity: { value: 1, interpolation: 'linear' },
                  transform: { value: 'translateX(0px)', interpolation: 'ease-in' },
                },
              },
              {
                name: 'end',
                action: 'none' as const,
                offsetMs: 400,
                properties: {
                  opacity: { value: 0, interpolation: 'ease-in' },
                  transform: { value: 'translateX(200px)', interpolation: 'ease-in' },
                },
              },
            ],
          },
        ],
        stateTimelineBindings: [
          { stateName: 'IN', timelineId: 'tl-title-in' },
          { stateName: 'OUT', timelineId: 'tl-title-out' },
        ],
        modifierTimelineBindings: [],
      },
    },
    // Background bar: fade in on IN state, fade out on OUT state
    {
      elementId: 'el-bg-bar',
      config: {
        timelines: [
          {
            id: 'tl-bgbar-in',
            name: 'bar-entrance',
            entries: [
              {
                name: 'start',
                action: 'none' as const,
                offsetMs: 0,
                properties: { opacity: { value: 0, interpolation: 'linear' } },
              },
              {
                name: 'end',
                action: 'none' as const,
                offsetMs: 700,
                properties: { opacity: { value: 1, interpolation: 'ease-in-out' } },
              },
            ],
          },
          {
            id: 'tl-bgbar-out',
            name: 'bar-exit',
            entries: [
              {
                name: 'start',
                action: 'none' as const,
                offsetMs: 0,
                properties: { opacity: { value: 1, interpolation: 'linear' } },
              },
              {
                name: 'end',
                action: 'none' as const,
                offsetMs: 500,
                properties: { opacity: { value: 0, interpolation: 'ease-in' } },
              },
            ],
          },
        ],
        stateTimelineBindings: [
          { stateName: 'IN', timelineId: 'tl-bgbar-in' },
          { stateName: 'OUT', timelineId: 'tl-bgbar-out' },
        ],
        modifierTimelineBindings: [],
      },
    },
  ],
};
