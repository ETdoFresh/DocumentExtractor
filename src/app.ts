import './styles.css';
import * as cheerio from 'cheerio';

class ContentRetriever {
    private urlInput: HTMLInputElement;
    private recursionLimitSelect: HTMLSelectElement;
    private retrieveButton: HTMLButtonElement;
    private responseOutput: HTMLPreElement;
    private progressBar: HTMLProgressElement;
    private progressText: HTMLElement;
    private progressContainer: HTMLElement;
    private settingsButton: HTMLButtonElement;
    private apiKeySection: HTMLElement;
    private apiKeyInput: HTMLInputElement;
    private saveApiKeyButton: HTMLButtonElement;
    private copyButton: HTMLButtonElement;
    private copyMarkdownButton: HTMLButtonElement;
    private markdownButton: HTMLButtonElement;
    private markdownContainer: HTMLElement;
    private markdownOutput: HTMLPreElement;
    private streamingIndicator: HTMLElement;
    private samePathCheckbox: HTMLInputElement;
    private visitedUrls: Set<string>;
    private totalPages: number;
    private downloadedPages: number;

    constructor() {
        this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
        this.recursionLimitSelect = document.getElementById('recursionLimit') as HTMLSelectElement;
        this.retrieveButton = document.getElementById('retrieveButton') as HTMLButtonElement;
        this.responseOutput = document.getElementById('responseOutput') as HTMLPreElement;
        this.progressBar = document.getElementById('downloadProgress') as HTMLProgressElement;
        this.progressText = document.getElementById('progressText') as HTMLElement;
        this.progressContainer = document.getElementById('progress-container') as HTMLElement;
        this.settingsButton = document.getElementById('settingsButton') as HTMLButtonElement;
        this.apiKeySection = document.getElementById('apiKeySection') as HTMLElement;
        this.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
        this.saveApiKeyButton = document.getElementById('saveApiKey') as HTMLButtonElement;
        this.copyButton = document.getElementById('copyButton') as HTMLButtonElement;
        this.copyMarkdownButton = document.getElementById('copyMarkdownButton') as HTMLButtonElement;
        this.markdownButton = document.getElementById('markdownButton') as HTMLButtonElement;
        this.markdownContainer = document.getElementById('markdownContainer') as HTMLElement;
        this.markdownOutput = document.getElementById('markdownOutput') as HTMLPreElement;
        this.streamingIndicator = document.getElementById('streamingIndicator') as HTMLElement;
        this.samePathCheckbox = document.getElementById('samePath') as HTMLInputElement;
        this.progressContainer.style.display = 'none';
        this.markdownContainer.style.display = 'none';
        this.visitedUrls = new Set<string>();
        this.totalPages = 0;
        this.downloadedPages = 0;
        
        this.init();
        this.loadApiKey();
    }

    private toggleSettings(): void {
        const isVisible = this.apiKeySection.style.display !== 'none';
        this.apiKeySection.style.display = isVisible ? 'none' : 'block';
    }

    private loadApiKey(): void {
        const savedApiKey = localStorage.getItem('openRouterApiKey');
        if (savedApiKey) {
            this.apiKeyInput.value = savedApiKey;
        }
    }

