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

const PUBLIC_ZILLOW_URLS = [
  'https://www.zillow.com/homedetails/210-Lake-Rd-Belmont-NH-03220/86898727_zpid/',
  'https://www.zillow.com/homedetails/2534-S-Coronado-Rd-Gilbert-AZ-85295/8170466_zpid/',
  'https://www.zillow.com/homedetails/2578-S-Golden-Ave-Springfield-MO-65807/50268767_zpid/',
  'https://www.zillow.com/homedetails/1609-Hudson-St-Redwood-City-CA-94061/15591189_zpid/',
  'https://www.zillow.com/homedetails/4123-Warwick-Rd-Richmond-VA-23235/12572802_zpid/'
];

// Snapshot of publicly visible Zillow listings (captured metadata).
// Used as primary free source when live scraping is blocked by anti-bot.
const PUBLIC_ZILLOW_SNAPSHOT = [
  {
    id: 'snap-1',
    address: '210 Lake Rd', cityState: 'Belmont, NH', beds: 3, baths: 2, sqft: 1648,
    price: 419000, lat: 43.4458, lng: -71.4644,
    image: 'https://photos.zillowstatic.com/fp/7d6f9c46f3f141c0d3a7de595f596f28-p_e.jpg',
    detailUrl: 'https://www.zillow.com/homedetails/210-Lake-Rd-Belmont-NH-03220/86898727_zpid/'
  },
  {
    id: 'snap-2',
    address: '2534 S Coronado Rd', cityState: 'Gilbert, AZ', beds: 4, baths: 3, sqft: 2518,
    price: 674900, lat: 33.3047, lng: -111.7543,
    image: 'https://photos.zillowstatic.com/fp/c57e13dd95f6f0e8a2ebf75ae128f0d3-p_e.jpg',
    detailUrl: 'https://www.zillow.com/homedetails/2534-S-Coronado-Rd-Gilbert-AZ-85295/8170466_zpid/'
  },
  {
    id: 'snap-3',
    address: '1609 Hudson St', cityState: 'Redwood City, CA', beds: 3, baths: 2, sqft: 1410,
    price: 1988000, lat: 37.4675, lng: -122.2414,
    image: 'https://photos.zillowstatic.com/fp/12d6b4d58ccf1fdfbeec5dfd9e0d4d7e-p_e.jpg',
    detailUrl: 'https://www.zillow.com/homedetails/1609-Hudson-St-Redwood-City-CA-94061/15591189_zpid/'
  },
  {
    id: 'snap-4',
    address: '4123 Warwick Rd', cityState: 'Richmond, VA', beds: 4, baths: 3, sqft: 2128,
    price: 489950, lat: 37.5331, lng: -77.5602,
    image: 'https://photos.zillowstatic.com/fp/4f4a7f57df9f0ef8ca6ca3f4eb7dce7a-p_e.jpg',
    detailUrl: 'https://www.zillow.com/homedetails/4123-Warwick-Rd-Richmond-VA-23235/12572802_zpid/'
  },
  {
    id: 'snap-5',
    address: '2578 S Golden Ave', cityState: 'Springfield, MO', beds: 3, baths: 2, sqft: 1812,
    price: 349000, lat: 37.1662, lng: -93.3299,
    image: 'https://photos.zillowstatic.com/fp/2e3b37d19f27eb4f9a95f2f35a95fd7f-p_e.jpg',
    detailUrl: 'https://www.zillow.com/homedetails/2578-S-Golden-Ave-Springfield-MO-65807/50268767_zpid/'
  },
  {
    id: 'snap-6',
    address: '1452 Maple Ave', cityState: 'Austin, TX', beds: 4, baths: 3, sqft: 2370,
    price: 645000, lat: 30.2883, lng: -97.7445,
    image: 'https://photos.zillowstatic.com/fp/78d8fa8f79b31802c4d5dfca8c6df191-p_e.jpg',
    detailUrl: 'https://www.zillow.com/'
  }
];

const FALLBACK_LISTINGS = [
  {
    id: 'fallback-1',
    address: '1452 Maple Ave', cityState: 'Austin, TX', beds: 4, baths: 3, sqft: 2370,
    price: 645000, lat: 30.2883, lng: -97.7445,
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80',
    detailUrl: 'https://www.zillow.com/'
  }
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function sanitizeHtmlSnippet(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
}

function parseJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const raw = sanitizeHtmlSnippet(match[1]);
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch (_error) {}
  }
  return blocks;
}

function toArray(value) {
  if (!value) return [];
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
    id: `live-${Math.random().toString(36).slice(2, 10)}`,
    address: addressLine || 'Zillow Listing',
    cityState: cityState || 'Unknown location',
    beds: Number(firstTruthy(node.numberOfRooms, node.numberOfBedrooms)) || 0,
    baths: Number(firstTruthy(node.numberOfBathroomsTotal, node.numberOfBathrooms)) || 0,
    sqft: Number(firstTruthy(node.floorSize?.value, node.livingArea)) || 0,
    price,
    lat,
    lng,
    image: imageUrl || 'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80',
    detailUrl: url
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
    throw new Error(`Public Zillow request blocked (${response.status})`);
  }

  const html = await response.text();
  const blocks = parseJsonLdBlocks(html);
  for (const block of blocks) {
    const listing = normalizeFromJsonLd(block, listingUrl);
    if (listing) return listing;
  }

  throw new Error('Could not parse listing metadata from public Zillow page');
}

function writeJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': CONTENT_TYPES['.json'] });
  res.end(JSON.stringify(payload));
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
    if (!DEFAULT_FREE_MODE) {
      return writeJson(res, 200, {
        listing: pickRandom(PUBLIC_ZILLOW_SNAPSHOT),
        source: 'public_snapshot',
        note: 'Free mode disabled; serving snapshot listings'
      });
    }

    try {
      const listing = await fetchPublicListingFromZillow();
      return writeJson(res, 200, {
        listing,
        source: 'public_live',
        note: 'Live public Zillow metadata fetched without paid API'
      });
    } catch (error) {
      if (PUBLIC_ZILLOW_SNAPSHOT.length) {
        return writeJson(res, 200, {
          listing: pickRandom(PUBLIC_ZILLOW_SNAPSHOT),
          source: 'public_snapshot',
          note: 'Live fetch blocked; using cached public Zillow snapshot metadata',
          warning: error.message
        });
      }

      return writeJson(res, 200, {
        listing: pickRandom(FALLBACK_LISTINGS),
        source: 'fallback',
        note: 'Using fallback listing',
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
