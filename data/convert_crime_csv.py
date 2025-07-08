import csv
import json
import os

# Map cities to coordinates
city_coords = {
    "Delhi": {"lat": 28.6139, "lng": 77.2090},
    "Mumbai": {"lat": 19.0760, "lng": 72.8777},
    "Chennai": {"lat": 13.0827, "lng": 80.2707},
    "Bengaluru": {"lat": 12.9716, "lng": 77.5946},
    "Kolkata": {"lat": 22.5726, "lng": 88.3639},
    "Gangtok": {"lat": 27.3314, "lng": 88.6138}
}


script_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(script_dir, 'crime_dataset_india.csv')
json_path = os.path.join(script_dir, 'crime_data.json')

output = []

# Read CSV and filter rows by city
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        city = row['City'].strip()
        crime_type = row['Crime Description'].strip()

        if city in city_coords:
            output.append({
                "lat": city_coords[city]['lat'],
                "lng": city_coords[city]['lng'],
                "type": crime_type
            })

# Write to JSON
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2)

print(f" Created crime_data.json with {len(output)} entries in /data folder.")

