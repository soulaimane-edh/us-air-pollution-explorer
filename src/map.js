import L from "leaflet";
import * as d3 from "d3";
import {
  canonicalStateName,
  colorScale,
  formatValue,
  getStateRows,
  hideTooltip,
  metricLabel,
  showTooltip,
  metricShortLabel
} from "./utils.js";

const STATES_GEOJSON_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

let map;
let geoLayer;
let geojsonCache;

export async function initMap() {
  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true
  }).setView([39.5, -98.35], 4);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 8,
    attribution: "Leaflet | OpenStreetMap contributors"
  }).addTo(map);

  try {
    const response = await fetch(STATES_GEOJSON_URL);
    geojsonCache = await response.json();
  } catch {
    geojsonCache = { features: [] };
  }
}

export function updateMap({ data, pollutant, metric, year, selectedState, onStateSelect }) {
  if (!map || !geojsonCache) return;

  const rawValuesByState = data.stateYear[pollutant]?.[metric]?.[year] || {};
  const valuesByState = Object.fromEntries(
    Object.entries(rawValuesByState).map(([state, value]) => [canonicalStateName(state), value])
  );
  const sourcesByState = Object.fromEntries(
    Object.entries(data.stateYearSources?.[pollutant]?.[metric]?.[year] || {}).map(([state, value]) => [canonicalStateName(state), value])
  );
  document.querySelector(".map-panel .panel-heading h2").textContent =
    metric === "aqi" ? "Air Quality Index by State" : "Pollutant Concentration by State";

  const rows = getStateRows(data, rawValuesByState);
  const scale = colorScale(rows.map((row) => row.value), pollutant);
  const rankByState = Object.fromEntries(rows.map((row, index) => [canonicalStateName(row.name), index + 1]));

  if (geoLayer) geoLayer.remove();

  geoLayer = L.geoJSON(geojsonCache, {
    style: (feature) => {
      const state = feature.properties.name;
      const value = valuesByState[state];
      return {
        color: state === canonicalStateName(selectedState) ? "#f8fafc" : "rgba(255,255,255,0.72)",
        weight: state === canonicalStateName(selectedState) ? 2.4 : 1,
        fillColor: value === undefined ? "#2d3748" : scale(value),
        fillOpacity: value === undefined ? 0.3 : 0.85
      };
    },
    onEachFeature: (feature, layer) => {
      const state = feature.properties.name;
      const value = valuesByState[state];
      const rank = rankByState[state];
      const source = sourcesByState[state];
      layer.on({
        mouseover(event) {
          event.target.setStyle({ weight: 2.8, color: "#ffffff", fillOpacity: 0.95 });
          showTooltip(event.originalEvent, tooltipMarkup({ state, value, rank, source, pollutant, metric, year }));
        },
        mousemove(event) {
          showTooltip(event.originalEvent, tooltipMarkup({ state, value, rank, source, pollutant, metric, year }));
        },
        mouseout(event) {
          geoLayer.resetStyle(event.target);
          hideTooltip();
        },
        click() {
          if (onStateSelect) onStateSelect(state === "District of Columbia" ? "District Of Columbia" : state);
        }
      });
    }
  }).addTo(map);

  renderLegend(scale, rows, metric);
  const totalStates = data.summary?.stateCount || data.states.length;
  const imputed = data.summary?.imputedStateValues || 0;
  document.querySelector("#map-caption").textContent = `${pollutant} ${metricShortLabel(metric)} by state in ${year}. Coverage: ${rows.length}/${totalStates} states. Missing historical gaps are estimated where needed (${imputed} state-year values filled).`;
}

function tooltipMarkup({ state, value, rank, source, pollutant, metric, year }) {
  if (value === undefined) {
    return `
      <strong>${state}</strong>
      <span>No data for ${pollutant} ${metricLabel(metric).toLowerCase()} in ${year}</span>
      <small>Try another year, pollutant, or metric.</small>`;
  }
  return `
    <strong>${state}</strong>
    <span>Avg ${metricShortLabel(metric)}: ${formatValue(value, metric)}</span>
    <span>Rank: ${rank ?? "-"}</span>
    <small>${source || "Dataset"}</small>
    <small>Click for details</small>`;
}

function renderLegend(scale, rows, metric) {
  const legend = d3.select("#legend");
  legend.selectAll("*").remove();
  if (!rows.length) return;

  const [min, max] = d3.extent(rows, (row) => row.value);
  const stops = d3.range(0, 1.01, 0.2).map((step) => min + (max - min) * step);

  legend.append("div")
    .attr("class", "legend-label")
    .text(metric === "aqi" ? "AQI" : "Mean");

  legend
    .append("div")
    .attr("class", "legend-bar")
    .style("background", `linear-gradient(90deg, ${stops.map((value) => scale(value)).join(",")})`);

  const labels = legend.append("div").attr("class", "legend-labels");
  labels.append("span").text(formatValue(min, metric));
  labels.append("span").text(formatValue(max, metric));
}


export function getStateFeature(name) {
  if (!geojsonCache?.features) return null;
  const lookup = name === "District Of Columbia" ? "District of Columbia" : name;
  return geojsonCache.features.find((feature) => feature.properties.name === lookup) || null;
}


export function refreshMapSize() {
  if (!map) return;
  window.requestAnimationFrame(() => map.invalidateSize());
}
