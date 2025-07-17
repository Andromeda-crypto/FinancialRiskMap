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
      saveRecentSearch(address, score, riskLevel, breakdown);
      showNotification("Risk assessment complete!", 'success', 2000);
      if (riskLevel === 'High Risk' && results[0] && results[0].geometry && results[0].geometry.location) {
        showRecommendations(results[0].geometry.location);
      } else {
        document.getElementById('recommendations-box').style.display = 'none';
      }
      renderReports(address);
      showRiskAlert(riskLevel, address);
      showAIPrediction(address, score, riskLevel);
    } else {
      showNotification("Geocode was not successful: " + status);
      hideRiskAlert();
      hideAIPrediction();
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

  document.getElementById('report-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const address = document.getElementById('address').value.trim();
    const text = document.getElementById('report-text').value.trim();
    if (!address || !text) return;
    addReportForAddress(address, text);
    document.getElementById('report-text').value = '';
    renderReports(address);
    showNotification('Report submitted! Thank you for contributing.', 'success', 2000);
  });

  // Compare modal open/close
  const compareModal = document.getElementById('compare-modal');
  const openCompareBtn = document.getElementById('open-compare-btn');
  const closeCompareBtn = document.getElementById('close-compare-modal');
  openCompareBtn.addEventListener('click', () => { compareModal.style.display = 'flex'; });
  closeCompareBtn.addEventListener('click', () => { compareModal.style.display = 'none'; });
  window.addEventListener('click', (e) => { if (e.target === compareModal) compareModal.style.display = 'none'; });
  // Compare form logic
  document.getElementById('compare-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const addr1 = document.getElementById('compare-address-1').value.trim();
    const addr2 = document.getElementById('compare-address-2').value.trim();
    if (!addr1 || !addr2) return;
    const [r1, r2] = await Promise.all([
      getRiskAndBreakdown(addr1),
      getRiskAndBreakdown(addr2)
    ]);
    renderCompareResults(r1, r2);
  });

  document.getElementById('locate-me-btn').addEventListener('click', function() {
    if (!navigator.geolocation) {
      showNotification('Geolocation is not supported by your browser.');
      return;
    }
    showSpinner();
    navigator.geolocation.getCurrentPosition(function(pos) {
      const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      // Reverse geocode to address
      geocoder.geocode({ location: latlng }, (results, status) => {
        hideSpinner();
        if (status === 'OK' && results[0]) {
          document.getElementById('address').value = results[0].formatted_address;
          geocodeAddress();
        } else {
          showNotification('Could not determine address for your location.');
        }
      });
    }, function() {
      hideSpinner();
      showNotification('Unable to retrieve your location.');
    });
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

function saveRecentSearch(region, score, level, breakdown) {
  let searches = JSON.parse(localStorage.getItem('recentRiskSearches') || '[]');
  searches.unshift({ region, score, level, breakdown, timestamp: Date.now() });
  if (searches.length > 10) searches = searches.slice(0, 10);
  localStorage.setItem('recentRiskSearches', JSON.stringify(searches));
}

async function getNearbyNeighborhoods(location, radius = 3000) {
  return new Promise((resolve, reject) => {
    if (!window.google || !google.maps.places) {
      reject('Google Maps Places library not loaded');
      return;
    }
    const service = new google.maps.places.PlacesService(map);
    service.nearbySearch({
      location,
      radius,
      type: 'neighborhood'
    }, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        resolve(results.map(r => r.name));
      } else {
        resolve([]);
      }
    });
  });
}

async function getRiskForAddress(address) {
  return new Promise((resolve) => {
    geocoder.geocode({ address: address }, (results, status) => {
      if (status === "OK") {
        const location = results[0].geometry.location;
        let score = 0;
        const weights = getRiskWeights();
        let flood = isInFloodZone(location);
        if (flood) score += weights.flood;
        const nearbyCrimeCount = countNearbyCrimes(location);
        score += nearbyCrimeCount * weights.crime;
        // For now, ignore transport in recommendations
        const riskLevel = classifyRisk(score);
        resolve({ address, score, riskLevel });
      } else {
        resolve(null);
      }
    });
  });
}

async function showRecommendations(location) {
  const box = document.getElementById('recommendations-box');
  box.innerHTML = '';
  box.style.display = 'none';
  // Find nearby neighborhoods
  const names = await getNearbyNeighborhoods(location);
  if (!names.length) return;
  // Get risk for each, filter for lower risk
  const recs = [];
  for (let name of names.slice(0, 6)) {
    const risk = await getRiskForAddress(name);
    if (risk && (risk.riskLevel === 'Moderate Risk' || risk.riskLevel === 'Low Risk')) {
      recs.push(risk);
      if (recs.length >= 3) break;
    }
  }
  if (!recs.length) return;
  box.innerHTML = '<b>Safer Nearby Recommendations:</b>' + recs.map(r =>
    `<div class="recommendation-item">${r.address} <span style="color:${r.riskLevel==='Low Risk'?'#43cea2':'#ff9800'}">${r.riskLevel}</span> <button class="recommendation-btn" onclick="geocodeAddressFromRec('${r.address.replace(/'/g, "\\'")}')">Check</button></div>`
  ).join('');
  box.style.display = '';
}

window.geocodeAddressFromRec = function(address) {
  document.getElementById('address').value = address;
  geocodeAddress();
}

