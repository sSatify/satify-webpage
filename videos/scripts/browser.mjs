import { fileURLToPath } from 'node:url';

// Keep the pinned browser and FFmpeg alongside this tool, out of the app and
// out of the user's shared browser profile. An explicit environment override wins.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../.cache/browsers', import.meta.url));
export const { chromium } = await import('playwright');
