# Contributing

This is an academic data visualization project. Contributions should keep the dashboard stable, readable, and task-oriented.

## Development workflow

1. Create a branch.
2. Run `npm install` if dependencies are missing.
3. Run `npm run dev` for development.
4. Run `npm run build` before submitting changes.
5. Avoid committing `node_modules`, `dist`, raw CSV files, or EPA ZIP files.

## Design rules

- Keep the Overview readable at a glance.
- Do not reintroduce free panel resizing.
- Keep advanced analysis in secondary modes.
- Preserve consistent pollutant colors across charts.
