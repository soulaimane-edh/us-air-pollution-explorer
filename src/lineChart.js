import * as d3 from "d3";
import { formatValue, hideTooltip, metricLabel, POLLUTANT_META, resizeSvg, showTooltip } from "./utils.js";

export function renderLineChart({ data, metric, selectedState, year }) {
  const svg = d3.select("#line-chart");
  svg.selectAll("*").remove();

  const { width, height } = resizeSvg(svg, 228);
  const margin = { top: 20, right: 24, bottom: 30, left: 46 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const years = data.years.map(Number);

  let usedFallback = false;
  let series = data.pollutants.map((pollutant) => ({
    pollutant,
    values: years.map((year) => ({
      year,
      value: selectedState && selectedState !== "All States"
        ? data.stateYear[pollutant]?.[metric]?.[year]?.[selectedState]
        : data.trends[pollutant]?.[metric]?.[year]
    }))
  }));

  const selectedHasValues = series.some((item) => item.values.some((row) => row.value !== null && row.value !== undefined));
  if (selectedState && selectedState !== "All States" && !selectedHasValues) {
    usedFallback = true;
    series = data.pollutants.map((pollutant) => ({
      pollutant,
      values: years.map((year) => ({
        year,
        value: data.trends[pollutant]?.[metric]?.[year]
      }))
    }));
  }

  const allValues = series.flatMap((item) => item.values.map((row) => row.value)).filter((value) => value !== null && value !== undefined);
  const x = d3.scaleLinear().domain(d3.extent(years)).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, (d3.max(allValues) || 1) * 1.16]).nice().range([innerHeight, 0]);
  const xScale = x;
  const yScale = y;
  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  group.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(""));
  group.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));
  group.append("g").call(d3.axisLeft(y).ticks(5));

  const hoverLine = group.append("line")
    .attr("class", "hover-line")
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("opacity", 0);

  const line = d3.line()
    .defined((row) => row.value !== null && row.value !== undefined)
    .x((row) => x(row.year))
    .y((row) => y(row.value))
    .curve(d3.curveMonotoneX);

  group.selectAll(".line")
    .data(series)
    .join("path")
    .attr("class", "line")
    .attr("d", (item) => line(item.values))
    .attr("stroke", (item) => POLLUTANT_META[item.pollutant].color);

  group.selectAll(".trend-point")
    .data(series.flatMap((item) => item.values.map((row) => ({ ...row, pollutant: item.pollutant }))).filter((row) => row.value !== undefined))
    .join("circle")
    .attr("class", "trend-point")
    .attr("cx", (row) => x(row.year))
    .attr("cy", (row) => y(row.value))
    .attr("r", 3.4)
    .attr("fill", (row) => POLLUTANT_META[row.pollutant].color)
    .on("mousemove", (event, row) => {
      showTooltip(event, `<strong>${row.pollutant} - ${row.year}</strong><span>${metricLabel(metric)}: ${formatValue(row.value, metric)}</span>`);
    })
    .on("mouseout", hideTooltip);

  const selectedYear = Number(year || years.at(-1));
  const selectedX = x(selectedYear);

  if (!Number.isNaN(selectedX)) {
    group.append("line")
      .attr("class", "selected-year-line")
      .attr("x1", selectedX)
      .attr("x2", selectedX)
      .attr("y1", 0)
      .attr("y2", innerHeight);

    group.append("text")
      .attr("class", "selected-year-label")
      .attr("x", Math.min(innerWidth - 8, selectedX + 8))
      .attr("y", 14)
      .text(selectedYear);

    const selectedPoints = series
      .map((item) => {
        const row = item.values.find((value) => value.year === selectedYear);
        return row && row.value !== null && row.value !== undefined
          ? { ...row, pollutant: item.pollutant }
          : null;
      })
      .filter(Boolean);

    group.selectAll(".selected-year-point")
      .data(selectedPoints)
      .join("circle")
      .attr("class", "selected-year-point")
      .attr("cx", (row) => x(row.year))
      .attr("cy", (row) => y(row.value))
      .attr("r", 5.8)
      .attr("fill", (row) => POLLUTANT_META[row.pollutant].color)
      .on("mousemove", (event, row) => {
        showTooltip(event, `<strong>${row.pollutant} - selected year ${row.year}</strong><span>${metricLabel(metric)}: ${formatValue(row.value, metric)}</span>`);
      })
      .on("mouseout", hideTooltip);
  }

    // Overlay to capture hover across the whole chart and show a combined tooltip
    group.append("rect")
      .attr("class", "hover-overlay")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .style("fill", "transparent")
      .style("pointer-events", "all")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, group.node());
        let yearHover = Math.round(xScale.invert(mx));
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        if (yearHover < minYear) yearHover = minYear;
        if (yearHover > maxYear) yearHover = maxYear;

        const hoverX = xScale(yearHover);
        hoverLine.style("display", null).attr("x1", hoverX).attr("x2", hoverX).attr("opacity", 1);

        const parts = [`<strong>${yearHover}</strong>`];
        for (const item of series) {
          const row = item.values.find((v) => Number(v.year) === Number(yearHover));
          const value = row ? row.value : null;
          const color = POLLUTANT_META[item.pollutant].color;
          parts.push(`
            <div class="tooltip-row">
              <span class="pollutant-label" style="color: ${color};">${item.pollutant}</span>
              <span class="pollutant-value">${formatValue(value, metric)} ${metricLabel(metric)}</span>
            </div>
          `);
        }
        showTooltip(event, parts.join(""));
      })
      .on("mouseout", () => {
        hoverLine.style("display", "none");
        hideTooltip();
      })
      .on("mouseleave", () => {
        hoverLine.style("display", "none");
        hideTooltip();
      });

  const legend = svg.append("g").attr("class", "chart-legend").attr("transform", `translate(${margin.left},10)`);
  const legendItems = legend.selectAll("g").data(series).join("g").attr("transform", (_, index) => `translate(${index * 72},0)`);
  legendItems.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 0).attr("y2", 0).attr("stroke-width", 3).attr("stroke", (item) => POLLUTANT_META[item.pollutant].color);
  legendItems.append("text").attr("x", 22).attr("y", 4).text((item) => item.pollutant);

  document.querySelector("#trend-caption").textContent = usedFallback
    ? `No ${metricLabel(metric).toLowerCase()} time-series for ${selectedState}; showing US average. Selected year: ${year}`
    : `${selectedState === "All States" ? "US average" : selectedState} ${metricLabel(metric).toLowerCase()} by pollutant. Selected year: ${year}`;

  if (usedFallback) {
    svg.append("text")
      .attr("class", "no-data-note")
      .attr("x", width - 30)
      .attr("y", height - 16)
      .attr("text-anchor", "end")
      .text(`No state-level values for ${selectedState}`);
  }
}
