import * as d3 from "d3";
import { formatValue, hideTooltip, metricLabel, POLLUTANT_META, resizeSvg, showTooltip } from "./utils.js";

export function renderBarChart({ data, pollutant, metric, year }) {
  const svg = d3.select("#bar-chart");
  svg.selectAll("*").remove();

  const { width, height } = resizeSvg(svg, 250);
  const compact = width < 620;
  const margin = { top: 14, right: compact ? 16 : 24, bottom: 34, left: 16 };
  const labelWidth = compact
    ? Math.min(180, Math.max(118, width * 0.38))
    : Math.min(300, Math.max(190, width * 0.24));
  const rows = (data.cityRankings[pollutant]?.[metric]?.[year] || []).slice(0, 10);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const barAreaWidth = Math.max(120, innerWidth - labelWidth - 10);

  document.querySelector("#bar-caption").textContent = `Highest ${pollutant} ${metricLabel(metric).toLowerCase()} city averages in ${year}`;
  document.querySelector(".city-panel .panel-heading h2").textContent =
    metric === "aqi" ? `Top 10 Most Polluted Cities (Avg AQI, ${year})` : `Top 10 Cities by Mean Concentration (${year})`;

  if (!rows.length) return;

  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient")
    .attr("id", "city-bar-gradient")
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");
  const barColor = metric === "aqi" ? "#b76cff" : POLLUTANT_META[pollutant].color;
  gradient.append("stop").attr("offset", "0%").attr("stop-color", d3.color(barColor).brighter(0.3));
  gradient.append("stop").attr("offset", "100%").attr("stop-color", barColor);

  const maxValue = d3.max(rows, (row) => row.value) || 1;
  const x = d3.scaleLinear().domain([0, maxValue]).range([0, barAreaWidth]);
  const y = d3.scaleBand().domain(rows.map((row, index) => index)).range([0, innerHeight]).padding(0.34);

  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  group.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${labelWidth},0)`)
    .call(d3.axisBottom(x).ticks(4).tickSize(innerHeight).tickFormat(""));

  group.append("g")
    .attr("transform", `translate(${labelWidth},${innerHeight})`)
    .call(d3.axisBottom(x).ticks(4));

  group.selectAll(".city-rank-circle")
    .data(rows)
    .join("circle")
    .attr("class", "city-rank-circle")
    .attr("cx", 10)
    .attr("cy", (_, index) => y(index) + y.bandwidth() / 2)
    .attr("r", 10);

  group.selectAll(".city-rank-text")
    .data(rows)
    .join("text")
    .attr("class", "city-rank-text")
    .attr("x", 10)
    .attr("y", (_, index) => y(index) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text((_, index) => index + 1);

  group.selectAll(".city-label")
    .data(rows)
    .join("text")
    .attr("class", "city-label")
    .attr("x", 28)
    .attr("y", (_, index) => y(index) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text((row) => truncateCityLabel(`${row.city}, ${row.state}`, labelWidth))
    .append("title")
    .text((row) => `${row.city}, ${row.state}`);

  group.selectAll(".city-label")
    .on("mousemove", (event, row) => {
      showTooltip(event, `<strong>${row.city}, ${row.state}</strong><span>${metricLabel(metric)}: ${formatValue(row.value, metric)}</span>`);
    })
    .on("mouseout", hideTooltip);

  group.selectAll(".bar-track")
    .data(rows)
    .join("rect")
    .attr("class", "bar-track")
    .attr("x", labelWidth)
    .attr("y", (_, index) => y(index))
    .attr("height", y.bandwidth())
    .attr("width", barAreaWidth)
    .attr("rx", 3);

  group.selectAll(".bar")
    .data(rows)
    .join("rect")
    .attr("class", "bar")
    .attr("x", labelWidth)
    .attr("y", (_, index) => y(index))
    .attr("height", y.bandwidth())
    .attr("width", (row) => x(row.value))
    .attr("fill", "url(#city-bar-gradient)")
    .on("mousemove", (event, row) => {
      showTooltip(event, `<strong>${row.city}, ${row.state}</strong><span>${metricLabel(metric)}: ${formatValue(row.value, metric)}</span>`);
    })
    .on("mouseout", hideTooltip);

  group.selectAll(".bar-value")
    .data(rows)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", (row) => {
      const preferred = labelWidth + x(row.value) + 8;
      const maxX = labelWidth + barAreaWidth - 6;
      return preferred > maxX ? maxX : preferred;
    })
    .attr("text-anchor", (row) => (labelWidth + x(row.value) + 8 > labelWidth + barAreaWidth - 6 ? "end" : "start"))
    .attr("y", (_, index) => y(index) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text((row) => formatValue(row.value, metric));

  group.append("text")
    .attr("class", "axis-title")
    .attr("x", labelWidth + barAreaWidth / 2)
    .attr("y", innerHeight + 28)
    .attr("text-anchor", "middle")
    .text(metric === "aqi" ? "Average AQI" : "Average Mean Concentration");
}


function truncateCityLabel(label, labelWidth) {
  const maxChars = Math.max(10, Math.floor(labelWidth / 7.4));
  return label.length > maxChars ? `${label.slice(0, Math.max(8, maxChars - 1))}…` : label;
}
