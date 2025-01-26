import './styles.css';
import * as cheerio from 'cheerio';

class ContentRetriever {
    private urlInput: HTMLInputElement;
    private recursionLimitSelect: HTMLSelectElement;
    private retrieveButton: HTMLButtonElement;
    private responseOutput: HTMLPreElement;
    private visitedUrls: Set<string>;

    constructor() {
        this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
        this.recursionLimitSelect = document.getElementById('recursionLimit') as HTMLSelectElement;
        this.retrieveButton = document.getElementById('retrieveButton') as HTMLButtonElement;
        this.responseOutput = document.getElementById('responseOutput') as HTMLPreElement;
        this.visitedUrls = new Set<string>();
        
        this.init();
    }

    private init(): void {
        this.retrieveButton.addEventListener('click', () => this.handleRetrieve());
        this.urlInput.addEventListener('input', () => this.validateInput());
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
        this.responseOutput.textContent = 'Loading...';

        try {
            const result = await this.fetchRecursively(inputUrl, maxDepth);
            this.responseOutput.textContent = this.formatResults(result);
        } catch (error) {
            this.responseOutput.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to fetch content'}`;
        } finally {
            this.retrieveButton.disabled = false;
            this.validateInput();
        }
    }

    private async fetchRecursively(url: string, depth: number): Promise<{ [url: string]: string }> {
        const results: { [url: string]: string } = {};
        
        if (depth <= 0 || this.visitedUrls.has(url)) {
            return results;
        }

        this.visitedUrls.add(url);

        try {
            const fetchUrl = `/proxy?url=${encodeURIComponent(url)}`;
            const response = await fetch(fetchUrl, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            });
            const text = await response.text();
            results[url] = text;

            // Extract and process links
            const links = this.extractLinks(url, text);
            for (const link of links) {
                const subResults = await this.fetchRecursively(link, depth - 1);
                Object.assign(results, subResults);
            }
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
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
                    // Only include links from the same domain
                    if (url.hostname === baseUrlObj.hostname && 
                        !this.visitedUrls.has(url.href) &&
                        url.protocol.startsWith('http')) {
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
            output += `\n=== ${url} ===\n${content}\n`;
        }
        return output.trim();
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new ContentRetriever();
});