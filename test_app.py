import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import json
import os

# Import elements to test
from scraper import extract_clean_text
from main import app, HISTORY_FILE

class TestLokalScraper(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        # Ensure a clean history file state for tests
        if os.path.exists(HISTORY_FILE):
            try:
                os.remove(HISTORY_FILE)
            except OSError:
                pass

    def tearDown(self):
        # Clean up test history file
        if os.path.exists(HISTORY_FILE):
            try:
                os.remove(HISTORY_FILE)
            except OSError:
                pass

    def test_extract_clean_text_basic(self):
        """Test that non-content elements are parsed out and core article text is returned."""
        html = """
        <html>
            <head><title>Test Title</title></head>
            <body>
                <header>
                    <nav><a href="/">Home</a></nav>
                </header>
                <main>
                    <article>
                        <h1>Main Heading</h1>
                        <p>This is the first paragraph of content.</p>
                        <p>This is the second paragraph of content.</p>
                    </article>
                    <aside>Related links and ads</aside>
                </main>
                <footer>
                    <p>Copyright 2026</p>
                </footer>
                <script>console.log('remove me');</script>
                <style>body { color: red; }</style>
            </body>
        </html>
        """
        cleaned = extract_clean_text(html)
        
        # Verify nav, header, footer, script, style, and aside elements are removed
        self.assertNotIn("Home", cleaned)
        self.assertNotIn("Copyright", cleaned)
        self.assertNotIn("remove me", cleaned)
        self.assertNotIn("color: red", cleaned)
        self.assertNotIn("Related links", cleaned)
        
        # Verify heading and article paragraphs are kept
        self.assertIn("Main Heading", cleaned)
        self.assertIn("This is the first paragraph of content.", cleaned)
        self.assertIn("This is the second paragraph of content.", cleaned)

    @patch('ollama.Client')
    def test_api_models_success(self, mock_ollama_client):
        """Test that GET /api/models correctly retrieves and formats models from Ollama."""
        # Setup mock client list response
        mock_instance = MagicMock()
        mock_ollama_client.return_value = mock_instance
        
        # Create mock model objects
        mock_model_1 = MagicMock()
        mock_model_1.model = "gemma2:latest"
        mock_model_2 = MagicMock()
        mock_model_2.model = "llava-phi3:latest"
        
        mock_list_response = MagicMock()
        mock_list_response.models = [mock_model_1, mock_model_2]
        mock_instance.list.return_value = mock_list_response
        
        response = self.client.get("/api/models")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertIn("models", data)
        self.assertEqual(data["models"], ["gemma2:latest", "llava-phi3:latest"])

    @patch('ollama.Client')
    @patch('httpx.AsyncClient.get')
    def test_api_status_online(self, mock_http_get, mock_ollama_client):
        """Test GET /api/status when both Ollama and external network are online."""
        # Mock Ollama list check
        mock_instance = MagicMock()
        mock_ollama_client.return_value = mock_instance
        mock_instance.list.return_value = MagicMock()
        
        # Mock HTTP get check
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_http_get.return_value = mock_response
        
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["ollama"], "online")
        self.assertEqual(data["scraper"], "online")

    @patch('ollama.Client')
    @patch('main.fetch_page')
    def test_api_summarize_success_and_history(self, mock_fetch, mock_ollama_client):
        """Test POST /api/summarize handles scrape request, queries Ollama, and appends to history."""
        # 1. Mock website fetch response
        mock_fetch.return_value = """
        <html>
            <head><title>Documentation Page</title></head>
            <body>
                <main>
                    <p>Scraped content from the website.</p>
                </main>
            </body>
        </html>
        """
        
        # 2. Mock Ollama generate summary response
        mock_instance = MagicMock()
        mock_ollama_client.return_value = mock_instance
        mock_instance.generate.return_value = {
            "response": "This is a mock summary of the scraped content."
        }
        
        payload = {
            "url": "https://testpage.com",
            "model": "gemma2",
            "format": "text"
        }
        
        # Query summarize endpoint
        response = self.client.post("/api/summarize", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["url"], "https://testpage.com")
        self.assertEqual(data["title"], "Documentation Page")
        self.assertEqual(data["summary"], "This is a mock summary of the scraped content.")
        self.assertEqual(data["raw_text"], "Scraped content from the website.")
        
        # Verify history file is updated and entries are retrievable
        history_response = self.client.get("/api/history")
        self.assertEqual(history_response.status_code, 200)
        history_data = history_response.json()
        
        self.assertEqual(len(history_data), 1)
        self.assertEqual(history_data[0]["title"], "Documentation Page")
        self.assertEqual(history_data[0]["url"], "https://testpage.com")

    def test_api_history_empty(self):
        """Test GET /api/history returns an empty list if no history exists."""
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_api_summarize_ssrf_protection(self):
        """Test POST /api/summarize rejects loopback and private network targets."""
        private_urls = [
            "http://127.0.0.1/admin",
            "http://localhost:8000/api/status",
            "https://192.168.1.1",
            "http://10.0.0.1",
            "http://169.254.169.254/latest/meta-data/"
        ]
        
        for url in private_urls:
            payload = {
                "url": url,
                "model": "gemma2",
                "format": "text"
            }
            response = self.client.post("/api/summarize", json=payload)
            self.assertEqual(response.status_code, 400)
            data = response.json()
            self.assertIn("detail", data)
            self.assertEqual(data["detail"], "Access to internal network ranges or invalid URLs is restricted.")

if __name__ == '__main__':
    unittest.main()
