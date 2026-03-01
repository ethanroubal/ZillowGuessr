# ZillowGuessr

A lightweight web game prototype inspired by GeoGuessr + Zillow:

- You see a home listing card and image.
- You see a map circle that contains the home, but the house is not centered.
- You guess the listing price.
- Scoring grants up to **1000 points per round** if within **1%** of the real price.
- The game runs for **20 rounds** (max **20,000 points**).
- A local account username and leaderboard are stored in browser localStorage.

## Run locally

Because this is a static site, you can run:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Notes

- Listing data is sample data in `script.js` (not live Zillow integration).
- Maps are rendered with Leaflet + OpenStreetMap tiles.
