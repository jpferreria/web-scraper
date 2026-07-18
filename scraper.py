import sys
import json
import httpx
from bs4 import BeautifulSoup
import click
import ollama

def extract_clean_text(html_content: str) -> str:
    """Extracts cleaned text from HTML content, removing scripts, styles, navs, headers, footers."""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove script, style, nav, header, footer, form, aside elements
    for element in soup(["script", "style", "nav", "header", "footer", "form", "aside", "noscript", "iframe"]):
        element.decompose()
        
    # Search for main content wrapper elements
    main_content = soup.find(['article', 'main'])
    if not main_content:
        # Fallback to finding body or the soup object itself
        main_content = soup.find('body') or soup

    # Extract block-level elements to preserve readable structure
    chunks = []
    for element in main_content.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td']):
        text = element.get_text(strip=True)
        if text:
            chunks.append(text)
            
    if not chunks:
        # Last resort fallback: get all text separated by newlines
        return main_content.get_text(separator='\n', strip=True)
        
    return '\n\n'.join(chunks)

def fetch_page(url: str) -> str:
    """Fetches the webpage HTML content using httpx."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    try:
        # Follow redirects, use reasonable timeout
        response = httpx.get(url, headers=headers, follow_redirects=True, timeout=15.0)
        response.raise_for_status()
        return response.text
    except httpx.HTTPStatusError as e:
        click.echo(f"Error: Received HTTP status code {e.response.status_code} from {url}", err=True)
        sys.exit(1)
    except httpx.RequestError as e:
        click.echo(f"Error: Failed to connect to {url}. Details: {e}", err=True)
        sys.exit(1)

def summarize_text(text: str, host: str, model: str, summary_format: str) -> str:
    """Summarizes text using the local Ollama client and Gemma model."""
    client = ollama.Client(host=host)
    
    # Simple chunking/truncation to fit typical Ollama context window defaults (often 2048 or 4096 tokens)
    # 15,000 characters is roughly 2,500 to 3,000 words.
    max_chars = 15000
    if len(text) > max_chars:
        click.echo(f"Warning: Article is long ({len(text)} chars). Truncating to the first {max_chars} characters for Ollama input.", err=True)
        text = text[:max_chars]
        
    # Construct formatting-specific prompts
    if summary_format == 'bullet':
        prompt = (
            f"Provide a concise, high-impact bulleted summary highlighting the key points of the following web page content.\n\n"
            f"Content:\n{text}\n\n"
            f"Summary:"
        )
    elif summary_format == 'json':
        prompt = (
            f"Analyze the following web page content and produce a structured summary in JSON format.\n"
            f"The output must be valid JSON with the keys 'title', 'summary' (a brief paragraph), and 'key_takeaways' (a list of bullet points).\n"
            f"Do not return any extra conversational text or markdown formatting outside of the JSON block.\n\n"
            f"Content:\n{text}\n\n"
            f"JSON Output:"
        )
    else: # text format
        prompt = (
            f"Summarize the key points of the following web page content in a concise, well-structured paragraph or two.\n\n"
            f"Content:\n{text}\n\n"
            f"Summary:"
        )
        
    try:
        # Check if Ollama is running and has the model
        response = client.generate(model=model, prompt=prompt)
        return response['response']
    except ollama.ResponseError as e:
        click.echo(f"Ollama API Error: {e.error}", err=True)
        if "not found" in e.error.lower():
            click.echo(f"Tip: You may need to run `ollama pull {model}` in your terminal first.", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error: Failed to communicate with Ollama at {host}. Make sure Ollama is running.\nDetails: {e}", err=True)
        sys.exit(1)

@click.command()
@click.argument('url')
@click.option('--model', default='gemma2', help='The Gemma/Ollama model name to use (default: gemma2)')
@click.option('--host', default='http://localhost:11434', help='The URL of the local Ollama instance (default: http://localhost:11434)')
@click.option('--format', 'summary_format', type=click.Choice(['text', 'bullet', 'json']), default='text', help='Output format of the summary (default: text)')
@click.option('--output', type=click.Path(), help='File path to write the summary output to')
@click.option('--debug-text', is_flag=True, help='Print the extracted clean text without summarizing (for debugging scraper)')
def main(url, model, host, summary_format, output, debug_text):
    """Scrapes content from URL and summarizes it using Gemma via local Ollama."""
    click.echo(f"Fetching page content from: {url} ...")
    html_content = fetch_page(url)
    
    click.echo("Parsing and cleaning content...")
    clean_text = extract_clean_text(html_content)
    
    if not clean_text or len(clean_text.strip()) < 10:
        click.echo("Error: Could not extract any meaningful text from the website. It may be using client-side JavaScript rendering.", err=True)
        sys.exit(1)
        
    if debug_text:
        click.echo("\n--- Extracted Clean Text ---")
        click.echo(clean_text)
        click.echo("---------------------------\n")
        return
        
    click.echo(f"Generating summary using Ollama model '{model}'...")
    summary = summarize_text(clean_text, host, model, summary_format)
    
    click.echo("\n--- Summary ---")
    click.echo(summary)
    click.echo("---------------\n")
    
    if output:
        try:
            with open(output, 'w', encoding='utf-8') as f:
                f.write(summary)
            click.echo(f"Summary successfully written to {output}")
        except Exception as e:
            click.echo(f"Error: Failed to write summary to {output}. Details: {e}", err=True)

if __name__ == '__main__':
    main()
