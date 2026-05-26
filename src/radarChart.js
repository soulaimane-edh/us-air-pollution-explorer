import * as d3 from "d3";
import { formatValue, getStateRows, hideTooltip, metricLabel, POLLUTANT_META, resizeSvg, showTooltip } from "./utils.js";

const AXES = ["NO2", "O3", "SO2", "CO"];

export function renderRadarChart({ data, metric, year, selectedState }) {
  const svg = d3.select("#radar-chart");
  svg.selectAll("*").remove();

  const { width, height } = resizeSvg(svg, 330);
  const margin = { top: 24, right: 60, bottom: 56, left: 60 };
  const cx = width / 2;
  const cy = (height - margin.bottom + margin.top) / 2 + 8;
  const radius = Math.max(72, Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom) / 2);

  const chosenState = resolveSelectedState(data, metric, year, selectedState);
  document.querySelector("#radar-caption").textContent = `${chosenState} profile relative to the US national average (${year})`;
  document.querySelector("#radar-state-label").textContent = chosenState;

  const rows = AXES.map((pollutant, index) => {
    const stateValue = data.stateYear[pollutant]?.[metric]?.[year]?.[chosenState];
    const nationalValue = data.trends[pollutant]?.[metric]?.[year];
    const ratio = nationalValue ? (stateValue / nationalValue) * 100 : 0;
    return {
      pollutant,
      index,
      stateValue,
      nationalValue,
      selected: clamp(ratio || 0, 0, 180),
      national: 100
    };
  });

  const max = Math.max(140, d3.max(rows, (d) => d.selected) || 140);
  const scale = d3.scaleLinear().domain([0, max]).range([0, radius]);
  const angle = (pollutant) => (AXES.indexOf(pollutant) / AXES.length) * Math.PI * 2;

  const group = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  const rings = [25, 50, 75, 100, 125, 150].filter((d) => d <= max);
  group.selectAll(".radar-ring")
    .data(rings)
    .join("polygon")
    .attr("class", "radar-ring")
    .attr("points", (ring) => polygonPoints(AXES.map((pollutant) => point(scale(ring), angle(pollutant)))));

  group.selectAll(".radar-axis")
    .data(AXES)
    .join("line")
    .attr("class", "radar-axis")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", (d) => point(radius, angle(d)).x)
    .attr("y2", (d) => point(radius, angle(d)).y);

  group.selectAll(".radar-axis-label")
    .data(AXES)
    .join("text")
    .attr("class", "radar-axis-label")
    .attr("x", (d) => point(radius + 24, angle(d)).x)
    .attr("y", (d) => point(radius + 24, angle(d)).y)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => labelAnchor(angle(d)))
    .style("fill", (d) => POLLUTANT_META[d].color)
    .text((d) => d);

  const line = d3.lineRadial()
    .angle((d) => angle(d.pollutant))
    .radius((d) => scale(d.value))
    .curve(d3.curveLinearClosed);

  group.append("path")
    .attr("class", "radar-national-area")
    .datum(rows.map((d) => ({ pollutant: d.pollutant, value: d.national })))
    .attr("d", line);

  group.append("path")
    .attr("class", "radar-selected-area")
    .datum(rows.map((d) => ({ pollutant: d.pollutant, value: d.selected })))
    .attr("d", line);

  const selectedPoints = group.selectAll(".radar-dot")
    .data(rows)
    .join("circle")
    .attr("class", "radar-dot")
    .attr("cx", (d) => point(scale(d.selected), angle(d.pollutant)).x)
    .attr("cy", (d) => point(scale(d.selected), angle(d.pollutant)).y)
    .attr("r", 4.6)
    .style("fill", (d) => POLLUTANT_META[d.pollutant].color)
    .on("mousemove", (event, d) => {
      showTooltip(event, `<strong>${d.pollutant} profile</strong><span>${chosenState}: ${formatValue(d.stateValue, metric)}</span><span>National: ${formatValue(d.nationalValue, metric)}</span><small>${d.selected.toFixed(0)}% of national average</small>`);
    })
    .on("mouseout", hideTooltip);

  selectedPoints.clone(true).attr("class", "radar-dot-glow").lower();

  const legend = svg.append("g").attr("class", "radar-legend").attr("transform", `translate(${Math.max(18, width / 2 - 130)},${height - 32})`);
  legend.append("rect").attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", "#60a5fa");
  legend.append("text").attr("x", 20).attr("y", 11).text(chosenState);
  legend.append("rect").attr("x", 140).attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", "rgba(148,163,184,0.68)");
  legend.append("text").attr("x", 160).attr("y", 11).text("National avg");
}

function resolveSelectedState(data, metric, year, selectedState) {
  if (selectedState && selectedState !== "All States") return selectedState;
  const rows = getStateRows(data, data.stateYear?.O3?.[metric]?.[year] || {});
  return rows[0]?.name || data.states?.[0] || "California";
}

function point(radius, angle) {
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

function polygonPoints(points) {
  return points.map((d) => `${d.x},${d.y}`).join(" ");
}

function labelAnchor(angle) {
  const x = Math.sin(angle);
  if (x > 0.25) return "start";
  if (x < -0.25) return "end";
  return "middle";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
