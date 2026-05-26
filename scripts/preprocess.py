import csv
import json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

POLLUTANTS = ["O3", "NO2", "SO2", "CO"]
METRICS = {
    "aqi": "{pollutant} AQI",
    "mean": "{pollutant} Mean",
}
EPA_PARAMETER_CODES = {
    "44201": "O3",
    "42602": "NO2",
    "42401": "SO2",
    "42101": "CO",
}
EPA_STANDARD_PRIORITY = {
    "O3": ["Ozone 8-hour 2015", "Ozone 8-Hour 2008", "Ozone 8-Hour 1997", "Ozone 1-hour 1979"],
    "NO2": ["NO2 Annual 1971", "NO2 1-hour 2010"],
    "SO2": ["SO2 Annual 1971", "SO2 1-hour 2010", "SO2 24-hour 1971"],
    "CO": ["CO 8-hour 1971", "CO 1-hour 1971"],
}
VALID_US_STATES = {
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "District Of Columbia", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
    "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee",
    "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
    "Wisconsin", "Wyoming",
}


def add_value(store, key, value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return
    if number != number:
        return
    item = store[key]
    item[0] += number
    item[1] += 1


def avg(pair):
    total, count = pair
    return round(total / count, 4) if count else None


def standard_rank(pollutant, standard):
    priority = EPA_STANDARD_PRIORITY[pollutant]
    try:
        return priority.index(standard)
    except ValueError:
        return len(priority)


def nested_state_year(state_year):
    output = {}
    for (pollutant, metric, year, state), pair in state_year.items():
        output.setdefault(pollutant, {}).setdefault(metric, {}).setdefault(str(year), {})[state] = avg(pair)
    return output


def nested_trends(trends):
    output = {}
    for (pollutant, metric, year), pair in trends.items():
        output.setdefault(pollutant, {}).setdefault(metric, {})[str(year)] = avg(pair)
    return output


def nested_city_rankings(city_year):
    grouped = defaultdict(list)
    for (pollutant, metric, year, state, city), pair in city_year.items():
        value = avg(pair)
        if value is not None:
            grouped[(pollutant, metric, str(year))].append(
                {"state": state, "city": city, "value": value}
            )

    output = {}
    for (pollutant, metric, year), rows in grouped.items():
        rows.sort(key=lambda row: row["value"], reverse=True)
        output.setdefault(pollutant, {}).setdefault(metric, {})[year] = rows[:15]
    return output


def main():
    project_root = Path(__file__).resolve().parents[1]
    csv_path = project_root / "data" / "pollution_us_2000_2016.csv"
    if not csv_path.exists():
        csv_path = project_root.parent / "pollution_us_2000_2016.csv"

    if not csv_path.exists():
        raise FileNotFoundError(
            "Could not find pollution_us_2000_2016.csv in ./data or the parent project folder."
        )

    output_path = project_root / "public" / "data" / "dashboard-data.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    state_year = defaultdict(lambda: [0.0, 0])
    trends = defaultdict(lambda: [0.0, 0])
    city_year = defaultdict(lambda: [0.0, 0])
    state_year_sources = {}
    state_sites = defaultdict(set)
    city_sites = defaultdict(set)
    states = set()
    years = set()
    total_records = 0

    with csv_path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            total_records += 1
            state = row.get("State", "").strip()
            city = row.get("City", "").strip()
            date = row.get("Date Local", "")
            if state not in VALID_US_STATES or not city or len(date) < 4:
                continue

            try:
                year = int(date[:4])
            except ValueError:
                continue

            states.add(state)
            years.add(year)
            site_id = "|".join(
                [
                    row.get("State Code", "").strip(),
                    row.get("County Code", "").strip(),
                    row.get("Site Num", "").strip(),
                ]
            )
            if site_id.strip("|"):
                state_sites[state].add(site_id)
                city_sites[(state, city)].add(site_id)

            for pollutant in POLLUTANTS:
                for metric, template in METRICS.items():
                    value = row.get(template.format(pollutant=pollutant))
                    add_value(state_year, (pollutant, metric, year, state), value)
                    add_value(trends, (pollutant, metric, year), value)
                    add_value(city_year, (pollutant, metric, year, state, city), value)

                    if metric == "mean":
                        try:
                            float(value)
                            state_year_sources[(pollutant, metric, year, state)] = "Kaggle"
                        except (TypeError, ValueError):
                            pass

    epa_added = enrich_from_epa_annual(
        project_root=project_root,
        state_year=state_year,
        trends=trends,
        city_year=city_year,
        state_year_sources=state_year_sources,
        states=states,
        years=years,
    )

    payload = {
        "pollutants": POLLUTANTS,
        "metrics": [
            {"id": "aqi", "label": "AQI"},
            {"id": "mean", "label": "Mean"},
        ],
        "years": sorted(years),
        "states": sorted(states),
        "summary": {
            "totalRecords": total_records,
            "stateCount": len(states),
            "cityCount": len(city_sites),
            "siteCount": len({site for sites in state_sites.values() for site in sites}),
            "stateSites": {state: len(sites) for state, sites in state_sites.items()},
            "epaAnnualMeanValuesAdded": epa_added,
        },
        "stateYear": nested_state_year(state_year),
        "stateYearSources": nested_sources(state_year_sources),
        "trends": nested_trends(trends),
        "cityRankings": nested_city_rankings(city_year),
    }

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, separators=(",", ":"))

    print(f"Wrote {output_path}")
    print(f"Years: {min(years)}-{max(years)} | States: {len(states)}")
    print(f"EPA annual mean values added: {epa_added}")


