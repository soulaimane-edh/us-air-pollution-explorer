import * as d3 from "d3";
import { formatValue, getStateRows, hideTooltip, metricLabel, POLLUTANT_META, resizeSvg, showTooltip } from "./utils.js";

const MONTHS = [
  ["1", "Jan", "J"], ["2", "Feb", "F"], ["3", "Mar", "M"], ["4", "Apr", "A"],
  ["5", "May", "M"], ["6", "Jun", "J"], ["7", "Jul", "J"], ["8", "Aug", "A"],
  ["9", "Sep", "S"], ["10", "Oct", "O"], ["11", "Nov", "N"], ["12", "Dec", "D"]
];

export function renderSeasonalHeatmap({ monthlyData, data, metric, year, selectedState }) {
  const svg = d3.select("#seasonal-heatmap");
  svg.selectAll("*").remove();

  const { width, height } = resizeSvg(svg, 460);
  const chosenState = resolveSelectedState(data, metric, year, selectedState);
  const caption = document.querySelector("#seasonal-caption");
  if (caption) caption.textContent = `${metricLabel(metric)} monthly pattern for ${chosenState} in ${year}`;

  const compact = width < 560;
  const tiny = width < 430;
  const margin = {
    top: compact ? 34 : 42,
    right: compact ? 18 : 28,
    bottom: compact ? 96 : 108,
    left: compact ? 50 : 62
  };

  const innerWidth = Math.max(220, width - margin.left - margin.right);
  const cellGap = tiny ? 3 : compact ? 4 : 6;
  const cellW = Math.max(14, (innerWidth - cellGap * 11) / 12);
  const cellH = Math.min(compact ? 36 : 46, Math.max(28, cellW * 0.35));
  const rowGap = compact ? 14 : 18;
  const gridHeight = cellH * 4 + rowGap * 3;

  const rows = data.pollutants.map((pollutant) => {
    const stateMonth = monthlyData?.states?.[pollutant]?.[metric]?.[chosenState]?.[year] || {};
    const nationalMonth = monthlyData?.national?.[pollutant]?.[metric]?.[year] || {};
    const cells = MONTHS.map(([month, label, shortLabel]) => ({
      pollutant,
      month,
      label,
      shortLabel,
      value: stateMonth[month] ?? nationalMonth[month] ?? null,
      isNationalFallback: stateMonth[month] == null && nationalMonth[month] != null
    }));
    const values = cells.map((d) => d.value).filter((d) => d != null && !Number.isNaN(d));
    const extent = d3.extent(values.length ? values : [0, 1]);
    if (extent[0] === extent[1]) extent[1] = extent[0] + 1;
    return { pollutant, cells, scale: d3.scaleSequential(extent, d3.interpolateYlOrRd) };
  });

  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  group.selectAll(".seasonal-month-label")
    .data(MONTHS)
    .join("text")
    .attr("class", "seasonal-month-label")
    .attr("x", (_, i) => i * (cellW + cellGap) + cellW / 2)
    .attr("y", -13)
    .attr("text-anchor", "middle")
    .text((d) => tiny ? d[2] : d[1]);

  const row = group.selectAll(".seasonal-row")
    .data(rows)
    .join("g")
    .attr("class", "seasonal-row")
    .attr("transform", (_, i) => `translate(0,${i * (cellH + rowGap)})`);

  row.append("text")
    .attr("class", "seasonal-pollutant-label")
    .attr("x", -14)
    .attr("y", cellH / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .style("fill", (d) => POLLUTANT_META[d.pollutant].color)
    .text((d) => d.pollutant);

  row.selectAll(".seasonal-cell")
    .data((d) => d.cells.map((cell) => ({ ...cell, scale: d.scale })))
    .join("rect")
    .attr("class", "seasonal-cell")
    .attr("x", (_, i) => i * (cellW + cellGap))
    .attr("y", 0)
    .attr("width", cellW)
    .attr("height", cellH)
    .attr("rx", Math.min(8, cellW / 3))
    .attr("fill", (d) => d.value == null ? "rgba(30,41,59,0.55)" : d.scale(d.value))
    .on("mousemove", (event, d) => {
      showTooltip(event, `<strong>${d.pollutant} — ${d.label} ${year}</strong><span>${chosenState}: ${formatValue(d.value, metric)}</span><small>${d.isNationalFallback ? "National fallback used" : metricLabel(metric)}</small>`);
    })
    .on("mouseout", hideTooltip);

  row.selectAll(".seasonal-cell-value")
    .data((d) => d.cells)
    .join("text")
    .attr("class", "seasonal-cell-value")
    .attr("x", (_, i) => i * (cellW + cellGap) + cellW / 2)
    .attr("y", cellH / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .classed("tiny", tiny)
    .text((d) => cellW < 18 ? "" : formatCellValue(d.value, metric));

  const legendWidth = Math.min(360, Math.max(180, innerWidth * 0.42));
  const gridBottom = margin.top + gridHeight;
  const legendY = gridBottom + (compact ? 34 : 42);
  const legendX = Math.max(margin.left + 50, width - margin.right - legendWidth - 40);
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient")
    .attr("id", "seasonal-legend-gradient")
    .attr("x1", "0%")
    .attr("x2", "100%");
  d3.range(0, 1.01, 0.1).forEach((t) => {
    gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", d3.interpolateYlOrRd(t));
  });

  svg.append("text")
    .attr("class", "seasonal-legend-text")
    .attr("x", legendX - 12)
    .attr("y", legendY + 10)
    .attr("text-anchor", "end")
    .text("Low");
  svg.append("rect")
    .attr("class", "seasonal-legend-bar")
    .attr("x", legendX)
    .attr("y", legendY)
    .attr("width", legendWidth)
    .attr("height", 12)
    .attr("rx", 6)
    .attr("fill", "url(#seasonal-legend-gradient)");
  svg.append("text")
    .attr("class", "seasonal-legend-text")
    .attr("x", legendX + legendWidth + 12)
    .attr("y", legendY + 10)
    .text("High");
}

function resolveSelectedState(data, metric, year, selectedState) {
  if (selectedState && selectedState !== "All States") return selectedState;
  const rows = getStateRows(data, data.stateYear?.O3?.[metric]?.[year] || {});
  return rows[0]?.name || data.states?.[0] || "California";
}

function formatCellValue(value, metric) {
  if (value == null || Number.isNaN(value)) return "-";
  return metric === "aqi" ? d3.format(".0f")(value) : d3.format(".2~f")(value);
}
