/**
 * Normalize a URL by removing trailing slashes and fragments
 */
export function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        urlObj.hash = '';
        urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
        return urlObj.toString();
    } catch (e) {
        return url;
    }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

/**
 * Generate a unique ID for DOM elements
 */
export function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

/**
 * Debounce a function to limit how often it's called
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T, 
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}