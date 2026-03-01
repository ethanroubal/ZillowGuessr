const TOTAL_ROUNDS = 20;
const MAP_RADIUS_METERS = 5500;
const MIN_CENTER_OFFSET_METERS = 1200;
const MAX_CENTER_OFFSET_METERS = 3800;

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

function initializeMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
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

async function fetchRandomListing() {
  const response = await fetch('/api/listings/random');
  if (!response.ok) {
    throw new Error('Unable to fetch listing from API');
  }

  const payload = await response.json();
  if (!payload.listing) {
    throw new Error('No listing payload from API');
  }

  return payload;
}

async function showRound() {
  roundLabel.textContent = `Round ${gameState.roundIndex + 1} / ${TOTAL_ROUNDS}`;
  roundResult.textContent = 'Loading Zillow listing...';
  guessForm.classList.add('hidden');
  nextRoundBtn.classList.add('hidden');

  try {
    const payload = await fetchRandomListing();
    const round = payload.listing;
    gameState.currentRound = round;

    const center = getRandomizedCircleCenter(round.lat, round.lng);

    houseImage.src = round.image;
    houseImage.alt = `Listing at ${round.address}`;
    listingAddress.textContent = round.address;
    listingMeta.innerHTML = `${round.beds} bd • ${round.baths} ba • ${Number(round.sqft).toLocaleString()} sqft • ${round.cityState}<br/><a href="${round.detailUrl}" target="_blank" rel="noreferrer">View Zillow listing</a> · Source: <strong>${payload.source}</strong>`;

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

    totalScoreEl.textContent = gameState.totalScore;
    roundResult.innerHTML = payload.warning
      ? `Loaded fallback listing. API warning: ${payload.warning}`
      : 'Submit your guess!';
    guessForm.reset();
    guessForm.classList.remove('hidden');
  } catch (error) {
    roundResult.textContent = `Unable to load listing: ${error.message}`;
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
    currentRound: null
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
  if (!gameState?.currentRound) {
    return;
  }

  const guessValue = Number(new FormData(guessForm).get('priceGuess'));
  if (!Number.isFinite(guessValue) || guessValue <= 0) {
    return;
  }

  const round = gameState.currentRound;
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