    private saveApiKey(): void {
        const apiKey = this.apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('openRouterApiKey', apiKey);
            this.apiKeySection.style.display = 'none';
        }
    }

    private updateProgress(): void {
        const percentage = this.totalPages ? Math.round((this.downloadedPages / this.totalPages) * 100) : 0;
        this.progressBar.value = percentage;
        this.progressText.textContent = `Downloaded ${this.downloadedPages} of ${this.totalPages} pages`;
    }

    private async countTotalPages(url: string, depth: number, visited = new Set<string>()): Promise<number> {
        if (depth <= 0 || visited.has(url)) {
            return 0;
        }

        visited.add(url);
        let count = 1;

        try {
            const proxyUrl = 'https://api.etdofresh.com/fetch_generated_html_from_url';
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Failed to fetch page: ${error.message || response.statusText}`);
            }

            const data = await response.json();
            const text = data.html;
            const links = this.extractLinks(url, text);
            
            for (const link of links) {
                count += await this.countTotalPages(link, depth - 1, visited);
            }
        } catch (error) {
            console.error(`Error counting pages at ${url}:`, error);
        }

        return count;
    }

    private async copyResponseText(): Promise<void> {
        const text = this.responseOutput.textContent;
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                this.copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    this.copyButton.textContent = 'Copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text:', err);
            }
        }
    }

    private async copyMarkdownText(): Promise<void> {
        const text = this.markdownOutput.textContent;
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                this.copyMarkdownButton.textContent = 'Copied!';
                setTimeout(() => {
                    this.copyMarkdownButton.textContent = 'Copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy markdown text:', err);
            }
        }
    }

    private async formatMarkdown(): Promise<void> {
        const text = this.responseOutput.textContent;
        if (!text) return;

        const apiKey = localStorage.getItem('openRouterApiKey');
        if (!apiKey) {
            this.toggleSettings();
            return;
        }

        const originalButtonText = this.markdownButton.textContent;
        this.markdownButton.disabled = true;
        this.markdownButton.textContent = 'Formatting...';
        this.markdownContainer.style.display = 'block';
        this.markdownOutput.textContent = 'Formatting content as markdown...';

        let currentResponse = ''; // Track the current response
        const messages = [
            {
                role: 'user',
                content: `
**System/Instructions:**
You are an expert at converting HTML into well-structured Markdown. When given HTML input, you will:

1. Parse and understand the structure of the HTML.
2. Convert headings (\`<h1>\`, \`<h2>\`, etc.) to Markdown headings (\`#\`, \`##\`, etc.).
3. Convert lists (\`<ul>\`, \`<ol>\`, \`<li>\`) to Markdown lists (\`-\`, \`1.\`, etc.).
4. Convert any emphasized text (\`<b>\`, \`<strong>\`, \`<i>\`, \`<em>\`) to **bold** or *italic* in Markdown.
5. Convert images (\`<img>\`) to Markdown image syntax \`![alt text](URL)\`, if desired.
6. Convert links (\`<a>\`) to proper Markdown links \`[text](URL)\`.
7. Remove all remaining HTML tags (e.g., \`<div>\`, \`<span>\`, etc.) that are purely structural and do not affect formatting.
8. Retain the text content and hierarchical formatting.
9. Provide the final output in **Markdown only** with no raw HTML elements.
10. Reorder or reformat content as needed for better readability. [For Example: Move Introduction section to the top.]
11. Add <EOF> at the end of the content.

**Response to User:**
1. Present the converted content in Markdown format.
2. Do not include any HTML tags in the final response.
3. Retain proper formatting, bullet points, headings, etc.

---

### Usage Example

\`\`\`
**User Input:**

<!DOCTYPE html>
<html>
    <head>
    <title>Example Page</title>
    </head>
    <body>
    <h1>Welcome to My Site</h1>
    <p>This is a paragraph explaining <strong>important</strong> details.</p>
    <ul>
        <li>Item 1</li>
        <li>Item 2</li>
    </ul>
    <div>
        <p>Another paragraph with an <a href="https://www.example.com">Example Link</a>.</p>
    </div>
    </body>
</html>
\`\`\`

**Model Response (ideal output):**

\`\`\`
# Welcome to My Site

This is a paragraph explaining **important** details.

- Item 1
- Item 2

Another paragraph with an [Example Link](https://www.example.com).
\`\`\`

---

**User Input:**

${text}`
            }
        ];
        
        try {
            if (!text.trim()) {
                throw new Error('No content to format');
            }
            this.streamingIndicator.style.display = 'inline';
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Website Content Retriever'
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: messages,
                    stream: true,
                    temperature: 0.3,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to get markdown response: ${errorData.error || response.statusText}`);
            }

            if (!response.body) {
                throw new Error('Failed to get markdown response');
            }

            this.markdownContainer.style.display = 'block';
            this.markdownOutput.textContent = '';

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let foundEOF = false;

            const processStream = async (streamReader: ReadableStreamDefaultReader<Uint8Array>) => {
                let streamBuffer = '';
                let streamFoundEOF = false;

                while (true) {
                    const { done, value } = await streamReader.read();
                    if (done || streamFoundEOF) break;

                    streamBuffer += decoder.decode(value, { stream: true });
                    const lines = streamBuffer.split('\n');
                    streamBuffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
                        if (trimmedLine.startsWith('data: ')) {
                            try {
                                const json = JSON.parse(trimmedLine.slice(6));
                                if (json.choices?.[0]?.delta?.content) {
                                    const content = json.choices[0].delta.content;
                                    const outputText = this.markdownOutput.textContent || '';
                                    this.markdownOutput.textContent = outputText + content;
                                    currentResponse = this.markdownOutput.textContent || '';
                                    this.streamingIndicator.textContent = `streaming... (chars: ${currentResponse.length})`;
                                    
                                    if (content.includes('<EOF>')) {
                                        streamFoundEOF = true;
                                        const cleanedText = (this.markdownOutput.textContent || '').replace('<EOF>', '');
                                        this.markdownOutput.textContent = cleanedText;
                                        currentResponse = cleanedText;
                                        break;
                                    }
                                }
                            } catch (e) {
                                console.debug('Failed to parse JSON:', trimmedLine);
                            }
                        }
                    }
                }

                if (!streamFoundEOF && streamBuffer.trim()) {
                    try {
                        const json = JSON.parse(streamBuffer.replace('data: ', ''));
                        if (json.choices?.[0]?.delta?.content) {
                            const content = json.choices[0].delta.content;
                            const outputText = this.markdownOutput.textContent || '';
                            this.markdownOutput.textContent = outputText + content;
                            currentResponse = this.markdownOutput.textContent || '';
                            this.streamingIndicator.textContent = `streaming... (chars: ${currentResponse.length})`;
                            
                            if (content.includes('<EOF>')) {
                                const cleanedText = (this.markdownOutput.textContent || '').replace('<EOF>', '');
                                this.markdownOutput.textContent = cleanedText;
                                currentResponse = cleanedText;
                                streamFoundEOF = true;
                            }
                        }
                    } catch (e) {
                        console.debug('Failed to parse final buffer:', streamBuffer);
                    }
                }

                return streamFoundEOF;
            };

            // Process initial response
            foundEOF = await processStream(reader);

            // If EOF not found, continue the conversation
            while (!foundEOF) {
                console.debug('Continuing conversation due to missing EOF');
                
                // Add a space before continuing to prevent words from running together
                if (currentResponse) {
                    this.markdownOutput.textContent = currentResponse + ' ';
                    currentResponse = this.markdownOutput.textContent;
                    
                    messages.push(
                        {
                            role: 'assistant',
                            content: currentResponse
                        },
                        {
                            role: 'user',
                            content: 'continue'
                        }
                    );
                }

                const continueResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'Website Content Retriever'
                    },
                    body: JSON.stringify({
                        model: 'google/gemini-2.0-flash-exp:free',
                        messages,
                        stream: true,
                        temperature: 0.3,
                        max_tokens: 4000
                    })
                });

                if (!continueResponse.ok || !continueResponse.body) {
                    throw new Error('Failed to continue markdown response');
                }

                const continueReader = continueResponse.body.getReader();
                foundEOF = await processStream(continueReader);
            }
        } catch (error) {
            console.error('Error formatting markdown:', error);
            this.markdownOutput.textContent = `Error formatting markdown: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
            this.markdownContainer.style.display = 'block';
            this.streamingIndicator.style.display = 'none';
        } finally {
            this.markdownButton.disabled = false;
            this.markdownButton.textContent = originalButtonText;
            this.streamingIndicator.style.display = 'none';
        }
    }

    private init(): void {
        this.retrieveButton.addEventListener('click', () => this.handleRetrieve());
        this.urlInput.addEventListener('input', () => this.validateInput());
        this.settingsButton.addEventListener('click', () => this.toggleSettings());
        this.saveApiKeyButton.addEventListener('click', () => this.saveApiKey());
        this.copyButton.addEventListener('click', () => this.copyResponseText());
        this.copyMarkdownButton.addEventListener('click', () => this.copyMarkdownText());
        this.markdownButton.addEventListener('click', () => this.formatMarkdown());
    }

    private validateInput(): void {
        const url = this.urlInput.value.trim();
        try {
            new URL(url);
            this.retrieveButton.disabled = false;
        } catch {
            this.retrieveButton.disabled = true;
        }
    }

    private async handleRetrieve(): Promise<void> {
        const inputUrl = this.urlInput.value.trim();
        const maxDepth = parseInt(this.recursionLimitSelect.value);
        
        this.visitedUrls.clear();
        this.retrieveButton.disabled = true;
        this.responseOutput.textContent = 'Calculating total pages...';
        this.progressText.textContent = 'Preparing...';
        this.progressBar.value = 0;
        this.downloadedPages = 0;
        this.progressContainer.style.display = 'block';
        this.markdownContainer.style.display = 'none';
        this.markdownOutput.textContent = '';

        try {
            // First count total pages
            this.totalPages = await this.countTotalPages(inputUrl, maxDepth);
            this.updateProgress();
            
            // Then start downloading
            this.responseOutput.textContent = 'Downloading...';
            const result = await this.fetchRecursively(inputUrl, maxDepth);
            this.responseOutput.textContent = this.formatResults(result);
        } catch (error) {
            this.responseOutput.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to fetch content'}`;
        } finally {
            this.retrieveButton.disabled = false;
            this.validateInput();
            this.progressContainer.style.display = 'none';
        }
    }

    private async fetchRecursively(url: string, depth: number): Promise<{ [url: string]: string }> {
        const results: { [url: string]: string } = {};
        
        if (depth <= 0 || this.visitedUrls.has(url)) {
            return results;
        }

        this.visitedUrls.add(url);

        try {
            const proxyUrl = 'https://api.etdofresh.com/fetch_generated_html_from_url';
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Failed to fetch page: ${error.message || response.statusText}`);
            }

            const data = await response.json();
            const text = data.html;

            // Clean up the HTML content using Cheerio
            const $ = cheerio.load(text);
            
            // Store title before removing head
            const title = $('title').text().trim();
            
            // Remove head and unwanted tags
            $('head').remove();
            $('script').remove();
            $('style').remove();
            $('svg').remove();
            $('img').remove();
            
            // Create new head with title if it existed
            if (title) {
                $('html').prepend(`<head><title>${title}</title></head>`);
            }
            
            // Clean up whitespace outside body
            $('html').contents().each((_, element) => {
                if (element.type === 'text' && !$(element).parent().is('body')) {
                    $(element).remove();
                }
            });
            
            // Trim whitespace at start and end of body
            const body = $('body');
            if (body.length) {
                const bodyHtml = body.html();
                if (bodyHtml) {
                    body.html(bodyHtml.trim());
                }
            }
            
            results[url] = $.html();
            
            // Update progress after successful download
            this.downloadedPages++;
            this.updateProgress();

            // Extract and process links
            const links = this.extractLinks(url, text);
            for (const link of links) {
                const subResults = await this.fetchRecursively(link, depth - 1);
                Object.assign(results, subResults);
            }
        } catch (error) {
            console.error(`Error setting up browser for ${url}:`, error);
        }

        return results;
    }

    private extractLinks(baseUrl: string, html: string): string[] {
        const $ = cheerio.load(html);
        const links = new Set<string>();
        const baseUrlObj = new URL(baseUrl);

        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (href) {
                try {
                    const url = new URL(href, baseUrl);
                    // Remove hash/anchor part
                    url.hash = '';
                    // Only include links that match our criteria
                    const isValidLink = url.hostname === baseUrlObj.hostname &&
                        !this.visitedUrls.has(url.href) &&
                        url.protocol.startsWith('http');

                    // Check if we should only include links from same path
                    const isSamePath = this.samePathCheckbox.checked ?
                        url.pathname.startsWith(baseUrlObj.pathname.replace(/\/[^/]*$/, '/')) :
                        true;

                    if (isValidLink && isSamePath) {
                        links.add(url.href);
                    }
                } catch (error) {
                    // Ignore invalid URLs
                }
            }
        });

        return Array.from(links);
    }

    private formatResults(results: { [url: string]: string }): string {
        let output = '';
        for (const [url, content] of Object.entries(results)) {
            // Load content into Cheerio
            const $ = cheerio.load(content);
            
            // Remove HTML comments only
            $('*').contents().each((_, element) => {
                if (element.type === 'comment') {
                    $(element).remove();
                }
            });
            
            // Get the content with HTML structure preserved
            const cleanedContent = $.html();
            
            output += `\n=== ${url} ===\n${cleanedContent}\n`;
        }
        return output.trim();
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new ContentRetriever();
});