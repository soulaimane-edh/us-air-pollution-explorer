# Setup and running guide

## Requirements

- Node.js 18 or newer
- npm
- Python 3, only needed if regenerating the processed JSON data
- Modern browser: Chrome, Edge, Firefox, or Safari

## Run locally

Open a terminal in the project root, the folder that contains `package.json`.

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Use a different port

```bash
npm run dev -- --port 5175
```

Then open:

```text
http://127.0.0.1:5175/
```

## Rebuild processed data

Place the raw CSV in the `data/` folder, then run:

```bash
python scripts/preprocess.py
```

This regenerates:

```text
public/data/dashboard-data.json
public/data/monthly-data.json
```

## Production build

```bash
npm run build
npm run preview
```
