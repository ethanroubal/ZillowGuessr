const TOTAL_ROUNDS = 20;
const MAP_RADIUS_METERS = 5500;
const MIN_CENTER_OFFSET_METERS = 1200;
const MAX_CENTER_OFFSET_METERS = 3800;

const listingPool = [
  {
    address: '1452 Maple Ave, Austin, TX',
    cityState: 'Austin, TX',
    beds: 4,
    baths: 3,
    sqft: 2370,
    price: 645000,
    lat: 30.2883,
    lng: -97.7445,
    image: 'https://picsum.photos/seed/home1/900/500'
  },
  {
    address: '221 Harbor View Dr, Seattle, WA',
    cityState: 'Seattle, WA',
    beds: 3,
    baths: 2,
    sqft: 1820,
    price: 875000,
    lat: 47.6203,
    lng: -122.3493,
    image: 'https://picsum.photos/seed/home2/900/500'
  },
  {
    address: '89 Juniper Ln, Denver, CO',
    cityState: 'Denver, CO',
    beds: 5,
    baths: 4,
    sqft: 3010,
    price: 990000,
    lat: 39.7394,
    lng: -104.9848,
    image: 'https://picsum.photos/seed/home3/900/500'
  },
  {
    address: '472 Oak Hollow Rd, Nashville, TN',
    cityState: 'Nashville, TN',
    beds: 3,
    baths: 2,
    sqft: 1680,
    price: 510000,
    lat: 36.1638,
    lng: -86.7846,
    image: 'https://picsum.photos/seed/home4/900/500'
  },
  {
    address: '16 Shoreline Ct, Miami, FL',
    cityState: 'Miami, FL',
    beds: 4,
    baths: 3,
    sqft: 2490,
    price: 1225000,
    lat: 25.7733,
    lng: -80.1907,
    image: 'https://picsum.photos/seed/home5/900/500'
  },
  {
    address: '3302 Elm Ridge St, Phoenix, AZ',
    cityState: 'Phoenix, AZ',
    beds: 4,
    baths: 2,
    sqft: 2140,
    price: 560000,
    lat: 33.4502,
    lng: -112.0746,
    image: 'https://picsum.photos/seed/home6/900/500'
  },
  {
    address: '74 Lakepoint Dr, Chicago, IL',
    cityState: 'Chicago, IL',
    beds: 2,
    baths: 2,
    sqft: 1350,
    price: 430000,
    lat: 41.8781,
    lng: -87.6298,
    image: 'https://picsum.photos/seed/home7/900/500'
  },
  {
    address: '1006 Garden Path, Charlotte, NC',
    cityState: 'Charlotte, NC',
    beds: 4,
    baths: 3,
    sqft: 2260,
    price: 540000,
    lat: 35.2271,
    lng: -80.8431,
    image: 'https://picsum.photos/seed/home8/900/500'
  },
  {
    address: '913 Pinecrest St, Portland, OR',
    cityState: 'Portland, OR',
    beds: 3,
    baths: 2,
    sqft: 1740,
    price: 610000,
    lat: 45.5231,
    lng: -122.6765,
    image: 'https://picsum.photos/seed/home9/900/500'
  },
  {
    address: '510 Riverbend Ave, Atlanta, GA',
    cityState: 'Atlanta, GA',
    beds: 4,
    baths: 3,
    sqft: 2420,
    price: 625000,
    lat: 33.749,
    lng: -84.388,
    image: 'https://picsum.photos/seed/home10/900/500'
  }
];

const leaderboardKey = 'zillowguessr_leaderboard';
const usersKey = 'zillowguessr_users';

let map;
let mapCircle;
let revealMarker;
let gameState = null;

const authForm = document.getElementById('auth-form');
const gameCard = document.getElementById('game-card');
const authStatus = document.getElementById('auth-status');
const welcome = document.getElementById('welcome');
const roundLabel = document.getElementById('round-label');
const totalScoreEl = document.getElementById('total-score');
const houseImage = document.getElementById('house-image');
const listingAddress = document.getElementById('listing-address');
const listingMeta = document.getElementById('listing-meta');
const guessForm = document.getElementById('guess-form');
const roundResult = document.getElementById('round-result');
const nextRoundBtn = document.getElementById('next-round');
const leaderboardList = document.getElementById('leaderboard-list');
const clearLeaderboardBtn = document.getElementById('clear-leaderboard');

function toCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function shuffleArray(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function metersToLatLngOffset(lat, distanceMeters, bearingRadians) {
  const earthRadius = 6378137;
  const deltaLat = (distanceMeters * Math.cos(bearingRadians)) / earthRadius;
  const deltaLng =
    (distanceMeters * Math.sin(bearingRadians)) /
    (earthRadius * Math.cos((Math.PI * lat) / 180));

  return {
    latOffset: (deltaLat * 180) / Math.PI,
    lngOffset: (deltaLng * 180) / Math.PI
  };
}

function getRandomizedCircleCenter(homeLat, homeLng) {
  const distance =
    MIN_CENTER_OFFSET_METERS + Math.random() * (MAX_CENTER_OFFSET_METERS - MIN_CENTER_OFFSET_METERS);
  const bearing = Math.random() * 2 * Math.PI;
  const { latOffset, lngOffset } = metersToLatLngOffset(homeLat, distance, bearing);
  return {
    lat: homeLat + latOffset,
    lng: homeLng + lngOffset
  };
}

function buildRounds() {
  const rounds = [];
  while (rounds.length < TOTAL_ROUNDS) {
    rounds.push(...shuffleArray(listingPool));
  }
  return rounds.slice(0, TOTAL_ROUNDS);
}

function initializeMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function showRound() {
  const round = gameState.rounds[gameState.roundIndex];
  const center = getRandomizedCircleCenter(round.lat, round.lng);

  houseImage.src = round.image;
  houseImage.alt = `Listing at ${round.address}`;
  listingAddress.textContent = round.address;
  listingMeta.textContent = `${round.beds} bd • ${round.baths} ba • ${round.sqft.toLocaleString()} sqft • ${round.cityState}`;

  if (mapCircle) {
    map.removeLayer(mapCircle);
  }
  if (revealMarker) {
    map.removeLayer(revealMarker);
    revealMarker = null;
  }

  mapCircle = L.circle([center.lat, center.lng], {
    radius: MAP_RADIUS_METERS,
    color: '#2d6cdf',
    fillColor: '#2d6cdf',
    fillOpacity: 0.25
  }).addTo(map);

  map.fitBounds(mapCircle.getBounds(), { padding: [20, 20] });

  roundLabel.textContent = `Round ${gameState.roundIndex + 1} / ${TOTAL_ROUNDS}`;
  totalScoreEl.textContent = gameState.totalScore;
  roundResult.textContent = '';
  guessForm.reset();
  guessForm.classList.remove('hidden');
  nextRoundBtn.classList.add('hidden');
}

function calculateRoundPoints(guess, actual) {
  const errorPercent = Math.abs(guess - actual) / actual;
  if (errorPercent <= 0.01) {
    return { points: 1000, errorPercent };
  }

  const adjusted = Math.max(0, 1 - (errorPercent - 0.01) / 0.49);
  return { points: Math.round(1000 * adjusted), errorPercent };
}

function loadUsers() {
  return JSON.parse(localStorage.getItem(usersKey) ?? '{}');
}

function saveUser(name) {
  const users = loadUsers();
  if (!users[name]) {
    users[name] = { createdAt: new Date().toISOString() };
    localStorage.setItem(usersKey, JSON.stringify(users));
  }
}

function loadLeaderboard() {
  return JSON.parse(localStorage.getItem(leaderboardKey) ?? '[]');
}

function saveLeaderboard(entries) {
  localStorage.setItem(leaderboardKey, JSON.stringify(entries));
}

function refreshLeaderboard() {
  const entries = loadLeaderboard().sort((a, b) => b.score - a.score).slice(0, 10);
  leaderboardList.innerHTML = '';

  if (!entries.length) {
    leaderboardList.innerHTML = '<li>No games recorded yet.</li>';
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = `${entry.username} — ${entry.score.toLocaleString()} pts (${new Date(entry.date).toLocaleDateString()})`;
    leaderboardList.appendChild(li);
  }
}

function finishGame() {
  roundResult.innerHTML = `<strong>Game Over!</strong> Final Score: ${gameState.totalScore.toLocaleString()} / 20,000.`;
  guessForm.classList.add('hidden');
  nextRoundBtn.classList.add('hidden');

  const entries = loadLeaderboard();
  entries.push({
    username: gameState.username,
    score: gameState.totalScore,
    date: new Date().toISOString()
  });

  saveLeaderboard(entries);
  refreshLeaderboard();
}

function startGame(username) {
  gameState = {
    username,
    totalScore: 0,
    roundIndex: 0,
    rounds: buildRounds()
  };

  welcome.textContent = `Player: ${username}`;
  gameCard.classList.remove('hidden');

  if (!map) {
    initializeMap();
  }

  setTimeout(() => map.invalidateSize(), 0);
  showRound();
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = new FormData(authForm).get('username').toString().trim();

  if (username.length < 3) {
    authStatus.textContent = 'Username must be at least 3 characters.';
    return;
  }

  saveUser(username);
  authStatus.textContent = `Welcome, ${username}!`;
  startGame(username);
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const guessValue = Number(new FormData(guessForm).get('priceGuess'));

  if (!Number.isFinite(guessValue) || guessValue <= 0) {
    return;
  }

  const round = gameState.rounds[gameState.roundIndex];
  const { points, errorPercent } = calculateRoundPoints(guessValue, round.price);
  gameState.totalScore += points;
  totalScoreEl.textContent = gameState.totalScore;

  revealMarker = L.marker([round.lat, round.lng]).addTo(map).bindPopup('Actual home location');

  roundResult.innerHTML = [
    `Actual Price: <strong>${toCurrency(round.price)}</strong>`,
    `Your Guess: <strong>${toCurrency(guessValue)}</strong>`,
    `Error: <strong>${(errorPercent * 100).toFixed(2)}%</strong>`,
    `Points this round: <strong>${points}</strong>`
  ].join('<br/>');

  guessForm.classList.add('hidden');

  if (gameState.roundIndex >= TOTAL_ROUNDS - 1) {
    finishGame();
    return;
  }

  nextRoundBtn.classList.remove('hidden');
});

nextRoundBtn.addEventListener('click', () => {
  gameState.roundIndex += 1;
  showRound();
});

clearLeaderboardBtn.addEventListener('click', () => {
  saveLeaderboard([]);
  refreshLeaderboard();
});

refreshLeaderboard();
