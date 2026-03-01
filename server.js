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

const PUBLIC_ZILLOW_SNAPSHOT = [
  {
    id: 'snap-1',
    detailUrl: 'https://www.zillow.com/homedetails/210-Lake-Rd-Belmont-NH-03220/86898727_zpid/',
    beds: 3, baths: 2, sqft: 1648, price: 419000, lat: 43.4458, lng: -71.4644,
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    active: true
  },
  {
    id: 'snap-2',
    detailUrl: 'https://www.zillow.com/homedetails/2534-S-Coronado-Rd-Gilbert-AZ-85295/8170466_zpid/',
    beds: 4, baths: 3, sqft: 2518, price: 674900, lat: 33.3047, lng: -111.7543,
    image: 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=80',
    active: true
  },
  {
    id: 'snap-3',
    detailUrl: 'https://www.zillow.com/homedetails/1609-Hudson-St-Redwood-City-CA-94061/15591189_zpid/',
    beds: 3, baths: 2, sqft: 1410, price: 1988000, lat: 37.4675, lng: -122.2414,
    image: 'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80',
    active: true
  },
  {
    id: 'snap-4',
    detailUrl: 'https://www.zillow.com/homedetails/4123-Warwick-Rd-Richmond-VA-23235/12572802_zpid/',
    beds: 4, baths: 3, sqft: 2128, price: 489950, lat: 37.5331, lng: -77.5602,
    image: 'https://images.unsplash.com/photo-1605146769289-440113cc3d00?auto=format&fit=crop&w=1200&q=80',
    active: true
  },
  {
    id: 'snap-5',
    detailUrl: 'https://www.zillow.com/homedetails/2578-S-Golden-Ave-Springfield-MO-65807/50268767_zpid/',
    beds: 3, baths: 2, sqft: 1812, price: 349000, lat: 37.1662, lng: -93.3299,
    image: 'https://images.unsplash.com/photo-1597047084897-51e81819a499?auto=format&fit=crop&w=1200&q=80',
    active: true
  }
];

const geocodeCache = new Map();

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
    } catch (_error) {
      // ignore malformed blocks
    }
  }
  return blocks;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseAddressFromDetailUrl(detailUrl) {
  try {
    const url = new URL(detailUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const homedetailsIndex = parts.findIndex((part) => part === 'homedetails');
    if (homedetailsIndex === -1 || !parts[homedetailsIndex + 1]) {
      return null;
    }

    const slug = parts[homedetailsIndex + 1];
    const tokens = slug.split('-').filter(Boolean);
    if (tokens.length < 4) return null;

    const zipIndex = tokens.findIndex((token) => /^\d{5}$/.test(token));
    if (zipIndex < 2) return null;

    const state = tokens[zipIndex - 1];
    const cityTokens = tokens.slice(zipIndex - 2, zipIndex - 1);
    const streetTokens = tokens.slice(0, zipIndex - 2);

    const titleCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());
    const street = titleCase(streetTokens.join(' ').toLowerCase());
    const city = titleCase(cityTokens.join(' ').toLowerCase());

    return {
      address: street,
      cityState: `${city}, ${state}`
    };
  } catch {
    return null;
  }
}

async function geocodeAddress(address, cityState) {
  const key = `${address}, ${cityState}`;
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }

  const query = new URLSearchParams({
    q: key,
    format: 'json',
    limit: '1'
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
      headers: {
        'User-Agent': 'ZillowGuessr/1.0 (demo app geocoder)'
      }
    });

    if (!response.ok) throw new Error('geocode failed');
    const payload = await response.json();
    if (!Array.isArray(payload) || !payload[0]) throw new Error('no geocode result');

    const result = {
      lat: Number(payload[0].lat),
      lng: Number(payload[0].lon)
    };

    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
      throw new Error('invalid geocode coordinates');
    }

    geocodeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

function isLikelyActiveListing(node, html) {
  const offers = node.offers || {};
  const availability = String(offers.availability || '').toLowerCase();
  const listingStatus = String(node.availability || node.homeStatus || '').toLowerCase();
  const lower = html.toLowerCase();

  const hasForSaleSignal =
    lower.includes('for sale') || availability.includes('instock') || availability.includes('forsale');

  if (!hasForSaleSignal) return false;
  if (lower.includes('off market') || lower.includes('sold')) return false;
  if (listingStatus.includes('offmarket') || listingStatus.includes('sold')) return false;
  return true;
}

