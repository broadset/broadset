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
// SVG data URI used as a reliable demo image (no external network dependency)
const LOGO_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='16' fill='%230f3460'/%3E%3Ctext x='80' y='100' text-anchor='middle' font-size='64' font-family='Arial' font-weight='bold' fill='%23e94560'%3EB%3C/text%3E%3C/svg%3E";

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
        // Image — SVG data URI logo
        {
          id: 'el-logo',
          type: 'image',
          position: { x: 1720, y: 30 },
          width: 160,
          height: 160,
          rotation: 0,
          content: LOGO_DATA_URI,
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
        // Group with two children
        {
          id: 'el-group-score',
          type: 'group',
          position: { x: 80, y: 750 },
          width: 1000,
          height: 200,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Score Group' },
          style: DEFAULT_STYLE,
        },
        // Group child — home label
        {
          id: 'el-home-label',
          type: 'text',
          position: { x: 0, y: 0 },
          width: 400,
          height: 100,
          rotation: 0,
          content: 'HOME',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Home Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 48,
            fontColor: '#ffffff',
          },
        },
        // Group child — away label
        {
          id: 'el-away-label',
          type: 'text',
          position: { x: 500, y: 0 },
          width: 400,
          height: 100,
          rotation: 0,
          content: 'AWAY',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Away Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 48,
            fontColor: '#ffffff',
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
  animationRegistry: [],
};
