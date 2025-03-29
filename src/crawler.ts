/**
 * Fetch the HTML content from a URL using a simple proxy.
 * Adjust the proxy URL if needed.
 */
export async function fetchHtml(url: string): Promise<string> {
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
 * Recursively crawl the given URL to the specified depth.
 * Returns a Map of URL to its fetched HTML content.
 */
export async function crawl(
    url: string, 
    depth: number, 
    visited = new Set<string>()
): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (depth <= 0 || visited.has(url)) return results;
    
    visited.add(url);
    try {
        const html = await fetchHtml(url);
        results.set(url, html);
        const links = extractLinks(url, html);
        
        for (const link of links) {
            const subResults = await crawl(link, depth - 1, visited);
            subResults.forEach((value, key) => results.set(key, value));
        }
    } catch (error) {
        console.error(`Error crawling ${url}:`, error);
    }
    return results;
}