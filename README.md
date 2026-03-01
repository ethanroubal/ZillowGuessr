# ZillowGuessr

A GeoGuessr-style home game with two playable modes:

- **Price Mode**: You get a listing + map circle clue and guess the listing price.
- **Location Mode**: You get listing images + listing price and guess the house location by clicking on the map.

Both modes run for 20 rounds with up to 1,000 points per round.

## Can this work without paying for an API?

Yes. This implementation defaults to a **free mode** that attempts to fetch data from public Zillow listing pages server-side and parse their metadata.

- No paid API key is required for this mode.
- It is more brittle than an official paid API (page markup may change).
- If parsing fails, the app automatically falls back to local sample listings so gameplay continues.

You can disable free mode with:

```bash
export ZILLOW_FREE_MODE=false
```

## Run locally

```bash
node server.js
```

Then open `http://localhost:4173`.

## Scoring model

- **Price mode**
  - **<= 1% error**: 1000 points (perfect)
  - Otherwise: quadratic decay by relative error.
- **Location mode**
  - **<= 1 km** away: 1000 points
  - Decays to 0 points by 250 km distance.

## Testing and SIGSEGV fix

If browser-based smoke tests crash with a Chromium `SIGSEGV` in this environment, use Firefox for Playwright runs instead of Chromium. This is an environment/runtime issue with headless Chromium, not a game-logic crash.
