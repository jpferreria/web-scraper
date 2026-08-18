# Lokal Web Scraper & Summarizer

Lokal Web Scraper is a secure, local-first web scraping and summarization application. It features a modern, responsive web application and a command-line interface, utilizing **FastAPI**, **BeautifulSoup**, and **Ollama** (with Gemma models) to process and summarize web pages completely locally.

## Features

- **Double-Style Interface**: Choose between a modern **Glassmorphic** design (translucent panes, blurred glows) and a clean, high-performance **Flat Design**.
- **Responsive Theme Modes**: Full dark and light modes, seamlessly toggling colors and contrast for optimum readability.
- **Unified Settings Modal**: Configure your local or remote Ollama Host API URL, choose themes, and clear cached history in one place.
- **Phase-based Loader**: Visual status updates showing exactly what the scraper is executing (Scraping, Cleaning, Summarizing).
- **Text-to-Speech Summaries**: Native Speech Synthesis integration allowing you to read summaries aloud.
- **Security Protections**:
  - **SSRF Prevention**: Automatically blocks internal network scans, private IP ranges (like loopbacks or link-local targets), and cloud metadata endpoints.
  - **XSS Sanitization**: Escapes user-provided webpage content and titles before rendering in the DOM.
  - **Prompt Injection Defense**: Separates system instructions from raw scraped content using Ollama's chat completions role segregation.
- **Persistent Search History**: Save and browse past scraped page summaries with options to restore or delete records.
- **Hermetic Testing**: Includes full test suites with API, scraping, and security assertion mocks.

---

## Installation & Setup

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.com) installed and running locally.
- A compatible Gemma model pulled (e.g. `gemma2` or `gemma4:e2b`):
  ```bash
  ollama pull gemma2
  ```

### 1. Clone the repository and navigate to the directory
```bash
git clone https://github.com/jpferreria/web-scraper.git
cd web-scraper
```

### 2. Set up virtual environment and install dependencies
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## How to Run

### Running the Web App
Start the FastAPI server:
```bash
.venv/bin/uvicorn main:app --port 8000 --host 127.0.0.1 --reload
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

### Running the CLI Tool
You can run the scraper directly from your shell:
```bash
./scraper.py https://example.com --model gemma2 --format text
```
Options:
- `--model <name>`: Ollama model name to summarize with (default: `gemma2`).
- `--host <url>`: Ollama API endpoint (default: `http://localhost:11434`).
- `--format <text|bullet|json>`: Output style of the summary (default: `text`).
- `--output <path>`: Write summary results to a file.

You can also use the shell launcher shortcut:
```bash
./lokalscraper https://example.com
```

---

## Running Unit Tests
Validate the application status endpoints, scrapers, HTML parses, and security validators:
```bash
python -m unittest test_app.py
```

---

## Project Structure
```text
├── main.py             # FastAPI backend server & API routes
├── scraper.py          # BeautifulSoup parsing and Ollama chat connection logic
├── test_app.py         # Automated unit test suite with mock servers
├── requirements.txt    # Python library requirements
├── lokalscraper        # Shell launcher script shortcut
├── static/
│   ├── index.html      # Glassmorphic/Flat responsive DOM structure
│   ├── style.css       # Color palettes, variables, animations, and layouts
│   └── app.js          # DOM controllers, Web Speech API, and API fetch calls
└── history.json        # Persistent search history storage (local cache)
```

---

## Wiki Documentation
For detailed developer manuals, user guides, and security architecture deep-dives, visit the project [GitHub Wiki](https://github.com/jpferreria/web-scraper/wiki).
