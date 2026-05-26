import * as d3 from "d3";
import { colorScale, formatValue, hideTooltip, metricLabel, resizeSvg, showTooltip } from "./utils.js";

export function renderHeatmap({ data, pollutant, metric }) {
  const svg = d3.select("#heatmap");
  svg.selectAll("*").remove();
  document.querySelector(".heatmap-panel .panel-heading h2").textContent =
    metric === "aqi" ? "AQI Heatmap by State and Year" : "Concentration Heatmap by State and Year";
  document.querySelector(".heatmap-panel .panel-heading p").textContent =
    metric === "aqi" ? "Top monitored states ranked by long-term AQI" : "Top monitored states ranked by long-term mean concentration";

  const { width, height } = resizeSvg(svg, 214);
  const margin = { top: 16, right: 20, bottom: 34, left: 96 };
  const years = data.years.map(String);
  const rows = data.states.map((state) => {
    const average = d3.mean(years, (year) => data.stateYear[pollutant]?.[metric]?.[year]?.[state]);
    return { state, average: average || 0 };
  }).sort((a, b) => d3.descending(a.average, b.average)).slice(0, 10);

  const cells = rows.flatMap((row) => years.map((year) => ({
    state: row.state,
    year,
    value: data.stateYear[pollutant]?.[metric]?.[year]?.[row.state]
  })));

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleBand().domain(years).range([0, innerWidth]).padding(0.04);
  const y = d3.scaleBand().domain(rows.map((row) => row.state)).range([0, innerHeight]).padding(0.04);
  const scale = colorScale(cells.map((cell) => cell.value), pollutant);

  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  group.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickValues(years.filter((_, index) => index % 2 === 0)));
  group.append("g").call(d3.axisLeft(y).tickSize(0));

  group.selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("class", "heat-cell")
    .attr("x", (cell) => x(cell.year))
    .attr("y", (cell) => y(cell.state))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (cell) => cell.value === undefined ? "#253247" : scale(cell.value))
    .on("mousemove", (event, cell) => {
      showTooltip(event, `<strong>${cell.state} - ${cell.year}</strong><span>${metricLabel(metric)}: ${formatValue(cell.value, metric)}</span>`);
    })
    .on("mouseout", hideTooltip);
}
