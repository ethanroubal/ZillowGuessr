const TOTAL_ROUNDS = 20;
const MAP_RADIUS_METERS = 5200;
const MIN_CENTER_OFFSET_METERS = 900;
const MAX_CENTER_OFFSET_METERS = 3600;

const leaderboardKey = 'zillowguessr_leaderboard';
const usersKey = 'zillowguessr_users';

const GAME_MODES = {
  price: {
    name: 'Price Mode',
    description: 'Use the map circle clue and guess the listing price.'
  },
  location: {
    name: 'Location Mode',
    description: 'Use listing image + price and click where the house is on the map.'
  }
};

let selectedMode = 'price';
let map;
let mapCircle;
let revealMarker;
let guessMarker;
let gameState = null;

const authForm = document.getElementById('auth-form');
const gameCard = document.getElementById('game-card');
const authStatus = document.getElementById('auth-status');
const welcome = document.getElementById('welcome');
const roundLabel = document.getElementById('round-label');
const modeLabel = document.getElementById('mode-label');
const totalScoreEl = document.getElementById('total-score');
const houseImage = document.getElementById('house-image');
const listingAddress = document.getElementById('listing-address');
const listingMeta = document.getElementById('listing-meta');
const modeInstructions = document.getElementById('mode-instructions');
const guessForm = document.getElementById('guess-form');
const locationControls = document.getElementById('location-controls');
const submitLocationGuessBtn = document.getElementById('submit-location-guess');
const roundResult = document.getElementById('round-result');
const nextRoundBtn = document.getElementById('next-round');
const leaderboardList = document.getElementById('leaderboard-list');
const clearLeaderboardBtn = document.getElementById('clear-leaderboard');
const modeButtons = document.querySelectorAll('.mode-btn');
const inGameModeButtons = document.querySelectorAll('.in-game-mode-btn');

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

function haversineDistanceMeters(aLat, aLng, bLat, bLng) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);

  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function initializeMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', (event) => {
    if (!gameState || gameState.mode !== 'location' || gameState.roundLocked) {
      return;
    }

    gameState.locationGuess = {
      lat: event.latlng.lat,
      lng: event.latlng.lng
    };

    if (guessMarker) {
      map.removeLayer(guessMarker);
    }

    guessMarker = L.marker([event.latlng.lat, event.latlng.lng]).addTo(map).bindPopup('Your guess');
    roundResult.textContent = 'Location selected. Submit your location guess.';
  });
}

function calculatePricePoints(guess, actual) {
  const errorPercent = Math.abs(guess - actual) / actual;
  if (errorPercent <= 0.01) {
    return { points: 1000, errorPercent };
  }

  const boundedError = Math.min(errorPercent, 1);
  const base = 1 - boundedError;
  const points = Math.max(0, Math.round(1000 * base * base));
  return { points, errorPercent };
}

function calculateLocationPoints(distanceMeters) {
  const fullScoreDistance = 1000;
  const zeroScoreDistance = 250000;
  if (distanceMeters <= fullScoreDistance) {
    return 1000;
  }

  const normalized = Math.min(1, (distanceMeters - fullScoreDistance) / (zeroScoreDistance - fullScoreDistance));
  return Math.max(0, Math.round(1000 * (1 - normalized) * (1 - normalized)));
}

function setMode(mode) {
  selectedMode = mode;
  for (const button of modeButtons) {
    button.classList.toggle('active', button.dataset.mode === mode);
  }
  for (const button of inGameModeButtons) {
    button.classList.toggle('active', button.dataset.mode === mode);
  }
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
    li.textContent = `${entry.username} — ${entry.score.toLocaleString()} pts (${entry.mode})`;
    leaderboardList.appendChild(li);
  }
}

async function fetchRandomListing() {
  const response = await fetch('/api/listings/random');
  if (!response.ok) {
    throw new Error('Unable to fetch listing from server');
  }

  const payload = await response.json();
  if (!payload.listing) {
    throw new Error('No listing payload from API');
  }

  return payload;
}

function clearMapLayers() {
  if (mapCircle) {
    map.removeLayer(mapCircle);
    mapCircle = null;
  }
  if (revealMarker) {
    map.removeLayer(revealMarker);
    revealMarker = null;
  }
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
}

function setupModeUI() {
  modeLabel.textContent = `Mode: ${GAME_MODES[gameState.mode].name}`;

  if (gameState.mode === 'price') {
    guessForm.classList.remove('hidden');
    locationControls.classList.add('hidden');
    modeInstructions.textContent =
      'Price Mode: the home is inside the highlighted circle (not centered). Guess the price.';
  } else {
    guessForm.classList.add('hidden');
    locationControls.classList.remove('hidden');
    modeInstructions.textContent =
      'Location Mode: you can see listing image + price. Click map to drop your guessed location.';
  }
}

