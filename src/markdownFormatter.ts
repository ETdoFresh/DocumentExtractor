interface FormatterOptions {
    includeImages?: boolean;
    imageToText?: boolean;
}

const MAX_CONCURRENT_REQUESTS = 3;
let activeRequestCount = 0;
const requestQueue: Array<{
    html: string;
    options: FormatterOptions;
    resolve: (value: string) => void;
    reject: (reason?: any) => void;
}> = [];

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
 * Convert HTML to Markdown using an external LLM API.
 */
export async function formatToMarkdown(
    html: string,
    options: FormatterOptions = {}
): Promise<string> {
    if (activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
        return new Promise((resolve, reject) => {
            requestQueue.push({ html, options, resolve, reject });
        });
    }

    activeRequestCount++;
    try {
        let processedHtml = html;

        if (options.includeImages) {
        // Replace image src links with generated local file names
        processedHtml = processedHtml.replace(
            /<img\s+[^>]*src="([^"]+)"[^>]*>/gi, 
            (match, src) => {
                const localSrc = generateLocalImageName(src);
                return `<img src="${localSrc}" alt="Image"/>`;
            }
        );
    }

        if (options.imageToText) {
        // Replace images with a placeholder block
        processedHtml = await convertImagesToText(processedHtml);
    }

        // Use withRetry for the API call
        const result = await withRetry(async () => {
            // Prepare the request to the LLM API
            const apiKey = localStorage.getItem('openRouterApiKey');
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: [{
                        role: 'user',
                        content: `Convert the following HTML to Markdown. 
                        Here are some rules:
                        1. Preserve the structure and formatting of the original content as much as possible.
                        2. Do not include href to any local links, only external links are allowed.
                        3. Do not include \`\`\` or any other code block formatting, just plain text.

                        For example:
                        Do not include any of the following:
                        [Architecture](architecture)
                        [Base Protocol](basic)
                        [Server Features](server)
                        [Client Features](client)
                        [Contributing](contributing)

                        The following are OK:
                        [#Implementation Guidelines](#implementation-guidelines)
                        [#Learn More](#learn-more)
                        [#Key Details](#key-details)
                        [RFC2119](https://datatracker.ietf.org/doc/html/rfc2119)
                        [modelcontextprotocol.io](https://modelcontextprotocol.io)

                        \n${processedHtml}\n<EOF>`
                    }],
                    stream: false,
                    temperature: 0.3,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                throw new Error(`Markdown formatting failed: ${response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.replace('<EOF>', '').trim();
        });
        
        return result;
    } catch (error) {
        throw error;
    } finally {
        // Process next in queue if available
        activeRequestCount--;
        if (requestQueue.length > 0) {
            const nextRequest = requestQueue.shift()!;
            formatToMarkdown(nextRequest.html, nextRequest.options)
                .then(nextRequest.resolve)
                .catch(nextRequest.reject);
        }
    }
}

function generateLocalImageName(src: string): string {
    // Simple conversion: use the last segment of the URL path
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'image.jpg';
}

async function convertImagesToText(html: string): Promise<string> {
    // Replace <img> tags with a placeholder text block
    return html.replace(
        /<img\s+[^>]*src="([^"]+)"[^>]*>/gi, 
        (match, src) => {
            return `<div class="image-description">[Image description for: ${src}]</div>`;
        }
    );
}