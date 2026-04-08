# ElecDocs

AI-powered electrical schematic analysis and compliance tool by EnerTherm Engineering Ltd.

## Features

- Upload electrical schematic PDFs and get AI explanations in plain English
- Ask questions about schematics with streamed answers
- Extract structured component lists, I/O signal lists, and field device lists
- Upload URS/FDS requirement documents and generate instrumentation lists
- Cross-reference instrumentation against schematic field devices
- Run full compliance gap analysis (URS vs FDS vs schematic)
- Export professional Word reports (gap analysis and instrumentation)
- Works as web app and desktop app (Electron)

## Prerequisites

- **Node.js 20+**
- **Ghostscript** — required for PDF rasterisation
  - Windows: Download from https://ghostscript.com/releases/gsdnld.html and add to PATH
  - macOS: `brew install ghostscript`
  - Linux: `sudo apt install ghostscript`
- **Anthropic API key** — set in `.env`

## Setup

```bash
cd elecdocs
npm install

# Configure environment
cp .env.example .env  # or edit .env directly
# Set ANTHROPIC_API_KEY=sk-ant-...
```

## Development

```bash
# Web mode
npm run dev:web

# Electron mode
npm run dev:electron
```

## Build

```bash
# Web build
npm run build:web

# Desktop installer
npm run build:electron
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Zustand |
| Backend | Node.js, Express 5 |
| Desktop | Electron 30 |
| AI | Claude API (claude-sonnet-4-20250514) |
| PDF | pdf-parse + pdf2pic |
| Export | docx (Word), csv-stringify |
