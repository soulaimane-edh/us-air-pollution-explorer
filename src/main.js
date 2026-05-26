import "leaflet/dist/leaflet.css";
import "./style.css";
import * as d3 from "d3";
import { renderBarChart } from "./barChart.js";
import { renderHeatmap } from "./heatmap.js";
import { getStateFeature, initMap, refreshMapSize, updateMap } from "./map.js";
import { renderLineChart } from "./lineChart.js";
import { renderRadarChart } from "./radarChart.js";
import { renderSeasonalHeatmap } from "./seasonalHeatmap.js";
import { enrichMissingStateValues, formatValue, getStateRows, metricLabel, POLLUTANT_META } from "./utils.js";

const state = {
  pollutant: "O3",
  metric: "aqi",
  year: "2016",
  selectedState: "All States",
  layoutPreset: "overview",
  compareA: "California",
  compareB: "Texas"
};

let dashboardData;
let monthlyData;
let playTimer;

const refreshAfterPanelResize = debounce(() => {
  refreshMapSize();
  renderCharts();
}, 90);

async function boot() {
  [dashboardData, monthlyData] = await Promise.all([
    d3.json("/data/dashboard-data.json"),
    d3.json("/data/monthly-data.json")
  ]);
  enrichMissingStateValues(dashboardData);
  state.year = String(dashboardData.years.at(-1));
  setupControls();
  setupLayoutPresets();
  setupCompareControls();
  attachHeaderButtons();
  await initMap();
  render();
  setupResizablePanels();
  window.addEventListener("resize", debounce(() => {
    refreshMapSize();
    renderCharts();
  }, 120));
}

function setupControls() {
  const pollutant = document.querySelector("#pollutant");
  pollutant.innerHTML = dashboardData.pollutants
    .map((id) => `<option value="${id}">${id} (${POLLUTANT_META[id].name})</option>`)
    .join("");
  pollutant.value = state.pollutant;
  pollutant.addEventListener("change", (event) => {
    state.pollutant = event.target.value;
    render();
  });

  renderButtons("#metric", dashboardData.metrics, "metric");
  syncSelectOptions("#state-filter");
  syncSelectOptions("#trend-state");

  document.querySelector("#state-filter").addEventListener("change", (event) => setSelectedState(event.target.value));
  document.querySelector("#trend-state").addEventListener("change", (event) => setSelectedState(event.target.value));

  const yearInput = document.querySelector("#year");
  yearInput.min = d3.min(dashboardData.years);
  yearInput.max = d3.max(dashboardData.years);
  yearInput.value = state.year;
  yearInput.addEventListener("input", (event) => {
    state.year = event.target.value;
    render();
  });

  const barMetric = document.querySelector("#bar-metric");
  barMetric.innerHTML = dashboardData.metrics.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
  barMetric.value = state.metric;
  barMetric.addEventListener("change", (event) => {
    state.metric = event.target.value;
    render();
  });

  document.querySelector("#reset-filters").addEventListener("click", () => {
    state.pollutant = "O3";
    state.metric = "aqi";
    state.year = String(dashboardData.years.at(-1));
    setSelectedState("All States", false);
    render();
  });

  document.querySelector("#clear-state").addEventListener("click", () => setSelectedState("All States"));
  document.querySelector("#play-year").addEventListener("click", togglePlay);
}


function setupLayoutPresets() {
  document.querySelectorAll(".layout-presets button[data-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      // Preset buttons should rearrange the dashboard without jumping the user away from the map.
      // The sidebar Compare link still scrolls to the comparison section at the end.
      setLayoutPreset(button.dataset.layout, { scrollToPanel: false });
    });
  });

  // The sidebar Compare link used to jump to a hidden panel while the dashboard was still in Overview mode.
  // Route every Compare entry point through the preset switch so the panel becomes visible first.
  document.querySelectorAll('a[href="#compare-section"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setLayoutPreset("compare", { scrollToPanel: true });
      history.replaceState(null, "", "#compare-section");
    });
  });

  const initialPreset = window.location.hash === "#compare-section" ? "compare" : state.layoutPreset;
  setLayoutPreset(initialPreset, { scrollToPanel: initialPreset === "compare" });
}