async function normalizeSnapshotListing(raw) {
  const parsed = parseAddressFromDetailUrl(raw.detailUrl);
  if (!parsed) return null;

  const geocoded = await geocodeAddress(parsed.address, parsed.cityState);
  const coords = geocoded || { lat: raw.lat, lng: raw.lng };
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

  return {
    id: raw.id,
    address: parsed.address,
    cityState: parsed.cityState,
    beds: raw.beds,
    baths: raw.baths,
    sqft: raw.sqft,
    price: raw.price,
    lat: coords.lat,
    lng: coords.lng,
    image: raw.image,
    detailUrl: raw.detailUrl,
    active: true
  };
}

function normalizeLiveFromJsonLd(ld, url, html) {
  const residence = Array.isArray(ld)
    ? ld.find((entry) => String(entry['@type']).toLowerCase().includes('residence'))
    : ld;
  const node = residence || ld;
  const geo = node.geo || {};
  const addressObject = node.address || {};
  const offers = node.offers || {};

  if (!isLikelyActiveListing(node, html)) return null;

  const lat = Number(firstTruthy(geo.latitude, geo.lat));
  const lng = Number(firstTruthy(geo.longitude, geo.lng));
  const price = Number(firstTruthy(offers.price, node.price));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const addressLine = firstTruthy(addressObject.streetAddress, node.name);
  const cityState = [addressObject.addressLocality, addressObject.addressRegion].filter(Boolean).join(', ');
  const images = toArray(node.image);
  const imageUrl = typeof images[0] === 'string' ? images[0] : images[0]?.url;

  if (!addressLine || !cityState) return null;

  return {
    id: `live-${Math.random().toString(36).slice(2, 10)}`,
    address: addressLine,
    cityState,
    beds: Number(firstTruthy(node.numberOfRooms, node.numberOfBedrooms)) || 0,
    baths: Number(firstTruthy(node.numberOfBathroomsTotal, node.numberOfBathrooms)) || 0,
    sqft: Number(firstTruthy(node.floorSize?.value, node.livingArea)) || 0,
    price,
    lat,
    lng,
    image: imageUrl || 'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1200&q=80',
    detailUrl: url,
    active: true
  };
}

async function fetchPublicListingFromZillow() {
  const listingUrl = pickRandom(PUBLIC_ZILLOW_URLS);
  const response = await fetch(listingUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) throw new Error(`Public Zillow request blocked (${response.status})`);

  const html = await response.text();
  const blocks = parseJsonLdBlocks(html);
  for (const block of blocks) {
    const listing = normalizeLiveFromJsonLd(block, listingUrl, html);
    if (listing) return listing;
  }

  throw new Error('No active listing metadata found in public Zillow page');
}

async function getActiveSnapshotListings() {
  const normalized = await Promise.all(
    PUBLIC_ZILLOW_SNAPSHOT.filter((item) => item.active).map((item) => normalizeSnapshotListing(item))
  );
  return normalized.filter(Boolean);
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

async function proxyImage(reqUrl, res) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const imageUrl = parsed.searchParams.get('url');
  if (!imageUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing url param');
    return;
  }

  let upstream;
  try {
    upstream = new URL(imageUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid image URL');
    return;
  }

  if (!['https:', 'http:'].includes(upstream.protocol)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unsupported image URL protocol');
    return;
  }

  try {
    const response = await fetch(upstream.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.zillow.com/'
      }
    });

    if (!response.ok) throw new Error(`Upstream image fetch failed: ${response.status}`);

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(buffer);
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Image proxy failed');
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if (pathname === '/api/image') {
    await proxyImage(req.url, res);
    return;
  }

  if (pathname === '/api/listings/random') {
    const activeSnapshots = await getActiveSnapshotListings();

    if (!DEFAULT_FREE_MODE) {
      if (!activeSnapshots.length) {
        return writeJson(res, 503, { error: 'No active snapshot listings available' });
      }

      return writeJson(res, 200, {
        listing: pickRandom(activeSnapshots),
        source: 'public_snapshot',
        note: 'Free mode disabled; serving active snapshot listings'
      });
    }

    try {
      const listing = await fetchPublicListingFromZillow();
      return writeJson(res, 200, {
        listing,
        source: 'public_live',
        note: 'Live public active Zillow listing fetched'
      });
    } catch (error) {
      if (activeSnapshots.length) {
        return writeJson(res, 200, {
          listing: pickRandom(activeSnapshots),
          source: 'public_snapshot',
          note: 'Live fetch blocked; using active Zillow snapshot listing',
          warning: error.message
        });
      }

      return writeJson(res, 503, {
        error: 'No active for-sale listings available',
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