async function showRound() {
  roundLabel.textContent = `Round ${gameState.roundIndex + 1} / ${TOTAL_ROUNDS}`;
  roundResult.textContent = 'Loading listing...';
  nextRoundBtn.classList.add('hidden');
  gameState.roundLocked = false;
  gameState.locationGuess = null;

  clearMapLayers();
  setupModeUI();

  try {
    const payload = await fetchRandomListing();
    const round = payload.listing;
    gameState.currentRound = round;

    houseImage.src = round.image;
    houseImage.alt = `Listing at ${round.address}`;

    if (gameState.mode === 'price') {
      listingAddress.textContent = round.address;
      listingMeta.innerHTML = `${round.beds || '?'} bd • ${round.baths || '?'} ba • ${Number(round.sqft || 0).toLocaleString()} sqft • ${round.cityState}<br/><a href="${round.detailUrl}" target="_blank" rel="noreferrer">View listing details</a> · Source: <strong>${payload.source}</strong>`;

      const center = getRandomizedCircleCenter(round.lat, round.lng);
      mapCircle = L.circle([center.lat, center.lng], {
        radius: MAP_RADIUS_METERS,
        color: '#0f7a42',
        fillColor: '#25a85d',
        fillOpacity: 0.26
      }).addTo(map);
      map.fitBounds(mapCircle.getBounds(), { padding: [24, 24] });
    } else {
      listingAddress.textContent = 'Guess this listing location';
      listingMeta.innerHTML = `Price: <strong>${toCurrency(round.price)}</strong> • ${round.beds || '?'} bd • ${round.baths || '?'} ba<br/><a href="${round.detailUrl}" target="_blank" rel="noreferrer">View listing details</a> · Source: <strong>${payload.source}</strong>`;
      map.setView([39.5, -98.35], 4);
    }

    totalScoreEl.textContent = gameState.totalScore;
    roundResult.innerHTML = payload.warning
      ? `Loaded fallback listing. Note: ${payload.warning}`
      : payload.note || 'Submit your best guess.';
    guessForm.reset();
  } catch (error) {
    roundResult.textContent = `Unable to load listing: ${error.message}`;
    gameState.roundLocked = true;
  }
}

function finishGame() {
  roundResult.innerHTML = `<strong>Game Over!</strong> Final Score: ${gameState.totalScore.toLocaleString()} / 20,000.`;
  guessForm.classList.add('hidden');
  locationControls.classList.add('hidden');
  nextRoundBtn.classList.add('hidden');

  const entries = loadLeaderboard();
  entries.push({
    username: gameState.username,
    score: gameState.totalScore,
    mode: GAME_MODES[gameState.mode].name,
    date: new Date().toISOString()
  });

  saveLeaderboard(entries);
  refreshLeaderboard();
}

function startGame(username, mode) {
  gameState = {
    username,
    mode,
    totalScore: 0,
    roundIndex: 0,
    currentRound: null,
    locationGuess: null,
    roundLocked: false
  };

  welcome.textContent = `Player: ${username}`;
  gameCard.classList.remove('hidden');

  if (!map) {
    initializeMap();
  }

  setTimeout(() => map.invalidateSize(), 0);
  showRound();
}

function submitPriceGuess() {
  const guessValue = Number(new FormData(guessForm).get('priceGuess'));
  if (!Number.isFinite(guessValue) || guessValue <= 0 || !gameState?.currentRound || gameState.roundLocked) {
    return;
  }

  gameState.roundLocked = true;
  const round = gameState.currentRound;
  const { points, errorPercent } = calculatePricePoints(guessValue, round.price);
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
}

function submitLocationGuess() {
  if (!gameState?.currentRound || !gameState.locationGuess || gameState.roundLocked) {
    roundResult.textContent = 'Click on the map first to place your location guess.';
    return;
  }

  gameState.roundLocked = true;
  const round = gameState.currentRound;
  const distanceMeters = haversineDistanceMeters(
    gameState.locationGuess.lat,
    gameState.locationGuess.lng,
    round.lat,
    round.lng
  );
  const points = calculateLocationPoints(distanceMeters);
  gameState.totalScore += points;
  totalScoreEl.textContent = gameState.totalScore;

  revealMarker = L.marker([round.lat, round.lng]).addTo(map).bindPopup('Actual home location');
  if (guessMarker) {
    guessMarker.bindPopup('Your guess').openPopup();
  }

  roundResult.innerHTML = [
    `Actual Location: <strong>${round.cityState}</strong>`,
    `Distance error: <strong>${(distanceMeters / 1000).toFixed(1)} km</strong>`,
    `Points this round: <strong>${points}</strong>`
  ].join('<br/>');

  locationControls.classList.add('hidden');
  if (gameState.roundIndex >= TOTAL_ROUNDS - 1) {
    finishGame();
    return;
  }
  nextRoundBtn.classList.remove('hidden');
}

for (const button of modeButtons) {
  button.addEventListener('click', () => setMode(button.dataset.mode));
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = new FormData(authForm).get('username').toString().trim();

  if (username.length < 3) {
    authStatus.textContent = 'Username must be at least 3 characters.';
    return;
  }

  saveUser(username);
  authStatus.textContent = `Welcome, ${username}! Starting ${GAME_MODES[selectedMode].name}.`;
  startGame(username, selectedMode);
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitPriceGuess();
});

submitLocationGuessBtn.addEventListener('click', submitLocationGuess);

for (const button of inGameModeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    setMode(mode);
    if (!gameState || gameState.mode === mode) {
      return;
    }
    startGame(gameState.username, mode);
    roundResult.textContent = `Switched to ${GAME_MODES[mode].name}. New run started.`;
  });
}

nextRoundBtn.addEventListener('click', () => {
  gameState.roundIndex += 1;
  showRound();
});

clearLeaderboardBtn.addEventListener('click', () => {
  saveLeaderboard([]);
  refreshLeaderboard();
});

refreshLeaderboard();
setMode('price');
