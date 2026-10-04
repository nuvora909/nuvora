// Hermetic browser tests: every spec imports `test` and `expect` from here instead of @playwright/test.
// Pages may only talk to the local test server. Google Fonts are answered locally (an empty stylesheet and
// "204 No Content" for font files), so the pages fall back to system fonts; any other request that would leave
// this computer is aborted, and shows up as a console error that the tests' error watcher reports.
//
// Why: without this, a test depended on the internet. When DNS was slow or offline, the fonts stylesheet
// failed with net::ERR_NAME_NOT_RESOLVED (a console error, so home.spec.mjs failed), or held up the page's
// load event until navigation timed out.
import { test as base, expect } from '@playwright/test';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const isLocal = (url) => LOCAL_HOSTS.has(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route((url) => !isLocal(url), (route) => {
      const { hostname } = new URL(route.request().url());
      if (hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' });
      if (hostname === 'fonts.gstatic.com') return route.fulfill({ status: 204, body: '' });
      return route.abort('blockedbyclient');
    });
    await use(context);
  },
});

export { expect };