function setLayoutPreset(preset, options = {}) {
  const allowedPresets = ["overview", "state-profile", "compare"];
  state.layoutPreset = allowedPresets.includes(preset) ? preset : "overview";
  clearFocusedPanel();
  const grid = document.querySelector(".dashboard-grid");
  const shell = document.querySelector(".app-shell");
  const presets = ["overview", "state-profile", "compare"];
  grid?.classList.remove(...presets.map((item) => `layout-${item}`));
  shell?.classList.remove(...presets.map((item) => `layout-${item}`));
  grid?.classList.add(`layout-${state.layoutPreset}`);
  shell?.classList.add(`layout-${state.layoutPreset}`);

  document.querySelectorAll(".layout-presets button[data-layout]").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === state.layoutPreset);
  });

  refreshMapSize();
  window.requestAnimationFrame(() => {
    renderCharts();
    const target = state.layoutPreset === "compare" ? document.querySelector(".layout-presets") : document.querySelector("#overview");
    if (options.scrollToPanel || state.layoutPreset !== "overview") {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function setupCompareControls() {
  normalizeCompareSelection();
  syncCompareControls();

  document.querySelector("#compare-a")?.addEventListener("change", (event) => {
    state.compareA = event.target.value;
    if (state.compareA === state.compareB) state.compareB = nextComparableState(state.compareA);
    syncCompareControls();
    renderCharts();
  });

  document.querySelector("#compare-b")?.addEventListener("change", (event) => {
    state.compareB = event.target.value;
    if (state.compareA === state.compareB) state.compareA = nextComparableState(state.compareB);
    syncCompareControls();
    renderCharts();
  });
}

function normalizeCompareSelection() {
  const states = dashboardData.states || [];
  if (!states.length) return;
  if (!states.includes(state.compareA)) state.compareA = states[0];
  if (!states.includes(state.compareB)) state.compareB = states[1] || states[0];
  if (state.compareA === state.compareB && states.length > 1) state.compareB = nextComparableState(state.compareA);
}

function nextComparableState(name) {
  const states = dashboardData.states || [];
  if (!states.length) return name;
  const index = states.indexOf(name);
  return states[(index + 1 + states.length) % states.length];
}

function syncCompareControls() {
  normalizeCompareSelection();
  const states = dashboardData.states || [];
  const fill = (select, value) => {
    if (!select) return;
    select.innerHTML = states.map((name) => `<option value="${name}">${name}</option>`).join("");
    select.value = value;
  };
  fill(document.querySelector("#compare-a"), state.compareA);
  fill(document.querySelector("#compare-b"), state.compareB);
}







function attachHeaderButtons() {
  const [shareButton, exportButton] = [...document.querySelectorAll(".header-actions button")];
  shareButton?.addEventListener("click", async () => {
    const shareText = `US Air Pollution Explorer — ${state.pollutant} ${metricLabel(state.metric)} in ${state.year}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "US Air Pollution Explorer", text: shareText, url: window.location.href });
      } catch {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      shareButton.textContent = "Copied";
      setTimeout(() => { shareButton.textContent = "Share"; }, 1500);
    }
  });

  exportButton?.addEventListener("click", () => {
    const svg = document.querySelector("#line-chart");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `air-pollution-${state.pollutant}-${state.metric}-${state.year}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  });
}


function setupResizablePanels() {
  const grid = document.querySelector(".dashboard-grid");
  const panels = [...document.querySelectorAll(".dashboard-grid .panel")];

  panels.forEach((panel) => {
    if (panel.dataset.layoutReady === "true") return;
    panel.dataset.layoutReady = "true";
    panel.classList.add("layout-panel");
    addPanelFocusButton(panel);
  });

  const observer = new ResizeObserver(() => {
    window.requestAnimationFrame(() => refreshAfterPanelResize());
  });
  panels.forEach((panel) => observer.observe(panel));

  document.querySelector("#reset-layout")?.addEventListener("click", () => {
    clearFocusedPanel();
    setLayoutPreset("overview");
    refreshMapSize();
    renderCharts();
  });
}

function addPanelFocusButton(panel) {
  // Keep focus mode only for the map. Focusing small analytical cards caused
  // empty space and repeated secondary views; the map is the only panel that
  // benefits from a large safe focus view.
  if (!panel.classList.contains("map-panel")) return;

  const heading = panel.querySelector(".panel-heading");
  if (!heading) return;

  const actions = document.createElement("div");
  actions.className = "panel-layout-actions";

  const focus = document.createElement("button");
  focus.type = "button";
  focus.className = "panel-focus-button";
  focus.textContent = "Focus Map";
  focus.setAttribute("aria-pressed", "false");
  focus.title = "Show the map in a large safe focus view. Press again to return.";
  focus.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePanelFocus(panel);
  });

  actions.appendChild(focus);
  heading.appendChild(actions);
}

function togglePanelFocus(panel) {
  const isAlreadyFocused = panel.classList.contains("is-focused-panel");
  clearFocusedPanel();

  if (!isAlreadyFocused) {
    document.querySelector(".dashboard-grid")?.classList.add("has-focused-panel");
    panel.classList.add("is-focused-panel");
    panel.querySelector(".panel-focus-button")?.setAttribute("aria-pressed", "true");
    const button = panel.querySelector(".panel-focus-button");
    if (button) button.textContent = "Exit Focus";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  refreshMapSize();
  renderCharts();
}

function clearFocusedPanel() {
  document.querySelector(".dashboard-grid")?.classList.remove("has-focused-panel");
  document.querySelectorAll(".is-focused-panel").forEach((panel) => {
    panel.classList.remove("is-focused-panel");
    const button = panel.querySelector(".panel-focus-button");
    if (button) {
      button.textContent = "Focus Map";
      button.setAttribute("aria-pressed", "false");
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncSelectOptions(selector) {
  const select = document.querySelector(selector);
  select.innerHTML = ["All States", ...dashboardData.states].map((name) => `<option value="${name}">${name}</option>`).join("");
  select.value = state.selectedState;
}

function renderButtons(selector, options, key) {
  const group = d3.select(selector);
  group.selectAll("button")
    .data(options)
    .join("button")
    .attr("type", "button")
    .classed("active", (option) => option.id === state[key])
    .text((option) => option.label)
    .on("click", (_, option) => {
      state[key] = option.id;
      render();
    });
}

function setSelectedState(name, shouldRender = true) {
  state.selectedState = name;
  document.querySelector("#state-filter").value = name;
  document.querySelector("#trend-state").value = name;
  if (shouldRender) render();
}

function togglePlay() {
  const button = document.querySelector("#play-year");
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    button.textContent = "▶︎";
    return;
  }
  button.textContent = "❚❚";
  playTimer = setInterval(() => {
    const years = dashboardData.years.map(String);
    const next = years[(years.indexOf(state.year) + 1) % years.length];
    state.year = next;
    render();
  }, 900);
}

function render() {
  document.title = `US Air Pollution Explorer — ${state.pollutant} ${metricLabel(state.metric)} ${state.year}`;
  document.querySelector("#year").value = state.year;
  document.querySelector("#year-value").textContent = state.year;
  document.querySelector("#pollutant").value = state.pollutant;
  document.querySelector("#bar-metric").value = state.metric;
  document.querySelector("#state-filter").value = state.selectedState;
  document.querySelector("#trend-state").value = state.selectedState;
  d3.select("#metric").selectAll("button").classed("active", (item) => item.id === state.metric);

  renderKpis();
  updateMap({
    data: dashboardData,
    ...state,
    onStateSelect: (name) => setSelectedState(name)
  });
  renderCharts();
}

function renderCharts() {
  renderLineChart({ data: dashboardData, ...state });
  renderHeatmap({ data: dashboardData, ...state });
  renderBarChart({ data: dashboardData, ...state });
  renderRadarChart({ data: dashboardData, ...state });
  renderSeasonalHeatmap({ monthlyData, data: dashboardData, ...state });
  renderSelectedState();
  renderCompareView();
}

function renderKpis() {
  const valuesByState = dashboardData.stateYear[state.pollutant]?.[state.metric]?.[state.year] || {};
  const rows = getStateRows(dashboardData, valuesByState);
  const cityRows = dashboardData.cityRankings[state.pollutant]?.[state.metric]?.[state.year] || [];
  const average = d3.mean(rows, (row) => row.value);
  const cleanest = rows.at(-1);
  const highest = rows[0];
  const topCity = cityRows[0];
  const sites = dashboardData.summary?.siteCount || "-";

  document.querySelector("#kpi-average").textContent = formatValue(average, state.metric);
  document.querySelector("#kpi-status").textContent = categoryLabel(average, state.metric);
  document.querySelector("#kpi-change").textContent = `${state.pollutant} ${metricLabel(state.metric)} in ${state.year}`;
  document.querySelector("#kpi-state").textContent = highest?.name || "-";
  document.querySelector("#kpi-state-value").textContent = `Avg: ${formatValue(highest?.value, state.metric)}`;
  renderStateGlyph(".state-shape", highest?.name || "California", "#ffb347");
  document.querySelector("#kpi-clean").textContent = cleanest?.name || "-";
  document.querySelector("#kpi-clean-value").textContent = `Avg: ${formatValue(cleanest?.value, state.metric)}`;
  document.querySelector("#kpi-city").textContent = topCity ? `${topCity.city}, ${topCity.state}` : "-";
  document.querySelector("#kpi-city-value").textContent = `Avg: ${formatValue(topCity?.value, state.metric)}`;
  document.querySelector("#kpi-sites").textContent = d3.format(",")(sites);
  document.querySelector("#kpi-site-state").textContent = `Across ${dashboardData.summary?.stateCount || dashboardData.states.length} states`;
}

function renderSelectedState() {
  const valuesByState = dashboardData.stateYear[state.pollutant]?.[state.metric]?.[state.year] || {};
  const rows = getStateRows(dashboardData, valuesByState);
  const selected = state.selectedState === "All States" ? rows[0] : rows.find((row) => row.name === state.selectedState);
  const stateName = selected?.name || state.selectedState;
  const rank = rows.findIndex((row) => row.name === selected?.name) + 1;
  const currentValue = selected?.value;
  const baselineValue = dashboardData.stateYear[state.pollutant]?.[state.metric]?.["2000"]?.[stateName];
  const siteCount = dashboardData.summary?.stateSites?.[stateName] || "-";
  const source = dashboardData.stateYearSources?.[state.pollutant]?.[state.metric]?.[state.year]?.[stateName] || "Dataset";

  document.querySelector("#selected-state-name").textContent = state.selectedState === "All States" ? (selected?.name || "All States") : state.selectedState;
  document.querySelector("#selected-state-rank").textContent = `${metricLabel(state.metric)} Rank (${state.year})`;
  document.querySelector("#selected-state-rank-badge").textContent = rank ? `#${rank}` : "#-";
  document.querySelector("#selected-state-year-label").textContent = state.year;
  document.querySelector("#selected-state-metric-label").textContent = state.metric === "aqi" ? "AQI" : "Mean";
  document.querySelector("#selected-state-value").textContent = formatValue(currentValue, state.metric);
  document.querySelector("#selected-state-sites").textContent = siteCount;
  renderStateGlyph("#selected-state-icon", stateName || "California", "#ffb347");

  const changeNode = document.querySelector("#selected-state-change");
  if (baselineValue !== undefined && baselineValue !== null && currentValue !== undefined && currentValue !== null && baselineValue !== 0) {
    const pct = ((currentValue - baselineValue) / baselineValue) * 100;
    const better = pct < 0;
    changeNode.textContent = `${better ? "▼" : "▲"} ${Math.abs(pct).toFixed(0)}%`;
    changeNode.className = better ? "change-good" : "change-bad";
  } else {
    changeNode.textContent = "-";
    changeNode.className = "";
  }

  const breakdown = d3.select("#state-breakdown");
  breakdown.selectAll("*").remove();
  breakdown.append("h4").attr("class", "breakdown-title").text(`Pollutant Breakdown (${state.year})`);
  breakdown.append("p").attr("class", "selected-meta").text(`Source: ${source}`);

  const items = dashboardData.pollutants.map((pollutant) => ({
    pollutant,
    value: dashboardData.stateYear[pollutant]?.[state.metric]?.[state.year]?.[stateName] || 0,
    label: `${pollutant}${pollutant === "O3" ? " (Ozone)" : ""}`
  }));

  const mainPollutant = [...items].sort((a, b) => d3.descending(a.value, b.value))[0];
  const citySignal = dashboardData.cityRankings?.[state.pollutant]?.[state.metric]?.[state.year]
    ?.find((row) => row.state === stateName || row.state === stateName.replace("District Of Columbia", "District of Columbia"));

  const mainPollutantNode = document.querySelector("#selected-main-pollutant");
  const citySignalNode = document.querySelector("#selected-city-signal");
  const dataSourceNode = document.querySelector("#selected-data-source");
  if (mainPollutantNode) mainPollutantNode.textContent = mainPollutant?.pollutant || "-";
  if (citySignalNode) citySignalNode.textContent = citySignal ? `${citySignal.city}` : "No top city";
  if (dataSourceNode) dataSourceNode.textContent = source.replace("Estimated (", "Est. ").replace(")", "");

  const max = d3.max(items, (item) => item.value) || 1;
  const rowsJoin = breakdown.selectAll(".break-row").data(items).join("div").attr("class", "break-row");
  rowsJoin.append("span").text((item) => item.label);
  rowsJoin.append("div").attr("class", "break-track").append("i")
    .style("width", (item) => `${(item.value / max) * 100}%`)
    .style("background", (item) => POLLUTANT_META[item.pollutant].color);
  rowsJoin.append("strong").text((item) => formatValue(item.value, state.metric));
}



function getActiveStateName() {
  if (state.selectedState && state.selectedState !== "All States") return state.selectedState;
  const rows = getStateRows(dashboardData, dashboardData.stateYear[state.pollutant]?.[state.metric]?.[state.year] || {});
  return rows[0]?.name || "California";
}

function getStateSnapshot(stateName) {
  const valuesByState = dashboardData.stateYear[state.pollutant]?.[state.metric]?.[state.year] || {};
  const rows = getStateRows(dashboardData, valuesByState);
  const found = rows.find((row) => row.name === stateName);
  const rank = rows.findIndex((row) => row.name === stateName) + 1;
  const baseline = dashboardData.stateYear[state.pollutant]?.[state.metric]?.["2000"]?.[stateName];
  const value = found?.value;
  const change = baseline && value !== undefined ? ((value - baseline) / baseline) * 100 : null;
  const pollutantValues = dashboardData.pollutants.map((pollutant) => ({
    pollutant,
    value: dashboardData.stateYear[pollutant]?.[state.metric]?.[state.year]?.[stateName] || 0
  }));
  const topPollutant = pollutantValues.reduce((best, item) => item.value > best.value ? item : best, pollutantValues[0] || { pollutant: "-", value: 0 });
  const cityRows = dashboardData.cityRankings[state.pollutant]?.[state.metric]?.[state.year] || [];
  const stateCities = cityRows.filter((row) => row.state === stateName).slice(0, 3);
  return {
    name: stateName,
    rank: rank || null,
    value,
    baseline,
    change,
    pollutantValues,
    topPollutant,
    siteCount: dashboardData.summary?.stateSites?.[stateName] || "-",
    source: dashboardData.stateYearSources?.[state.pollutant]?.[state.metric]?.[state.year]?.[stateName] || "Dataset",
    stateCities
  };
}



function renderCompareView() {
  const container = document.querySelector("#compare-view");
  if (!container) return;
  normalizeCompareSelection();
  syncCompareControls();
  const a = getStateSnapshot(state.compareA);
  const b = getStateSnapshot(state.compareB);
  const metric = metricLabel(state.metric);
  const winner = (a.value ?? Infinity) <= (b.value ?? Infinity) ? a : b;
  const worse = winner === a ? b : a;
  const diff = Math.abs((a.value || 0) - (b.value || 0));
  const pollutantRows = dashboardData.pollutants.map((pollutant) => {
    const av = dashboardData.stateYear[pollutant]?.[state.metric]?.[state.year]?.[state.compareA] || 0;
    const bv = dashboardData.stateYear[pollutant]?.[state.metric]?.[state.year]?.[state.compareB] || 0;
    const max = Math.max(av, bv, 1);
    return { pollutant, av, bv, max };
  });

  container.innerHTML = `
    <section class="compare-summary">
      ${compareCardHTML(a, "A")}
      <div class="compare-verdict">
        <span>Cleaner by ${metric}</span>
        <strong>${winner.name}</strong>
        <small>${worse.name} is ${formatValue(diff, state.metric)} higher in ${state.year}.</small>
      </div>
      ${compareCardHTML(b, "B")}
    </section>
    <section class="compare-pollutants">
      ${pollutantRows.map((row) => `
        <article>
          <strong>${row.pollutant}</strong>
          <div class="compare-barline"><span>${state.compareA}</span><i><b style="width:${(row.av / row.max) * 100}%;background:${POLLUTANT_META[row.pollutant].color}"></b></i><em>${formatValue(row.av, state.metric)}</em></div>
          <div class="compare-barline muted"><span>${state.compareB}</span><i><b style="width:${(row.bv / row.max) * 100}%;background:${POLLUTANT_META[row.pollutant].color}"></b></i><em>${formatValue(row.bv, state.metric)}</em></div>
        </article>
      `).join("")}
    </section>
  `;
  renderStateGlyph("#compare-shape-a", a.name, "#60a5fa");
  renderStateGlyph("#compare-shape-b", b.name, "#a78bfa");
}

function compareCardHTML(snap, label) {
  const change = snap.change === null ? "-" : `${snap.change < 0 ? "▼" : "▲"} ${Math.abs(snap.change).toFixed(0)}%`;
  return `
    <article class="compare-card">
      <div id="compare-shape-${label.toLowerCase()}" class="compare-shape">${label}</div>
      <div>
        <span>State ${label}</span>
        <h3>${snap.name}</h3>
        <p>Rank ${snap.rank ? `#${snap.rank}` : "-"} · ${snap.siteCount} sites</p>
      </div>
      <strong>${formatValue(snap.value, state.metric)}</strong>
      <small>${change} vs 2000 · Main: ${snap.topPollutant.pollutant}</small>
    </article>
  `;
}

function renderStateGlyph(targetSelector, stateName, fill = "#fdba74") {
  const container = d3.select(targetSelector);
  // Clear elements and old text nodes so previous state abbreviations never remain behind the new map.
  container.html("");
  const feature = getStateFeature(stateName);
  if (!feature) {
    container.append("span")
      .attr("class", "glyph-fallback")
      .text((stateName || "ST").slice(0, 2).toUpperCase());
    return;
  }

  const node = container.node();
  const width = node.getBoundingClientRect().width || 64;
  const height = node.getBoundingClientRect().height || 64;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-hidden", "true");

  const defs = svg.append("defs");
  const gradientId = `grad-${targetSelector.replace(/[^a-z0-9]/gi, "")}`;
  const filterId = `shadow-${targetSelector.replace(/[^a-z0-9]/gi, "")}`;
  const gradient = defs.append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#ffd089");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", fill);

  const filter = defs.append("filter").attr("id", filterId).attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  filter.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 3)
    .attr("stdDeviation", 3)
    .attr("flood-color", fill)
    .attr("flood-opacity", 0.35);

  const projection = d3.geoMercator().fitExtent([[8, 6], [width - 8, height - 6]], feature);
  const path = d3.geoPath(projection);
  svg.append("path")
    .attr("d", path(feature))
    .attr("fill", `url(#${gradientId})`)
    .attr("stroke", "rgba(255,248,235,0.95)")
    .attr("stroke-width", 1.15)
    .attr("stroke-linejoin", "round")
    .attr("filter", `url(#${filterId})`);
}

function categoryLabel(value, metric) {
  if (metric !== "aqi" || value === undefined || value === null) return "Measured";
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Sensitive";
  if (value <= 200) return "Unhealthy";
  return "Very Unhealthy";
}

function debounce(fn, delay) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

boot().catch((error) => {
  document.querySelector("#app").innerHTML = `
    <main class="error-state">
      <h1>Dashboard data is missing</h1>
      <p>Run <code>python scripts/preprocess.py</code> to generate <code>public/data/dashboard-data.json</code>.</p>
      <pre>${error.message}</pre>
    </main>`;
  console.error(error);
});
