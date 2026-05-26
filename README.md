# US Air Pollution Explorer

Interactive **D3.js + Leaflet** dashboard for exploring United States air pollution observations from **2000 to 2016**.

The dashboard transforms a large multidimensional air pollution dataset into an exploratory interface with geographic, temporal, ranking, seasonal, and comparison views.

## Preview

Screenshots are available in [`docs/assets/screenshots`](docs/assets/screenshots/).

## Demo Video

A demo video showing the dashboard functionalities is available here:

[Watch the demo video](docs/demo/air-pollution-dashboard-demo.mp4)

## Features

- **One-screen Overview** for fast interpretation.
- **Interactive US choropleth map** with state selection and tooltips.
- **Pollutant filters** for O3, NO2, SO2, and CO.
- **Metric toggle** between AQI and mean concentration.
- **Year slider and simulation mode** to animate changes from 2000 to 2016.
- **KPI cards** for national average, highest state, most polluted city, cleanest state, and monitoring sites.
- **Trend over time** chart with selected-year marker.
- **State Summary** with rank, value, change vs 2000, monitoring sites, and pollutant mix.
- **Top 10 polluted cities** ranked horizontal bar chart.
- **State Profile** with radar/profile chart, seasonal heatmap, and state-year heatmap.
- **Compare Mode** for side-by-side state comparison.
- **Map-only focus mode** for spatial exploration.

## Technology stack

| Technology | Role |
|---|---|
| Python | Data preprocessing and aggregation |
| D3.js | Custom charts, scales, axes, interaction, tooltips |
| Leaflet | Interactive geographic map |
| Vite | Development server and production build |
| HTML / CSS / JavaScript | Web application structure and interface |
| JSON | Processed browser-ready data |

## Repository structure

```text
us-air-pollution-explorer/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── map.js
│   ├── lineChart.js
│   ├── barChart.js
│   ├── heatmap.js
│   ├── radarChart.js
│   ├── seasonalHeatmap.js
│   ├── utils.js
│   └── style.css
├── public/data/
│   ├── dashboard-data.json
│   └── monthly-data.json
├── scripts/
│   └── preprocess.py
├── data/
│   └── README.md
├── docs/
│   ├── SETUP.md
│   ├── ARCHITECTURE.md
│   ├── EVALUATION.md
│   ├── AirPollution_Report_FINAL.pdf
│   ├── Final_Presentation_Information_Visualisation.pptx
│   └── assets/screenshots/
└── .github/workflows/build.yml
```

## Quick start

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

Use another port if needed:

```bash
npm run dev -- --port 5175
```

## Preprocessing

The browser uses compact processed JSON files from `public/data/`.

To regenerate them, place the raw CSV in `data/` and run:

```bash
python scripts/preprocess.py
```

## Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Data

The project uses US pollution data from 2000 to 2016, including O3, NO2, SO2, and CO with AQI and mean concentration metrics. Processed JSON files are included so the dashboard can run without the raw CSV.

Large raw CSV and EPA ZIP files are not committed to GitHub. See [`data/README.md`](data/README.md).

## Authors

- Soulaimane Ed-dahmani
- Muhammad Zaryab
- Muhammad Ahmad
- Matthys Aristide Raymond Jean Tachon-Panafieu

## License

MIT License. See [`LICENSE`](LICENSE).
