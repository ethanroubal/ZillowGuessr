# ZillowGuessr

A GeoGuessr-style home game with two modes:

- **Price Mode** — guess the listing price from map clue.
- **Location Mode** — guess the map location from listing photos + shown price.

Both modes run for 20 rounds with up to 1,000 points per round.

## Free public Zillow data behavior

No paid API is required. The server uses a three-step free pipeline:

1. **Live public fetch** of Zillow listing pages + JSON-LD parsing (`source: public_live`).
2. If live fetch is blocked, use a **cached public Zillow snapshot set** (`source: public_snapshot`).
3. Only if needed, use minimal **generic fallback** (`source: fallback`).

This reduces reliance on generic fallback and keeps gameplay tied to Zillow listing metadata.

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
