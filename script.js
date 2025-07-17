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

// --- Transport Stops ---
function fetchTransportStops(location, radius = 2000) {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.maps.places) {
      reject('Google Maps Places library not loaded');
      return;
    }
    const service = new google.maps.places.PlacesService(map);
    const types = ['bus_station', 'train_station', 'transit_station', 'subway_station'];
    let allResults = [];
    let completed = 0;
    types.forEach(type => {
      service.nearbySearch({
        location,
        radius,
        type
      }, (results, status) => {
        completed++;
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          allResults = allResults.concat(results);
        }
        if (completed === types.length) {
          // Remove duplicates by place_id
          const unique = {};
          allResults.forEach(r => unique[r.place_id] = r);
          resolve(Object.values(unique));
        }
      });
    });
  });
}

function showTransportMarkers(stops) {
  if (window.transportMarkers) {
    window.transportMarkers.forEach(m => m.setMap(null));
  }
  window.transportMarkers = stops.map(stop => new google.maps.Marker({
    position: stop.geometry.location,
    map: map,
    title: stop.name,
    icon: {
      path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
      scale: 5,
      fillColor: '#ff9800',
      fillOpacity: 0.9,
      strokeColor: '#185a9d',
      strokeWeight: 2
    }
  }));
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

      // Fetch and show transport stops
      if (window.google && google.maps.places) {
        fetchTransportStops(location).then(stops => {
          showTransportMarkers(stops);
        });
      }

      // Calculate breakdown with custom weights
      const weights = getRiskWeights();
      const breakdown = [];
      let score = 0;
      let flood = isInFloodZone(location);
      if (flood) {
        breakdown.push({ factor: 'Flood Zone', value: `+${weights.flood}` });
        score += weights.flood;
      } else {
        breakdown.push({ factor: 'Flood Zone', value: '+0' });
      }
      const nearbyCrimeCount = countNearbyCrimes(location);
      breakdown.push({ factor: `Nearby Crimes (${nearbyCrimeCount})`, value: `+${nearbyCrimeCount * weights.crime}` });
      score += nearbyCrimeCount * weights.crime;
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

// --- PDF & SHARE ---
function saveReportAsPDF() {
  if (!window.jspdf) {
    showNotification('PDF export requires jsPDF.');
    return;
  }
  const doc = new window.jspdf.jsPDF();
  const score = document.getElementById('risk-score').textContent;
  const level = document.getElementById('risk-level').textContent;
  let breakdown = [['Factor', 'Contribution']];
  document.querySelectorAll('#risk-breakdown tbody tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    breakdown.push([tds[0].textContent, tds[1].textContent]);
  });
  doc.text('Financial Risk Assessment Report', 10, 14);
  doc.text(score, 10, 28);
  doc.text(level, 10, 36);
  doc.autoTable({
    startY: 44,
    head: [breakdown[0]],
    body: breakdown.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [67, 206, 162] },
    styles: { fontSize: 11 }
  });
  doc.save('risk_report.pdf');
}

function shareReport() {
  const score = document.getElementById('risk-score').textContent;
  const level = document.getElementById('risk-level').textContent;
  let breakdown = '';
  document.querySelectorAll('#risk-breakdown tbody tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    breakdown += `\n${tds[0].textContent}: ${tds[1].textContent}`;
  });
  const text = `Financial Risk Assessment Report\n${score}\n${level}\n${breakdown}`;
  if (navigator.share) {
    navigator.share({ title: 'Risk Report', text });
  } else {
    navigator.clipboard.writeText(text);
    showNotification('Report copied to clipboard!', 'success', 2000);
  }
}

// --- Risk Weights ---
function getRiskWeights() {
  return {
    flood: Number(localStorage.getItem('weight-flood')) || 50,
    crime: Number(localStorage.getItem('weight-crime')) || 5
  };
}
function setRiskWeights(flood, crime) {
  localStorage.setItem('weight-flood', flood);
  localStorage.setItem('weight-crime', crime);
}

