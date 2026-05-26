import * as d3 from "d3";

export const POLLUTANT_META = {
  O3: { name: "Ozone", color: "#8bd450", scale: d3.interpolateYlGn },
  NO2: { name: "Nitrogen dioxide", color: "#4ea1ff", scale: d3.interpolatePuBu },
  SO2: { name: "Sulfur dioxide", color: "#a975ff", scale: d3.interpolatePuRd },
  CO: { name: "Carbon monoxide", color: "#ff9b42", scale: d3.interpolateYlOrBr }
};

export const STATE_NAME_ALIASES = {
  "District Of Columbia": "District of Columbia"
};

export function canonicalStateName(name) {
  return STATE_NAME_ALIASES[name] || name;
}

export function dataStateName(name) {
  const found = Object.entries(STATE_NAME_ALIASES).find(([, value]) => value === name);
  return found ? found[0] : name;
}

export function formatValue(value, metric) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return metric === "aqi" ? d3.format(".1f")(value) : d3.format(".3~f")(value);
}

export function metricLabel(metric) {
  return metric === "aqi" ? "AQI" : "Mean concentration";
}

export function metricShortLabel(metric) {
  return metric === "aqi" ? "AQI" : "Mean";
}

export function getStateRows(data, stateValues) {
  return Object.entries(stateValues || {})
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value !== null && row.value !== undefined)
    .sort((a, b) => d3.descending(a.value, b.value));
}

export function colorScale(values, pollutant) {
  const clean = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
  const domain = d3.extent(clean);
  if (!clean.length || domain[0] === domain[1]) {
    return d3.scaleSequential([0, 1], d3.interpolateYlOrRd);
  }
  const interpolator = POLLUTANT_META[pollutant]?.scale || d3.interpolateYlOrRd;
  return d3.scaleSequential(domain, interpolator);
}

export function showTooltip(event, html) {
  const tooltip = d3.select("#tooltip");
  const offset = 10;
  const minMargin = 10;

  tooltip.html(html).style("opacity", 1).style("left", "0px").style("top", "0px");
  const tooltipNode = tooltip.node();
  const rect = tooltipNode.getBoundingClientRect();
  const tooltipWidth = rect.width;
  const tooltipHeight = rect.height;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cursorX = event.clientX;
  const cursorY = event.clientY;

  let left = cursorX + offset;
  let top = cursorY + offset;

  if (cursorX + tooltipWidth + offset + minMargin > viewportWidth) {
    left = cursorX - tooltipWidth - offset;
  }
  if (left < minMargin) {
    left = minMargin;
  }

  if (cursorY + tooltipHeight + offset + minMargin > viewportHeight) {
    top = cursorY - tooltipHeight - offset;
  }
  if (top < minMargin) {
    top = minMargin;
  }

  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

export function hideTooltip() {
  d3.select("#tooltip").style("opacity", 0);
}

export function resizeSvg(svg, minHeight = 320) {
  const node = svg.node();
  const width = node.getBoundingClientRect().width || 640;
  const height = Math.max(minHeight, node.getBoundingClientRect().height || minHeight);
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  return { width, height };
}

export function enrichMissingStateValues(data) {
  const years = data.years.map(String);
  const states = data.states;

  data.summary = data.summary || {};
  data.summary.imputedStateValues = 0;

  for (const pollutant of data.pollutants) {
    for (const metricDef of data.metrics) {
      const metric = metricDef.id;
      const stateYearMetric = data.stateYear[pollutant]?.[metric] || {};
      const sourceMetric = (((data.stateYearSources ||= {})[pollutant] ||= {})[metric] ||= {});
      const nationalTrend = data.trends[pollutant]?.[metric] || {};

      for (const year of years) {
        stateYearMetric[year] ||= {};
        sourceMetric[year] ||= {};
      }

      for (const rawState of states) {
        const state = rawState;
        const known = years
          .map((year) => ({ year, value: stateYearMetric[year]?.[state] }))
          .filter((item) => item.value !== null && item.value !== undefined && !Number.isNaN(item.value));

        for (let idx = 0; idx < years.length; idx += 1) {
          const year = years[idx];
          if (stateYearMetric[year]?.[state] !== undefined && stateYearMetric[year]?.[state] !== null) continue;

          const prev = [...known].reverse().find((item) => Number(item.year) < Number(year));
          const next = known.find((item) => Number(item.year) > Number(year));
          const natCurrent = nationalTrend[year];

          let estimate;
          let source;
          if (prev && next) {
            const t = (Number(year) - Number(prev.year)) / (Number(next.year) - Number(prev.year));
            estimate = prev.value + (next.value - prev.value) * t;
            source = "Estimated (interpolated)";
          } else if (prev) {
            const natPrev = nationalTrend[prev.year];
            estimate = natCurrent !== undefined && natPrev !== undefined ? prev.value + (natCurrent - natPrev) : prev.value;
            source = "Estimated (trend-adjusted)";
          } else if (next) {
            const natNext = nationalTrend[next.year];
            estimate = natCurrent !== undefined && natNext !== undefined ? next.value + (natCurrent - natNext) : next.value;
            source = "Estimated (trend-adjusted)";
          } else if (natCurrent !== undefined) {
            estimate = natCurrent;
            source = "Estimated (national average)";
          }

          if (estimate !== undefined && estimate !== null && !Number.isNaN(estimate)) {
            const rounded = Math.round(estimate * 1000) / 1000;
            stateYearMetric[year][state] = rounded;
            sourceMetric[year][state] ||= source;
            data.summary.imputedStateValues += 1;
          }
        }
      }
    }
  }
}
