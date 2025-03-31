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
        
        results.set(url, html);

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