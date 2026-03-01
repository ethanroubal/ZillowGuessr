const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4173);
const RAPID_API_KEY = process.env.ZILLOW_RAPIDAPI_KEY;
const RAPID_API_HOST = process.env.ZILLOW_RAPIDAPI_HOST || 'zillow56.p.rapidapi.com';
const SEARCH_ENDPOINT = process.env.ZILLOW_SEARCH_ENDPOINT || 'https://zillow56.p.rapidapi.com/search';

const FALLBACK_LISTINGS = [
  {
    id: 'mock-1',
    address: '1452 Maple Ave, Austin, TX',
    cityState: 'Austin, TX',
    beds: 4,
    baths: 3,
    sqft: 2370,
    price: 645000,
    lat: 30.2883,
    lng: -97.7445,
    image: 'https://photos.zillowstatic.com/fp/7d6f9c46f3f141c0d3a7de595f596f28-p_e.jpg',
    detailUrl: 'https://www.zillow.com/'
  },
  {
    id: 'mock-2',
    address: '221 Harbor View Dr, Seattle, WA',
    cityState: 'Seattle, WA',
    beds: 3,
    baths: 2,
    sqft: 1820,
    price: 875000,
    lat: 47.6203,
    lng: -122.3493,
    image: 'https://photos.zillowstatic.com/fp/c57e13dd95f6f0e8a2ebf75ae128f0d3-p_e.jpg',
    detailUrl: 'https://www.zillow.com/'
  }
];

const SEARCH_LOCATIONS = [
  'Austin, TX', 'Seattle, WA', 'Denver, CO', 'Nashville, TN', 'Miami, FL', 'Phoenix, AZ',
  'Chicago, IL', 'Charlotte, NC', 'Portland, OR', 'Atlanta, GA', 'San Diego, CA', 'Boston, MA'
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function firstTruthy(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '');
}

function normalizeListing(raw) {
  const lat = Number(firstTruthy(raw.latitude, raw.latLong?.latitude, raw.latLong?.lat, raw.lat));
  const lng = Number(firstTruthy(raw.longitude, raw.latLong?.longitude, raw.latLong?.lng, raw.lng));
  const price = Number(firstTruthy(raw.price, raw.unformattedPrice, raw.hdpData?.homeInfo?.price));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const beds = Number(firstTruthy(raw.bedrooms, raw.beds, raw.hdpData?.homeInfo?.bedrooms)) || 0;
  const baths = Number(firstTruthy(raw.bathrooms, raw.baths, raw.hdpData?.homeInfo?.bathrooms)) || 0;
  const sqft = Number(firstTruthy(raw.livingArea, raw.area, raw.sqft, raw.hdpData?.homeInfo?.livingArea)) || 0;
  const addressLine = firstTruthy(raw.address, raw.addressStreet, raw.streetAddress, raw.hdpData?.homeInfo?.streetAddress);
  const city = firstTruthy(raw.city, raw.hdpData?.homeInfo?.city);
  const state = firstTruthy(raw.state, raw.hdpData?.homeInfo?.state);
  const image = firstTruthy(
    raw.imgSrc,
    raw.img,
    raw.mediumImageLink,
    raw.hdpData?.homeInfo?.hiResImageLink,
    raw.hdpData?.homeInfo?.imgSrc,
    raw.carouselPhotos?.[0]?.url,
    raw.photos?.[0]?.mixedSources?.jpeg?.[0]?.url,
    raw.photos?.[0]?.url
  );
  const detailUrl = firstTruthy(raw.detailUrl, raw.url);

  const cityState = [city, state].filter(Boolean).join(', ');
  return {
    id: String(firstTruthy(raw.zpid, raw.id, `${addressLine}-${price}-${lat}`)),
    address: addressLine || cityState || 'Zillow Listing',
    cityState: cityState || 'Unknown location',
    beds,
    baths,
    sqft,
    price,
    lat,
    lng,
    image: image || 'https://picsum.photos/seed/zillow-fallback/900/500',
    detailUrl: detailUrl ? (String(detailUrl).startsWith('http') ? detailUrl : `https://www.zillow.com${detailUrl}`) : 'https://www.zillow.com/'
  };
}

async function fetchZillowListings() {
  const location = pickRandom(SEARCH_LOCATIONS);
  const page = randomInt(1, 15);
  const params = new URLSearchParams({
    location,
    page: String(page),
    status: 'forSale',
    sortSelection: 'globalrelevanceex'
  });

  const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': RAPID_API_KEY,
      'X-RapidAPI-Host': RAPID_API_HOST
    }
  });

  if (!response.ok) {
    throw new Error(`Zillow API error: ${response.status}`);
  }

  const payload = await response.json();
  const rawListings = payload.results || payload.props || payload.searchResults?.listResults || [];

  if (!Array.isArray(rawListings) || rawListings.length === 0) {
    throw new Error('No listings returned from Zillow API');
  }

  const normalized = rawListings.map(normalizeListing).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('Could not normalize listings from Zillow API response');
  }

  return normalized;
}

function writeJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': CONTENT_TYPES['.json'] });
  res.end(body);
}

function serveFile(res, filepath) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filepath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/api/listings/random') {
    try {
      if (!RAPID_API_KEY) {
        return writeJson(res, 200, { listing: pickRandom(FALLBACK_LISTINGS), source: 'fallback' });
      }

      const listings = await fetchZillowListings();
      return writeJson(res, 200, { listing: pickRandom(listings), source: 'zillow_api' });
    } catch (error) {
      return writeJson(res, 200, {
        listing: pickRandom(FALLBACK_LISTINGS),
        source: 'fallback',
        warning: error.message
      });
    }
  }

  const safePath = pathname === '/' ? '/index.html' : pathname;
  const requested = path.join(__dirname, safePath);
  if (!requested.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  serveFile(res, requested);
});

server.listen(PORT, () => {
  console.log(`ZillowGuessr server listening on http://localhost:${PORT}`);
});
