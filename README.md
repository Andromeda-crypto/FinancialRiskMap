
# 🌐 Financial Risk Assessment Map

## Overview
The **Financial Risk Assessment Map** is an advanced, interactive geospatial tool designed to help users evaluate the **risk level of any geographic location** based on dynamic environmental and socio-economic factors. Built on the **Google Maps JavaScript API**, this application integrates **real-world flood zone data, crime density analysis, and spatial computations** to produce an **automated, data-driven risk score**.

> 📈 Ideal for **property investors, insurers, financial analysts, and urban planners** seeking actionable location-based insights.

---

## 🔍 Key Features

- **📌 Address-Based Risk Evaluation**  
  Instantly retrieve a comprehensive **risk score** and **qualitative risk level (Low, Moderate, High)** for any input address.

- **🗺️ Visual Map Layers**
  - **Flood Zones**: Visualized as shaded polygons.
  - **Crime Data**: Dynamically plotted and **clustered for performance**, even with tens of thousands of crime records.

- **🧮 Smart Risk Scoring Algorithm**
  - Checks if the location is within a **flood-prone area**.
  - Counts the number of crimes within a **1km radius**.
  - Outputs a **risk score** based on weighted environmental and social risk factors.

- **📊 On-Screen Risk Summary**
  - Displays the **risk score and level** in a clear, color-coded on-page box.
  - Non-intrusive, integrated UI for an enhanced user experience.

- **⚡ Performance Optimized**
  - Efficient marker clustering.
  - Smooth map interaction even with **10,000+ data points**.

---

## 🛠️ Tech Stack

- **Frontend:**  
  - HTML5, CSS3  
  - JavaScript (ES6+)

- **APIs & Libraries:**  
  - Google Maps JavaScript API  
  - MarkerClusterer  
  - Google Maps Geometry Library

- **Data Sources:**  
  - Flood Zones: GeoJSON  
  - Crime Data: JSON

---

## 🚀 How It Works

1. The user enters an address.
2. The app geocodes the address to coordinates.
3. The risk assessment:
   - Checks for flood zone inclusion.
   - Counts nearby crimes within a 1km radius.
4. Calculates a **composite risk score**.
5. Displays an on-screen **Risk Assessment Box** with the score and qualitative risk level.

---

## ✅ Future Enhancements

- 🛰️ Integrate **real-time flood alerts**
- 🔍 Include **economic and social indicators**
- 📈 Introduce **heatmaps** for crime visualization
- 🗂️ User authentication for **personalized risk tracking**
