# ZillowGuessr

A GeoGuessr-style home game with two modes:

- **Price Mode** — guess the listing price from map clue.
- **Location Mode** — guess the map location from listing photos + shown price.

Both modes run for 20 rounds with up to 1,000 points per round.

## Why live Zillow fetches get blocked (403)

The `403` is from Zillow anti-bot protections (WAF/bot mitigation). A server script without a full browser session, stable cookies, JS execution fingerprints, and trusted traffic profile is often denied. In short: the request is reaching Zillow, but access is rejected before content is returned.

## Current remediation strategy in this app

1. Try live public listing fetch + JSON-LD parsing, but only accept entries that look active/for-sale (`source: public_live`).
2. If blocked, use an **active snapshot set** whose address is derived from the Zillow detail URL and coordinates are geocoded so address/link/marker remain consistent (`source: public_snapshot`).
3. If no active listings are available, return `503` rather than serving non-active/off-market data.

This guarantees we do not intentionally serve off-market listings in fallback behavior.

## Address/link/image consistency fixes

- Address displayed in the game is now derived from the listing source and aligned to the detail URL.
- Map marker coordinates for snapshot entries are geocoded from that same address.
- Listing images are served through `/api/image` proxy with direct-image fallback in the client to mitigate hotlink blocking.

## Run locally

```bash
node server.js
```

Then open `http://localhost:4173`.

## Scoring model

- **Price mode**
  - **<= 1% error**: 1000 points
  - Otherwise: quadratic decay by relative error.
- **Location mode**
  - **<= 1 km** away: 1000 points
  - Decays to 0 points by 250 km distance.

## Browser testing note

If Chromium crashes with SIGSEGV in your environment, use Firefox for Playwright smoke tests.
