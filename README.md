# ZillowGuessr

A GeoGuessr-style Zillow price game:

- Each round fetches a **random Zillow listing** from an API-backed endpoint.
- The player sees listing photos/details and a map circle where the house is inside but not centered.
- The player guesses the price, earning up to **1000 points** if within **1%**.
- The game runs for **20 rounds** (max **20,000** points).
- Usernames + leaderboard are stored locally in browser `localStorage`.

## API integration

This app uses a server-side proxy endpoint (`/api/listings/random`) so API keys are not exposed in the browser.

Set environment variables before starting:

```bash
export ZILLOW_RAPIDAPI_KEY="your_rapidapi_key"
# optional overrides
export ZILLOW_RAPIDAPI_HOST="zillow56.p.rapidapi.com"
export ZILLOW_SEARCH_ENDPOINT="https://zillow56.p.rapidapi.com/search"
```

If no key is configured (or Zillow API fails), the app returns fallback sample listings so the game still works.

## Run locally

```bash
node server.js
```

Then open `http://localhost:4173`.
