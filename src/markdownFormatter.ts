interface FormatterOptions {
    includeImages?: boolean;
    imageToText?: boolean;
}

/**
 * Convert HTML to Markdown using an external LLM API.
 */
export async function formatToMarkdown(
    html: string, 
    options: FormatterOptions = {}
): Promise<string> {
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