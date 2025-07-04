let map;
let geocoder;
let marker;

function initMap() {
    // Intializing with Map centered at New Delhi 
    map = new google.maps.Map(document.getElementById('map'),

{
    center : {lat: 28.6139, lng: 77.2090 },
    zoom: 12,
    disableDefaultUI: false
    });

    geocoder = new google.maps.Geocoder();
    
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
