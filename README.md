# ZillowGuessr

A GeoGuessr-style home price game with a green money + real-estate visual theme.

- Each round fetches a random listing candidate from the server.
- The player sees listing images/details and a map circle where the house is inside but not centered.
- The player guesses the listing price, earning up to **1000 points** if within **1%**.
- The game runs for **20 rounds** (max **20,000** points).
- Usernames + leaderboard are stored locally in browser `localStorage`.

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

- **<= 1% error**: 1000 points (perfect)
- For larger errors, score follows a quadratic decay based on relative error, giving more intuitive differentiation for near misses while reducing points for broad misses.