function getReportsForAddress(address) {
  const all = JSON.parse(localStorage.getItem('communityReports') || '{}');
  return all[address] || [];
}
function addReportForAddress(address, text) {
  const all = JSON.parse(localStorage.getItem('communityReports') || '{}');
  if (!all[address]) all[address] = [];
  all[address].unshift({ text, time: Date.now() });
  if (all[address].length > 10) all[address] = all[address].slice(0, 10);
  localStorage.setItem('communityReports', JSON.stringify(all));
}
function renderReports(address) {
  const section = document.getElementById('community-reports');
  const list = document.getElementById('reports-list');
  const reports = getReportsForAddress(address);
  if (!address) { section.style.display = 'none'; return; }
  section.style.display = '';
  list.innerHTML = '';
  if (!reports.length) {
    list.innerHTML = '<li style="color:#888;">No reports yet for this location.</li>';
    return;
  }
  for (const r of reports) {
    const li = document.createElement('li');
    li.className = 'report-item';
    li.innerHTML = `${r.text} <span class='report-meta'>${timeAgo(r.time)}</span>`;
    list.appendChild(li);
  }
}
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + ' min ago';
  if (diff < 86400) return Math.floor(diff/3600) + ' hr ago';
  return Math.floor(diff/86400) + 'd ago';
}

function showRiskAlert(riskLevel, address) {
  const alertBox = document.getElementById('risk-alert');
  let message = '';
  let cls = '';
  if (riskLevel === 'High Risk') {
    message = '⚠️ High Risk Area! Exercise extra caution.';
    cls = 'high';
  } else if (riskLevel === 'Moderate Risk') {
    message = '⚠️ Moderate Risk. Stay alert and informed.';
    cls = 'moderate';
  } else {
    message = '✔️ Low Risk. Area is generally safe.';
    cls = 'low';
  }
  // Check for recent community reports (last 24h)
  const reports = getReportsForAddress(address);
  const recent = reports.filter(r => Date.now() - r.time < 24*3600*1000);
  if (recent.length > 0) {
    message += ` <br>🗣️ ${recent.length} recent community report${recent.length>1?'s':''} for this area!`;
    cls = 'high';
  }
  alertBox.innerHTML = message;
  alertBox.className = cls;
  alertBox.style.display = '';
}
function hideRiskAlert() {
  const alertBox = document.getElementById('risk-alert');
  alertBox.style.display = 'none';
}

function showAIPrediction(address, currentScore, riskLevel) {
  const box = document.getElementById('ai-prediction-box');
  // Get recent scores for this address
  const searches = JSON.parse(localStorage.getItem('recentRiskSearches') || '[]');
  const recent = searches.filter(s => s.region === address).slice(0, 5);
  const scores = recent.map(s => s.score);
  let trend = 'stable';
  if (scores.length >= 2) {
    const diff = scores[0] - scores[scores.length-1];
    if (diff > 10) trend = 'decreasing';
    else if (diff < -10) trend = 'increasing';
  }
  // Generate advice
  let advice = '';
  if (trend === 'increasing') advice = 'Risk is trending up. Consider extra caution or alternative areas.';
  else if (trend === 'decreasing') advice = 'Risk is trending down. Area may become safer soon.';
  else advice = 'Risk is stable. Stay alert and check for updates.';
  if (riskLevel === 'High Risk') advice += ' Avoid late hours and crowded places.';
  if (riskLevel === 'Low Risk') advice += ' Area is generally safe, but always stay aware.';
  box.innerHTML = `<div class='ai-title'>AI Risk Prediction & Advice</div><div>Predicted trend: <b>${trend}</b></div><div class='ai-advice'>${advice}</div>`;
  box.style.display = '';
}
function hideAIPrediction() {
  document.getElementById('ai-prediction-box').style.display = 'none';
}

async function getRiskAndBreakdown(address) {
  return new Promise((resolve) => {
    geocoder.geocode({ address: address }, (results, status) => {
      if (status === "OK") {
        const location = results[0].geometry.location;
        let score = 0;
        const weights = getRiskWeights();
        let flood = isInFloodZone(location);
        const breakdown = [];
        if (flood) {
          breakdown.push({ factor: 'Flood Zone', value: `+${weights.flood}` });
          score += weights.flood;
        } else {
          breakdown.push({ factor: 'Flood Zone', value: '+0' });
        }
        const nearbyCrimeCount = countNearbyCrimes(location);
        breakdown.push({ factor: `Nearby Crimes (${nearbyCrimeCount})`, value: `+${nearbyCrimeCount * weights.crime}` });
        score += nearbyCrimeCount * weights.crime;
        // For now, ignore transport in compare
        const riskLevel = classifyRisk(score);
        resolve({ address, score, riskLevel, breakdown });
      } else {
        resolve({ address, error: true });
      }
    });
  });
}

function renderCompareResults(r1, r2) {
  const box = document.getElementById('compare-results');
  box.innerHTML = '';
  [r1, r2].forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'compare-card';
    if (r.error) {
      card.innerHTML = `<h4>Address ${i+1}</h4><div style='color:#e53935;'>Not found or invalid address.</div>`;
    } else {
      card.innerHTML = `<h4>${r.address}</h4>
        <div class='compare-risk ${r.riskLevel.toLowerCase().replace(' ','')}'>${r.riskLevel}</div>
        <div style='font-size:1.08em;font-weight:600;'>Score: ${r.score}</div>
        <div class='compare-breakdown'><ul>${r.breakdown.map(b=>`<li>${b.factor}: <b>${b.value}</b></li>`).join('')}</ul></div>`;
    }
    box.appendChild(card);
  });
}



