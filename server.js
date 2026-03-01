const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4173);
const DEFAULT_FREE_MODE = process.env.ZILLOW_FREE_MODE !== 'false';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

// Public Zillow listing pages that can be scraped server-side.
// This avoids paid API keys, though Zillow markup can change over time.
const PUBLIC_ZILLOW_URLS = [
  'https://www.zillow.com/homedetails/210-Lake-Rd-Belmont-NH-03220/86898727_zpid/',
  'https://www.zillow.com/homedetails/2534-S-Coronado-Rd-Gilbert-AZ-85295/8170466_zpid/',
  'https://www.zillow.com/homedetails/2578-S-Golden-Ave-Springfield-MO-65807/50268767_zpid/',
  'https://www.zillow.com/homedetails/1609-Hudson-St-Redwood-City-CA-94061/15591189_zpid/',
  'https://www.zillow.com/homedetails/4123-Warwick-Rd-Richmond-VA-23235/12572802_zpid/'
];

const FALLBACK_LISTINGS = [
  {
    id: 'fallback-1',
    address: '1452 Maple Ave',
    cityState: 'Austin, TX',
    beds: 4,
    baths: 3,
    sqft: 2370,
    price: 645000,
    lat: 30.2883,
    lng: -97.7445,
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80',
    detailUrl: 'https://www.zillow.com/',
    sourceNote: 'Local fallback listing'
  },
  {
    id: 'fallback-2',
    address: '221 Harbor View Dr',
    cityState: 'Seattle, WA',
    beds: 3,
    baths: 2,
    sqft: 1820,
    price: 875000,
    lat: 47.6203,
    lng: -122.3493,
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
    detailUrl: 'https://www.zillow.com/',
    sourceNote: 'Local fallback listing'
  }
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function sanitizeHtmlSnippet(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const raw = sanitizeHtmlSnippet(match[1]);
    if (!raw) {
      continue;
    }

    try {
      blocks.push(JSON.parse(raw));
    } catch (_error) {
      // ignore invalid block
    }
  }

  return blocks;
}

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeFromJsonLd(ld, url) {
  const residence = Array.isArray(ld)
    ? ld.find((entry) => String(entry['@type']).toLowerCase().includes('residence'))
    : ld;

  const node = residence || ld;
  const geo = node.geo || {};
  const addressObject = node.address || {};
  const offers = node.offers || {};

  const lat = Number(firstTruthy(geo.latitude, geo.lat));
  const lng = Number(firstTruthy(geo.longitude, geo.lng));
  const price = Number(firstTruthy(offers.price, node.price));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const addressLine = firstTruthy(
    node.name,
    addressObject.streetAddress,
    [addressObject.streetAddress, addressObject.addressLocality].filter(Boolean).join(', ')
  );
  const cityState = [addressObject.addressLocality, addressObject.addressRegion].filter(Boolean).join(', ');

  const images = toArray(node.image);
  const imageUrl = typeof images[0] === 'string' ? images[0] : images[0]?.url;

  return {
    id: `free-${Math.random().toString(36).slice(2, 10)}`,
    address: addressLine || 'Zillow Listing',
    cityState: cityState || 'Unknown location',
    beds: Number(firstTruthy(node.numberOfRooms, node.numberOfBedrooms)) || 0,
    baths: Number(firstTruthy(node.numberOfBathroomsTotal, node.numberOfBathrooms)) || 0,
    sqft: Number(firstTruthy(node.floorSize?.value, node.livingArea)) || 0,
    price,
    lat,
    lng,
    image:
      imageUrl ||
      'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80',
    detailUrl: url,
    sourceNote: 'Parsed from public Zillow page data'
  };
}

async function fetchPublicListingFromZillow() {
  const listingUrl = pickRandom(PUBLIC_ZILLOW_URLS);
  const response = await fetch(listingUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch public Zillow page: ${response.status}`);
  }

  const html = await response.text();
  const blocks = parseJsonLdBlocks(html);

  for (const block of blocks) {
    const listing = normalizeFromJsonLd(block, listingUrl);
    if (listing) {
      return listing;
    }
  }

  throw new Error('Could not parse listing metadata from public Zillow page');
}

function writeJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': CONTENT_TYPES['.json'] });
  res.end(body);
}

function serveFile(res, filepath) {
  fs.readFile(filepath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const extension = path.extname(filepath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/api/listings/random') {
    try {
      if (DEFAULT_FREE_MODE) {
        const listing = await fetchPublicListingFromZillow();
        return writeJson(res, 200, {
          listing,
          source: 'public_zillow_page',
          note: 'No paid API key required'
        });
      }

      return writeJson(res, 200, {
        listing: pickRandom(FALLBACK_LISTINGS),
        source: 'fallback',
        note: 'Free-mode disabled; using fallback listing'
      });
    } catch (error) {
      return writeJson(res, 200, {
        listing: pickRandom(FALLBACK_LISTINGS),
        source: 'fallback',
        warning: error.message,
        note: 'Using fallback because public Zillow fetch failed'
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
