---
name: verify
description: Build, launch, and drive the Junoswap Next.js app to verify UI changes at runtime.
---

# Verifying Junoswap UI changes

## Launch

```bash
bun run dev --port 3457   # run in background; ready when curl returns 200 (~20s)
```

Use a non-3000 port to avoid colliding with a user-run dev server.

## Drive (headless browser)

Import Playwright from the project's node_modules — bun's global cache resolves a
newer `playwright` whose browser build isn't installed:

```js
import { chromium } from '/Users/coshi/com/junoswap/node_modules/playwright/index.mjs'
```

If browsers are missing: `bunx playwright install chromium`.

## Gotchas

- Routes: `/swap`, `/bridge`, `/earn`, `/launchpad`, `/portfolio`. Root `/` is the landing page.
- Swap settings persist in `localStorage` key `junoswap-swap-store` (zustand persist);
  read it via `page.evaluate` to assert store state, remove it to reset to defaults.
- No wallet in headless runs — flows requiring a connected wallet stop at "Connect Wallet";
  verify quote/UI behavior around that boundary.
- Playwright leaves the mouse over the last clicked element; `page.mouse.move()` away
  before screenshots or hover styles pollute the capture.
- Zoom into screenshot regions with `sips -c <h> <w> --cropOffset <y> <x> in.png --out crop.png`
  then `sips -z <2h> <2w>` to enlarge.
