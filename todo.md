# Future Enhancements & TODO List

This document outlines future feature enhancements, design investigations, and packaging routes for the **Lokal Web Scraper** application.

---

## 📅 TODO List & Action Items

### 1. Progressive Web App (PWA) Packaging
Transform the frontend interface into an installable, mobile-responsive Progressive Web App.
*   [ ] Create a `manifest.json` file defining app icons, themes, launch orientations, and standalone display configurations.
*   [ ] Implement a basic `service-worker.js` script to cache CSS/JS resources, enabling near-instant loading times and offline fallbacks.
*   [ ] Add an "Install App" button in the Settings panel for compatible browsers (Chrome, Edge, Safari).

### 2. Browser Extension Integration (Manifest V3)
Build a complementary web extension (e.g., Chrome Extension) to scrape pages instantly as you browse.
*   [ ] Design a compact popup interface containing the model selector and summary format dropdowns.
*   [ ] Write a content script to extract raw text content directly from the active tab's DOM.
*   [ ] Connect the popup directly to the local Ollama API (`http://localhost:11434`).

### 3. Feature Extensions
*   [ ] **Prompt Templates**: Allow users to edit system instructions or inject custom guidelines (e.g. *"Summarize this like a financial analyst"* or *"Translate summary to Spanish"*) from the settings menu.
*   [ ] **Export Summaries**: Add export buttons to download summaries directly as Markdown (`.md`), structured JSON, or CSV files.
*   [ ] **Vector Search (RAG)**: Create a local vector database chunking scraped pages to allow semantic searching across history records.

---

## 🔍 Feasibility Analysis: PWA & Browser Extension

### 1. Packaging as a PWA
*   **Is it possible?** **Yes**, but with architectural limitations.
*   **How it works**: A PWA allows the frontend (`index.html`, `style.css`, `app.js`) to be installed onto a user's desktop or phone. However, a PWA runs entirely inside the client's browser sandbox.
*   **Limitations**:
    1.  **CORS Restrictions**: Browser sandboxes block direct fetch requests to external websites due to Cross-Origin Resource Sharing (CORS) rules. The PWA cannot scrape target sites directly; it *must* still route scraping requests through a proxy server (like our FastAPI backend).
    2.  **Ollama Connection**: The PWA will need access to local Ollama (`localhost:11434`). This requires launching Ollama with the environment variable `OLLAMA_ORIGINS="*"`, otherwise the browser will block requests to `localhost`.
*   **Verdict**: Excellent for mobile/desktop UI installation, but still requires the Python backend to perform the scraping.

### 2. Packaging as a Browser Extension
*   **Is it possible?** **Yes, and it is highly recommended.**
*   **How it works**: Extensions run with elevated privileges compared to standard web pages. A Manifest V3 extension can read the HTML structure of whatever website you are currently browsing.
*   **Advantages**:
    1.  **Bypasses CORS & Captchas**: The extension reads the active browser DOM directly. Since the webpage is already loaded, there are no CORS fetch issues, and it bypasses scraping blockers (like Cloudflare or CAPTCHAs) because you have already authenticated as a human in the browser.
    2.  **Zero-server Setup**: By reading the active tab DOM and sending it directly to a local Ollama endpoint (`http://localhost:11434`), the extension can function **without any Python backend at all**.
*   **Verdict**: This is the most seamless and secure way to implement a local-first scraper/summarizer.
