let map;
let geocoder;
let marker;
let floodZones = [];
let crimes = [];
let heatmap;
let heatmapVisible = false;

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 28.6139, lng: 77.2090 },
    zoom: 10,
  });

  geocoder = new google.maps.Geocoder();

  loadFloodZones();
  loadCrimeData();
}

function loadFloodZones() {
  fetch('data/flood_zones.json')
    .then(response => response.json())
    .then(data => {
      floodZones = data.features.map(feature => {
        const coords = feature.geometry.coordinates[0].map(coord => ({
          lat: coord[1],
          lng: coord[0],
        }));

        new google.maps.Polygon({
          paths: coords,
          strokeColor: '#FF0000',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#FF0000',
          fillOpacity: 0.35,
          map: map,
        });

        return { paths: coords };
      });
    })
    .catch((error) => console.error('Error loading flood zones:', error));
}

function loadCrimeData() {
  fetch('data/crime_data.json')
    .then(response => response.json())
    .then(data => {
      console.log(`Loaded ${data.length} crime records`);

      crimes = data.filter(crime => {
        const lat = parseFloat(crime.lat);
        const lng = parseFloat(crime.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          console.warn('Skipping invalid coordinates:', crime);
          return false;
        }
        return true;
      });

      const markers = crimes.map(crime => {
        const lat = parseFloat(crime.lat);
        const lng = parseFloat(crime.lng);
        return new google.maps.Marker({
          position: { lat, lng },
          title: `Crime: ${crime.type}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor: '#0000FF',
            fillOpacity: 0.6,
            strokeWeight: 0,
          },
        });
      });

      console.log(`Created ${markers.length} valid markers`);

      new markerClusterer.MarkerClusterer({
        map: map,
        markers: markers,
      });

      // If heatmap toggle was pressed before data loaded
      if (heatmapVisible && window.google && google.maps.visualization) {
        if (!heatmap) {
          heatmap = new google.maps.visualization.HeatmapLayer({
            data: crimes.map(c => new google.maps.LatLng(parseFloat(c.lat), parseFloat(c.lng))),
            map: map,
            radius: 32,
            opacity: 0.6,
            gradient: [
              'rgba(67,206,162,0)',
              'rgba(67,206,162,0.5)',
              'rgba(255,152,0,0.7)',
              'rgba(229,57,53,1)'
            ]
          });
        } else {
          heatmap.setMap(map);
        }
      }
    })
    .catch(error => console.error('Error loading crime data:', error));
}

// --- Notification & Spinner Helpers ---
function showNotification(message, type = 'error', timeout = 3500) {
  const notif = document.getElementById('notification');
  notif.textContent = message;
  notif.className = type === 'success' ? 'success' : '';
  notif.style.display = 'block';
  if (timeout > 0) {
    setTimeout(() => { notif.style.display = 'none'; }, timeout);
  }
}

function hideNotification() {
  const notif = document.getElementById('notification');
  notif.style.display = 'none';
}

function showSpinner() {
  const spinner = document.getElementById('loading-spinner');
  spinner.style.display = 'block';
}

function hideSpinner() {
  const spinner = document.getElementById('loading-spinner');
  spinner.style.display = 'none';
}

function geocodeAddress() {
  const address = document.getElementById("address").value.trim();

  hideNotification();

  if (!address) {
    showNotification("Please enter a valid address.");
    return;
  }

  showSpinner();

  geocoder.geocode({ address: address }, (results, status) => {
    hideSpinner();
    if (status === "OK") {
      const location = results[0].geometry.location;
      map.setCenter(location);

      placeMarker(location);

      // Calculate breakdown
      const breakdown = [];
      let score = 0;
      let flood = isInFloodZone(location);
      if (flood) {
        breakdown.push({ factor: 'Flood Zone', value: '+50' });
        score += 50;
      } else {
        breakdown.push({ factor: 'Flood Zone', value: '+0' });
      }
      const nearbyCrimeCount = countNearbyCrimes(location);
      breakdown.push({ factor: `Nearby Crimes (${nearbyCrimeCount})`, value: `+${nearbyCrimeCount * 5}` });
      score += nearbyCrimeCount * 5;
      const riskLevel = classifyRisk(score);
      console.log("Risk Score:", score, "| Risk Level:", riskLevel);

      displayRiskResult(score, riskLevel, breakdown);
      showNotification("Risk assessment complete!", 'success', 2000);
    } else {
      showNotification("Geocode was not successful: " + status);
    }
  });
}

// --------- RISK ASSESSMENT UTILITIES -----------

function isInFloodZone(location) {
  return floodZones.some(zone => {
    const polygon = new google.maps.Polygon({ paths: zone.paths });
    return google.maps.geometry.poly.containsLocation(location, polygon);
  });
}

function countNearbyCrimes(location, radiusMeters = 1000) {
  return crimes.filter(crime => {
    const crimeLatLng = new google.maps.LatLng(parseFloat(crime.lat), parseFloat(crime.lng));
    const distance = google.maps.geometry.spherical.computeDistanceBetween(location, crimeLatLng);
    return distance <= radiusMeters;
  }).length;
}

function calculateRiskScore(location) {
  let score = 0;

  if (isInFloodZone(location)) {
    console.log('Location is within a flood zone.');
    score += 50;
  }

  const nearbyCrimeCount = countNearbyCrimes(location);
  console.log(`Number of nearby crimes within 1km: ${nearbyCrimeCount}`);
  score += nearbyCrimeCount * 5;

  return score;
}

function classifyRisk(score) {
  if (score >= 80) return 'High Risk';
  if (score >= 40) return 'Moderate Risk';
  return 'Low Risk';
}

function displayRiskResult(score, level, breakdown) {
  const resultBox = document.getElementById('risk-result');
  const scoreElement = document.getElementById('risk-score');
  const levelElement = document.getElementById('risk-level');
  const breakdownTable = document.getElementById('risk-breakdown');
  const breakdownBody = breakdownTable.querySelector('tbody');

  scoreElement.textContent = `Risk Score: ${score}`;
  levelElement.textContent = `Risk Level: ${level}`;

  if (level === 'High Risk') {
    levelElement.style.color = 'red';
  } else if (level === 'Moderate Risk') {
    levelElement.style.color = 'orange';
  } else {
    levelElement.style.color = 'green';
  }

  // Populate breakdown table
  breakdownBody.innerHTML = '';
  if (breakdown && Array.isArray(breakdown)) {
    breakdown.forEach(row => {
      const tr = document.createElement('tr');
      const tdFactor = document.createElement('td');
      tdFactor.textContent = row.factor;
      const tdValue = document.createElement('td');
      tdValue.textContent = row.value;
      tr.appendChild(tdFactor);
      tr.appendChild(tdValue);
      breakdownBody.appendChild(tr);
    });
    breakdownTable.style.display = '';
  } else {
    breakdownTable.style.display = 'none';
  }

  resultBox.style.display = 'block';
}

function placeMarker(location) {
  if (marker) {
    marker.setMap(null);
  }

  marker = new google.maps.Marker({
    position: location,
    map: map,
    animation: google.maps.Animation.DROP,
  });

  console.log("Clicked coordinates: ", location);
}

// --- THEME TOGGLE ---
function setTheme(isLight) {
  document.body.classList.toggle('light', isLight);
}

document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('change', (e) => {
    setTheme(e.target.checked);
    localStorage.setItem('theme', e.target.checked ? 'light' : 'dark');
  });
  // Load theme from storage
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    themeToggle.checked = true;
    setTheme(true);
  }

  // Heatmap toggle
  const heatmapBtn = document.getElementById('heatmap-toggle');
  heatmapBtn.addEventListener('click', () => {
    if (!heatmap) {
      heatmap = new google.maps.visualization.HeatmapLayer({
        data: crimes.map(c => new google.maps.LatLng(parseFloat(c.lat), parseFloat(c.lng))),
        map: heatmapVisible ? map : null,
        radius: 32,
        opacity: 0.6,
        gradient: [
          'rgba(67,206,162,0)',
          'rgba(67,206,162,0.5)',
          'rgba(255,152,0,0.7)',
          'rgba(229,57,53,1)'
        ]
      });
    }
    heatmapVisible = !heatmapVisible;
    heatmap.setMap(heatmapVisible ? map : null);
    heatmapBtn.classList.toggle('active', heatmapVisible);
    heatmapBtn.textContent = heatmapVisible ? 'Hide Crime Heatmap' : 'Show Crime Heatmap';
  });
});



