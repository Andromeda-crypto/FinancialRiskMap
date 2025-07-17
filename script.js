let map;
let geocoder;
let marker;
let floodZones = [];
let crimes = [];

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 28.6139, lng: 77.2090 },
    zoom: 10,
  });

  geocoder = new google.maps.Geocoder();

  // Load flood zones
  fetch('data/flood_zones.json')
    .then(response => response.json())
    .then(data => {
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

        return { paths: coords };
      });
    })
    .catch((error) => console.error('Error loading flood zones:', error));

  // Load and plot crime markers with clustering
  fetch('data/crime_data.json')
    .then((response) => response.json())
    .then((data) => {
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

      const markers = crimes.map((crime) => {
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

    })
    .catch((error) => console.error('Error loading crime data:', error));
}

function geocodeAddress() {
  const address = document.getElementById("address").value;

  if (!address) {
    alert("Please enter a valid address.");
    return;
  }

  geocoder.geocode({ address: address }, (results, status) => {
    if (status === "OK") {
      const location = results[0].geometry.location;
      map.setCenter(location);

      if (marker) {
        marker.setMap(null);
      }

      marker = new google.maps.Marker({
        map: map,
        position: location,
        animation: google.maps.Animation.DROP,
      });

      console.log("Coordinates: ", location);

      const riskScore = calculateRiskScore(location);
      const riskLevel = classifyRisk(riskScore);
      console.log("Risk Score:", riskScore, "| Risk Level:", riskLevel);

      alert(`Risk Assessment\nScore: ${riskScore}\nLevel: ${riskLevel}`);
    } else {
      alert("Geocode was not successful: " + status);
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