def nested_sources(sources):
    output = {}
    for (pollutant, metric, year, state), source in sources.items():
        output.setdefault(pollutant, {}).setdefault(metric, {}).setdefault(str(year), {})[state] = source
    return output


def enrich_from_epa_annual(project_root, state_year, trends, city_year, state_year_sources, states, years):
    downloads = Path.home() / "Downloads"
    candidates = [project_root / "epa", project_root / "data" / "epa", downloads]
    annual_files = []
    for folder in candidates:
        if folder.exists():
            annual_files.extend(sorted(folder.glob("annual_conc_by_monitor_*.zip")))

    if not annual_files:
        return 0

    added = 0
    for zip_path in annual_files:
        try:
            year = int(zip_path.stem.rsplit("_", 1)[1])
        except (IndexError, ValueError):
            continue

        best_rows = {}
        with ZipFile(zip_path) as archive:
            csv_name = next((name for name in archive.namelist() if name.endswith(".csv")), None)
            if not csv_name:
                continue
            with archive.open(csv_name) as raw:
                reader = csv.DictReader((line.decode("utf-8", errors="replace") for line in raw))
                for row in reader:
                    pollutant = EPA_PARAMETER_CODES.get(row.get("Parameter Code", "").strip())
                    if not pollutant:
                        continue
                    state = row.get("State Name", "").strip()
                    city = row.get("City Name", "").strip()
                    standard = row.get("Pollutant Standard", "").strip()
                    mean = row.get("Arithmetic Mean", "")
                    if state not in VALID_US_STATES or not city:
                        continue
                    try:
                        value = float(mean)
                    except ValueError:
                        continue
                    key = (pollutant, state, city, row.get("County Name", "").strip(), row.get("Site Num", "").strip())
                    candidate = (standard_rank(pollutant, standard), value, row)
                    if key not in best_rows or candidate[0] < best_rows[key][0]:
                        best_rows[key] = candidate

        epa_state = defaultdict(lambda: [0.0, 0])
        epa_city = defaultdict(lambda: [0.0, 0])
        for (pollutant, state, city, *_), (_, value, _) in best_rows.items():
            epa_state[(pollutant, state)][0] += value
            epa_state[(pollutant, state)][1] += 1
            epa_city[(pollutant, state, city)][0] += value
            epa_city[(pollutant, state, city)][1] += 1

        for (pollutant, state), pair in epa_state.items():
            key = (pollutant, "mean", year, state)
            if state_year[key][1] == 0:
                value = avg(pair)
                add_value(state_year, key, value)
                add_value(trends, (pollutant, "mean", year), value)
                state_year_sources[key] = "EPA AirData"
                states.add(state)
                years.add(year)
                added += 1

        for (pollutant, state, city), pair in epa_city.items():
            key = (pollutant, "mean", year, state, city)
            if city_year[key][1] == 0:
                add_value(city_year, key, avg(pair))

    return added


if __name__ == "__main__":
    main()
