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
  documentMode: 'screen',
  canvas: {
    width: 508,
    height: 285.75,
    padding: [0, 0, 0, 0],
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
          width: 508,
          height: 60,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Background Bar' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#1a1a2e',
          },
        },
        // Text — title
        {
          id: 'el-title',
          type: 'text',
          position: { x: 20, y: 10 },
          width: 300,
          height: 40,
          rotation: 0,
          content: '<b>Broadset Demo</b>',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Title' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 28,
            fontColor: '#ffffff',
            fontWeight: '700',
          },
        },
        // Image — placeholder
        {
          id: 'el-logo',
          type: 'image',
          position: { x: 420, y: 8 },
          width: 44,
          height: 44,
          rotation: 0,
          content: 'https://via.placeholder.com/44',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Logo' },
          style: {
            ...DEFAULT_STYLE,
            borderRadius: 8,
          },
        },
        // Ellipse — decorative circle
        {
          id: 'el-circle',
          type: 'ellipse',
          position: { x: 380, y: 80 },
          width: 100,
          height: 100,
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
          position: { x: 20, y: 80 },
          width: 60,
          height: 60,
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
          position: { x: 100, y: 80 },
          width: 80,
          height: 80,
          rotation: 0,
          content: 'M 0 80 L 40 0 L 80 80 Z',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Triangle Path' },
          style: {
            ...DEFAULT_STYLE,
            fill: '#0f3460',
            stroke: '#e94560',
            strokeWidth: 2,
          },
        },
        // QR Code
        {
          id: 'el-qr',
          type: 'qrcode',
          position: { x: 200, y: 80 },
          width: 80,
          height: 80,
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
          position: { x: 20, y: 200 },
          width: 300,
          height: 60,
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
          width: 100,
          height: 30,
          rotation: 0,
          content: 'HOME',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Home Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 18,
            fontColor: '#ffffff',
          },
        },
        // Group child — away label
        {
          id: 'el-away-label',
          type: 'text',
          position: { x: 120, y: 0 },
          width: 100,
          height: 30,
          rotation: 0,
          content: 'AWAY',
          parentId: 'el-group-score',
          groupId: 'el-group-score',
          screen: { ...DEFAULT_SCREEN, name: 'Away Label' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 18,
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
          width: 508,
          height: 285.75,
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
          position: { x: 50, y: 80 },
          width: 400,
          height: 60,
          rotation: 0,
          content: '<b>Replay</b>',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Page 2 Title' },
          style: {
            ...DEFAULT_STYLE,
            fontFamily: 'Arial',
            fontSize: 36,
            fontColor: '#e94560',
            textAlignment: 'center',
          },
        },
        {
          id: 'el-p2-divider',
          type: 'rectangle',
          position: { x: 100, y: 160 },
          width: 300,
          height: 4,
          rotation: 0,
          content: '',
          parentId: null,
          groupId: null,
          screen: { ...DEFAULT_SCREEN, name: 'Divider' },
          style: {
            ...DEFAULT_STYLE,
            backgroundColor: '#e94560',
            borderRadius: 2,
          },
        },
      ],
    },
  ],
  animationRegistry: [],
};
