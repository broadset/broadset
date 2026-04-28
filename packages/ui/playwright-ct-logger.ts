import { createLogger, type Logger } from 'vite';

/**
 * Custom Vite logger for Playwright CT runs that suppresses the
 * `[vite:react-babel]` recommendation to switch to
 * `@vitejs/plugin-react-oxc`. Playwright Component Tests pin Vite to
 * 6.4.2 (CVE override) and use `@vitejs/plugin-react@4.7.0` internally;
 * we cannot pass `disableOxcRecommendation: true` to the plugin
 * instance because Playwright's `frameworkPluginFactory` constructs it
 * with no arguments and the framework plugin is wired before any user
 * `ctViteConfig.plugins` entry can intervene.
 *
 * The recommendation is informational, fires once per CT run, and
 * adds noise to clean test output. Filter it here. Anything else still
 * surfaces — that is how new noise gets caught.
 */
const SUPPRESSED_LOG_PATTERNS: readonly RegExp[] = [/\[vite:react-babel\].*plugin-react-oxc/];

function isSuppressedMessage(message: string): boolean {
  return SUPPRESSED_LOG_PATTERNS.some((pattern) => pattern.test(message));
}

export function createCtLogger(): Logger {
  const base = createLogger();
  const wrapped: Logger = {
    ...base,
    info(message, options) {
      if (isSuppressedMessage(message)) return;
      base.info(message, options);
    },
    warn(message, options) {
      if (isSuppressedMessage(message)) return;
      base.warn(message, options);
    },
    warnOnce(message, options) {
      if (isSuppressedMessage(message)) return;
      base.warnOnce(message, options);
    },
    error(message, options) {
      if (isSuppressedMessage(message)) return;
      base.error(message, options);
    },
  };

  return wrapped;
}