// --- Modal Logic ---
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

  // PDF/Share
  document.getElementById('save-pdf-btn').addEventListener('click', saveReportAsPDF);
  document.getElementById('share-report-btn').addEventListener('click', shareReport);

  // Legend toggles
  const crimeToggle = document.getElementById('toggle-crime');
  const heatmapToggle = document.getElementById('toggle-heatmap');
  const floodToggle = document.getElementById('toggle-flood');
  const transportToggle = document.getElementById('toggle-transport');

  crimeToggle.addEventListener('change', () => {
    if (window.crimeMarkers) {
      window.crimeMarkers.forEach(m => m.setMap(crimeToggle.checked ? map : null));
    }
  });
  heatmapToggle.addEventListener('change', () => {
    if (heatmap) {
      heatmap.setMap(heatmapToggle.checked ? map : null);
      heatmapVisible = heatmapToggle.checked;
      document.getElementById('heatmap-toggle').classList.toggle('active', heatmapVisible);
      document.getElementById('heatmap-toggle').textContent = heatmapVisible ? 'Hide Crime Heatmap' : 'Show Crime Heatmap';
    }
  });
  floodToggle.addEventListener('change', () => {
    if (window.floodPolygons) {
      window.floodPolygons.forEach(p => p.setMap(floodToggle.checked ? map : null));
    }
  });
  transportToggle.addEventListener('change', () => {
    if (window.transportMarkers) {
      window.transportMarkers.forEach(m => m.setMap(transportToggle.checked ? map : null));
    }
  });

  // Modal open/close
  const modal = document.getElementById('weights-modal');
  const openBtn = document.getElementById('customize-weights-btn');
  const closeBtn = document.getElementById('close-weights-modal');
  const floodSlider = document.getElementById('weight-flood');
  const crimeSlider = document.getElementById('weight-crime');
  const floodVal = document.getElementById('weight-flood-value');
  const crimeVal = document.getElementById('weight-crime-value');
  openBtn.addEventListener('click', () => {
    // Load current weights
    const weights = getRiskWeights();
    floodSlider.value = weights.flood;
    crimeSlider.value = weights.crime;
    floodVal.textContent = weights.flood;
    crimeVal.textContent = weights.crime;
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  floodSlider.addEventListener('input', () => { floodVal.textContent = floodSlider.value; });
  crimeSlider.addEventListener('input', () => { crimeVal.textContent = crimeSlider.value; });
  document.getElementById('weights-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setRiskWeights(floodSlider.value, crimeSlider.value);
    modal.style.display = 'none';
    showNotification('Weights saved! New risk calculations will use your preferences.', 'success', 2000);
  });
});

// --- Store markers/polygons for legend control ---
function loadFloodZones() {
  fetch('data/flood_zones.json')
    .then(response => response.json())
    .then(data => {
      window.floodPolygons = [];
      floodZones = data.features.map(feature => {
        const coords = feature.geometry.coordinates[0].map(coord => ({
          lat: coord[1],
          lng: coord[0],
        }));
        const polygon = new google.maps.Polygon({
          paths: coords,
          strokeColor: '#FF0000',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#FF0000',
          fillOpacity: 0.35,
          map: map,
        });
        window.floodPolygons.push(polygon);
        return { paths: coords };
      });
    })
    .catch((error) => console.error('Error loading flood zones:', error));
}

function loadCrimeData() {
  fetch('data/crime_data.json')
    .then(response => response.json())
    .then(data => {
      crimes = data.filter(crime => {
        const lat = parseFloat(crime.lat);
        const lng = parseFloat(crime.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          console.warn('Skipping invalid coordinates:', crime);
          return false;
        }
        return true;
      });
      window.crimeMarkers = crimes.map(crime => {
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
      new markerClusterer.MarkerClusterer({
        map: map,
        markers: window.crimeMarkers,
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



