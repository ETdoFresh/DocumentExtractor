/**
 * Fetch the HTML content from a URL using a simple proxy.
 * Adjust the proxy URL if needed.
 */
export async function fetchHtml(url: string): Promise<string> {
    return withRetry(async () => {
        const proxyUrl = 'https://api.etdofresh.com/fetch_generated_html_from_url';
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        if (!response.ok) {
            throw new Error(`Error fetching ${url}: ${response.statusText}`);
        }
        const data = await response.json();
        return data.html;
    });
}

/**
 * Helper function to retry an operation with exponential backoff.
 * Will retry 3 times with delays of 1s, 5s, and 15s.
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
    delays = [1000, 5000, 15000]
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (retries <= 0) throw error;
        
        console.log(`Operation failed, retrying in ${delays[0]/1000}s...`, error);
        
        // Wait for the specified delay
        await new Promise(resolve => setTimeout(resolve, delays[0]));
        
        // Retry with one less retry and without the first delay
        return withRetry(operation, retries - 1, delays.slice(1));
    }
}

/**
 * Clean up excessive whitespace in HTML content while preserving structure.
 * This removes multiple blank lines and normalizes indentation.
 */
function cleanWhitespace(html: string): string {
    return html
        // Replace multiple blank lines with a single newline
        .replace(/[\r\n]+\s*[\r\n]+/g, '\n')
        // Remove whitespace between closing and opening tags
        .replace(/>\s+</g, '><')
        // Add appropriate newlines and indentation for readability
        .replace(/(<\/?(?:div|p|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|section|article|header|footer|nav|aside|main)[^>]*>)/g, '\n$1')
        // Clean up any resulting multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Extract and clean HTML content by removing unwanted elements.
 * 
 * This function takes the approach of preserving all content by default,
 * and only removing elements that are not relevant to the content, such as:
 * - DOCTYPE declarations
 * - Script tags
 * - Style tags and CSS
 * - Meta tags (except charset)
 * - Navigation menus
 * - Ads and iframes
 * - Social media widgets
 * - Cookie notices
 * - Footers
 * - Other non-content elements
 * 
 * @param html The raw HTML content
 * @returns A cleaned HTML string without unwanted elements
 */
export function extractContent(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Keep the title element but remove other unwanted head elements
    const title = doc.title;
    
    // Remove elements by selectors - these selectors target common non-content elements
    const unwantedSelectors = [
        'script', 'style', 'link', 'iframe', 'noscript',
        'svg', 'path', 'button', 'form',
        'nav', 'aside', 'footer', 'header', 
        '[class*="cookie"]', '[class*="popup"]', '[class*="banner"]',
        '[class*="ad-"]', '[class*="-ad"]', '[class*="ads"]', '[id*="ad-"]', '[id*="-ad"]',
        '[class*="social"]', '[class*="share"]',
        '[class*="menu"]', '[class*="nav-"]', '[role="navigation"]',
        '[class*="sidebar"]', '[class*="widget"]',
        '[aria-hidden="true"]'
    ];
    
    // Remove all elements matching the unwanted selectors
    unwantedSelectors.forEach(selector => {
        try {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(element => {
                element.parentNode?.removeChild(element);
            });
        } catch (e) {
            // Ignore errors for selectors that might not be valid
        }
    });
    
    // Clean up attributes that might contain scripts or tracking
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(element => {
        // Remove on* event handlers and most attributes except for essential ones
        const keepAttributes = ['href', 'src', 'alt', 'title', 'width', 'height'];
        
        for (const attr of Array.from(element.attributes)) {
            if (!keepAttributes.includes(attr.name) || attr.name.startsWith('on')) {
                element.removeAttribute(attr.name);
            }
        }
    });
    
    // Remove empty elements (after their children might have been removed)
    const emptyElements = doc.querySelectorAll('div, span, p');
    emptyElements.forEach(element => {
        if (!element.textContent?.trim() && 
            !element.querySelector('img') && 
            !element.querySelector('video') &&
            element.children.length === 0) {
            element.parentNode?.removeChild(element);
        }
    });
    
    // Get the body content
    const cleanContent = doc.body.innerHTML;
    
    // Create a simple wrapper with just the content and title
    return cleanWhitespace(`<div class="extracted-content">
    <h1 class="page-title">${title || ''}</h1>
    ${cleanContent}
</div>`);
}

/**
 * Extract and normalize links from the provided HTML.
 * Uses DOMParser to safely extract <a> tags.
 */
export function extractLinks(baseUrl: string, html: string): string[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const anchors = doc.querySelectorAll('a[href]');
    const links = new Set<string>();
    const base = new URL(baseUrl);
    
    anchors.forEach(anchor => {
        try {
            const href = anchor.getAttribute('href')!;
            const url = new URL(href, base);
            url.hash = ''; // Remove anchor
            if (url.protocol.startsWith('http')) {
                links.add(url.href);
            }
        } catch (e) {
            // Skip invalid URLs
        }
    });
    return Array.from(links);
}

/**
 * A simple semaphore to limit concurrent operations
 */
class Semaphore {
    private permits: number;
    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits--;
            return Promise.resolve();
        }
        
        return new Promise<void>(resolve => {
            this.waiting.push(resolve);
        });
    }

    release(): void {
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift()!;
            resolve();
        } else {
            this.permits++;
        }
    }
}

/**
 * Recursively crawl the given URL to the specified depth.
 * Returns a Map of URL to its fetched HTML content.
 * Limits concurrent downloads to 3 pages at a time.
 *
 * For depth > 1, recursively fetch content.
 * For depth === 1, fetch the starting URL but only list its links without downloading them.
 */
export async function crawl(
    url: string,
    depth: number,
    visited = new Set<string>(),
    semaphore = new Semaphore(3)
): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (depth < 0 || visited.has(url)) return results;

    visited.add(url);
    try {
        // Always fetch the content for the starting URL
        await semaphore.acquire();
        console.log(`Downloading: ${url}`);
        const html = await fetchHtml(url);
        semaphore.release();
        
        // Store the cleaned version of HTML instead of the full content
        const cleanedHtml = extractContent(html);
        results.set(url, cleanedHtml);

        if (depth > 1) {
            // Recursively fetch child pages with concurrency limit
            const links = extractLinks(url, html);
            const promises = links.map(async (link) => {
                const subResults = await crawl(link, depth - 1, visited, semaphore);
                subResults.forEach((value, key) => results.set(key, value));
            });
            await Promise.all(promises);
        } else if (depth === 1) {
            // For depth 1, only extract links but do not download their content.
            const links = extractLinks(url, html);
            for (const link of links) {
                if (!visited.has(link)) {
                    results.set(link, ''); // Mark as not downloaded
                    visited.add(link);
                }
            }
        }
    } catch (error) {
        semaphore.release();
        console.error(`Error crawling ${url}:`, error);
    }
    return results;
}