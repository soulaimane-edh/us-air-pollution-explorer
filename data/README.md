# Raw data folder

Place the raw dataset here only when you need to regenerate the processed dashboard JSON files.

Expected filename options used by `scripts/preprocess.py`:

- `pollution_us_2000_2016.csv`
- optional EPA AirData annual concentration ZIP files named `annual_conc_by_monitor_YEAR.zip`

The GitHub repository includes the processed browser-ready files in `public/data/`:

- `dashboard-data.json`
- `monthly-data.json`

Large raw CSV or EPA ZIP files are intentionally ignored by Git to keep the repository lightweight.
