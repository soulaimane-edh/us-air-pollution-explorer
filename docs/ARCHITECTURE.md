# Architecture

The project is a local Vite web application using modular JavaScript.

## Main flow

```text
Raw CSV / optional EPA AirData ZIPs
        ↓
Python preprocessing (`scripts/preprocess.py`)
        ↓
Processed JSON files (`public/data/`)
        ↓
D3.js charts + Leaflet map in the browser
```

## Main modules

| File | Responsibility |
|---|---|
| `src/main.js` | Global state, filters, view modes, rendering orchestration |
| `src/map.js` | Leaflet US choropleth map and state selection |
| `src/lineChart.js` | Trend over time chart and selected-year marker |
| `src/barChart.js` | Top 10 polluted cities horizontal ranked bar chart |
| `src/heatmap.js` | State/year heatmap |
| `src/radarChart.js` | Pollution profile vs national average |
| `src/seasonalHeatmap.js` | Monthly seasonal heatmap |
| `src/utils.js` | Shared formatting, scales, helpers, tooltips |
| `src/style.css` | Dashboard layout, dark theme, responsive rules |

## View modes

- **Overview**: one-screen dashboard for quick understanding
- **State Profile**: deeper secondary analysis
- **Compare**: state-to-state comparison

Focus mode is intentionally kept only for the map to avoid layout instability.
