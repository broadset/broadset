/**
 * The `web-vector` module now owns only the HTML-standalone export
 * path per the Phase 7 plan. SVG export / import lives in
 * `../svg/`. This barrel is intentionally narrow.
 */
export { exportHtmlStandalone } from './html';
