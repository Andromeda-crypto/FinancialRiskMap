let map;
let geocoder;
let marker;

function initMap() {
  const map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 25.6, lng: 85.1 }, // e.g., center of Bihar
    zoom: 7,
  });

  fetch('data/flood_zones.json')
    .then(response => response.json())
    .then(data => {
      data.features.forEach(feature => {
        const coords = feature.geometry.coordinates[0].map(coord => ({
          lat: coord[1],
          lng: coord[0]
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
      });
    })
    .catch(error => console.error('Error loading flood zones:', error));
}


function geocodeAddress() {
    const address = document.getElementById("address").value;

    if (!address) {
        alert("Please enter a valid address.");
        return;
    }

    geocoder.geocode({ address: address }, (results, status) => {
        if (status === "OK") {
            map.setCenter(results[0].geometry.location);
            if (marker) {
                marker.setMap(null);
            }

            marker = new google.maps.Marker({
                map: map,
                position: results[0].geometry.location,
                animation: google.maps.Animation.DROP,
            });
            console.log("Coordinates: ", results[0].geometry.location);

        } else {
            alert("Geocode was not successful: " + status);
        }
    });
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
