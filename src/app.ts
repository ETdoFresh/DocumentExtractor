import './styles.css';
import { crawl, fetchHtml, extractContent } from './crawler';
import { formatToMarkdown } from './markdownFormatter';
import { copyToClipboard, debounce } from './utils';

declare global {
    interface Window {
        __appInitialized?: boolean;
    }
}

class App {
    private urlInput: HTMLInputElement;
    private depthSelect: HTMLSelectElement;
    private retrieveButton: HTMLButtonElement;
    private urlsContainer: HTMLElement;
    private htmlOutputContainer: HTMLElement;
    private markdownOutputContainer: HTMLElement;
    private crawledResults: Map<string, string> = new Map();
    private settingsButton: HTMLButtonElement;
    private apiKeySection: HTMLElement;
    private apiKeyInput: HTMLInputElement;
    private saveApiKeyButton: HTMLButtonElement;
    private lastChecked: HTMLInputElement | null = null;
    private htmlItems: {url: string, html: string, container: HTMLElement}[] = [];

    constructor() {
        this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
        this.depthSelect = document.getElementById('recursionLimit') as HTMLSelectElement;
        this.retrieveButton = document.getElementById('retrieveButton') as HTMLButtonElement;
        this.urlsContainer = document.getElementById('urlsContainer') as HTMLElement;
        this.htmlOutputContainer = document.getElementById('htmlOutputContainer') as HTMLElement;
        this.markdownOutputContainer = document.getElementById('markdownOutputContainer') as HTMLElement;
        
        // Initialize settings elements
        this.settingsButton = document.getElementById('settingsButton') as HTMLButtonElement;
        this.apiKeySection = document.getElementById('apiKeySection') as HTMLElement;
        this.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
        this.saveApiKeyButton = document.getElementById('saveApiKey') as HTMLButtonElement;

        // Add event listeners
        this.retrieveButton.addEventListener('click', () => this.handleRetrieve());
        
        // Settings click handler
        this.settingsButton.addEventListener('click', () => {
            this.toggleSettings();
        });

        // Initialize panel state
        this.apiKeySection.style.display = 'none';
        
        this.saveApiKeyButton.addEventListener('click', () => this.saveApiKey());

        // Load saved API key on startup
        this.loadApiKey();
    }

    private toggleSettings(): void {
        const isVisible = window.getComputedStyle(this.apiKeySection).display !== 'none';
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

    private async handleRetrieve() {
        const url = this.urlInput.value.trim();
        const depth = parseInt(this.depthSelect.value, 10);
        if (!url) return;

        this.retrieveButton.disabled = true;
        this.retrieveButton.textContent = 'Crawling...';

        try {
            this.crawledResults = await crawl(url, depth);
            this.displayUrlCheckboxes(Array.from(this.crawledResults.keys()));
        } catch (error) {
            console.error('Crawling failed:', error);
            this.urlsContainer.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            this.retrieveButton.disabled = false;
            this.retrieveButton.textContent = 'Retrieve';
        }
    }

    private displayUrlCheckboxes(urls: string[]) {
        this.urlsContainer.innerHTML = '';
        this.lastChecked = null;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';

        const selectAllButton = document.createElement('button');
        selectAllButton.textContent = 'Select All';
        selectAllButton.addEventListener('click', () => this.toggleAllCheckboxes(true));

        const deselectAllButton = document.createElement('button');
        deselectAllButton.textContent = 'Deselect All';
        deselectAllButton.addEventListener('click', () => this.toggleAllCheckboxes(false));

        buttonContainer.append(selectAllButton, deselectAllButton);
        this.urlsContainer.appendChild(buttonContainer);

        const list = document.createElement('ol');
        const outputHtmlButton = document.createElement('button');
        outputHtmlButton.textContent = 'Output HTML';
        outputHtmlButton.addEventListener('click', () => this.downloadSelectedHtml());
        
        urls.forEach(url => {
            const listItem = document.createElement('li');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = url;
            checkbox.id = `url-${urls.indexOf(url)}`;
            checkbox.addEventListener('click', (e) => this.handleCheckboxClick(e, checkbox));
            
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = url;
            
            listItem.append(checkbox, label);
            list.appendChild(listItem);
        });

        this.urlsContainer.appendChild(list);
        this.urlsContainer.appendChild(outputHtmlButton);
    }

    private handleCheckboxClick(e: MouseEvent, checkbox: HTMLInputElement) {
        if (e.shiftKey && this.lastChecked) {
            const checkboxes = Array.from(
                this.urlsContainer.querySelectorAll('input[type="checkbox"]')
            ) as HTMLInputElement[];
            
            const startIdx = checkboxes.indexOf(this.lastChecked);
            const endIdx = checkboxes.indexOf(checkbox);
            const [from, to] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
            
            const isChecked = checkbox.checked;
            for (let i = from; i <= to; i++) {
                checkboxes[i].checked = isChecked;
            }
        }
        this.lastChecked = checkbox;
    }

    private toggleAllCheckboxes(checked: boolean) {
        const checkboxes = this.urlsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            (checkbox as HTMLInputElement).checked = checked;
        });
    }

    private async downloadSelectedHtml(): Promise<void> {
        this.htmlOutputContainer.innerHTML = '';
        this.htmlItems = [];
        this.retrieveButton.disabled = true;
        this.retrieveButton.textContent = 'Downloading...';

        const checkboxes = this.urlsContainer.querySelectorAll('input[type="checkbox"]:checked');
        const containers: {url: string, container: HTMLElement}[] = [];
        
        checkboxes.forEach((checkbox) => {
            const url = (checkbox as HTMLInputElement).value;
            const container = document.createElement('div');
            container.className = 'html-output-item';
            
            const heading = document.createElement('h3');
            heading.textContent = url;
            container.appendChild(heading);

            const loading = document.createElement('p');
            loading.textContent = 'Downloading HTML...';
            loading.style.color = '#666';
            container.appendChild(loading);

            this.htmlOutputContainer.appendChild(container);
            containers.push({url, container});
        });

        await Promise.all(containers.map(async ({url, container}) => {
            try {
                // Use the already cleaned HTML from crawledResults if available
                let html = this.crawledResults.get(url) || '';
                
                // If the HTML isn't in crawledResults, fetch it directly and clean it
                if (!html) {
                    const rawHtml = await fetchHtml(url);
                    html = extractContent(rawHtml); // Apply extractContent to clean the HTML
                }
                
                container.innerHTML = '';
                
                const heading = document.createElement('h3');
                heading.textContent = url;
                container.appendChild(heading);

                const textarea = document.createElement('textarea');
                textarea.value = html;
                textarea.readOnly = true;
                textarea.style.width = '100%';
                textarea.style.height = '300px';
                container.appendChild(textarea);

                this.htmlItems.push({url, html, container});
            } catch (error) {
                container.innerHTML = '';
                container.appendChild(document.createElement('h3')).textContent = url;
                
                const errorMsg = document.createElement('p');
                errorMsg.textContent = `Error downloading HTML: ${error instanceof Error ? error.message : String(error)}`;
                errorMsg.style.color = 'red';
                container.appendChild(errorMsg);
            }
        }));

        if (this.htmlItems.length > 0) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            
            const formatButton = document.createElement('button');
            formatButton.className = 'format-button';
            formatButton.textContent = 'Format to Markdown';
            formatButton.addEventListener('click', () => this.handleFormatAll());
            
            const copyHtmlButton = document.createElement('button');
            copyHtmlButton.className = 'copy-button';
            copyHtmlButton.textContent = 'Copy ALL HTML to Clipboard';
            copyHtmlButton.addEventListener('click', () => this.copyAllHtmlToClipboard());
            
            buttonContainer.append(formatButton, copyHtmlButton);
            this.htmlOutputContainer.appendChild(buttonContainer);
        }

        this.retrieveButton.disabled = false;
        this.retrieveButton.textContent = 'Retrieve';
    }

    private async handleFormatAll() {
        this.markdownOutputContainer.innerHTML = '';
        
        const containers = this.htmlItems.map(item => {
            const mdContainer = document.createElement('div');
            mdContainer.className = 'markdown-output-item';
            
            const heading = document.createElement('h3');
            heading.textContent = item.url;
            mdContainer.appendChild(heading);

            const loading = document.createElement('p');
            loading.textContent = 'Formatting to markdown...';
            loading.style.color = '#666';
            mdContainer.appendChild(loading);

            this.markdownOutputContainer.appendChild(mdContainer);
            return { container: mdContainer, item };
        });

        await Promise.all(containers.map(async ({container, item}) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.readOnly = true;
                textarea.style.width = '100%';
                textarea.style.height = '300px';
                
                container.innerHTML = '';
                container.appendChild(document.createElement('h3')).textContent = item.url;
                container.appendChild(textarea);
                
                await this.streamMarkdownConversion(item.html, textarea);
            } catch (error) {
                container.innerHTML = '';
                container.appendChild(document.createElement('h3')).textContent = item.url;
                
                const errorMsg = document.createElement('p');
                errorMsg.textContent = `Error formatting: ${error instanceof Error ? error.message : String(error)}`;
                errorMsg.style.color = 'red';
                container.appendChild(errorMsg);
            }
        }));

        if (this.htmlItems.length > 0) {
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = 'Copy ALL Markdown to Clipboard';
            copyButton.addEventListener('click', () => this.copyAllMarkdownToClipboard());
            this.markdownOutputContainer.appendChild(copyButton);
        }
    }

    private async streamMarkdownConversion(html: string, output: HTMLTextAreaElement) {
        const markdown = await formatToMarkdown(html);
        output.value = markdown;
    }

    private copyAllHtmlToClipboard() {
        const allContent = this.htmlItems.map(item =>
            `=== ${item.url} ===\n\n${item.html}\n\n`
        ).join('\n');
        copyToClipboard(allContent);
    }

    private copyAllMarkdownToClipboard() {
        const textareas = this.markdownOutputContainer.querySelectorAll('textarea');
        const allContent = Array.from(textareas).map((textarea, i) =>
            `=== ${this.htmlItems[i]?.url || 'Unknown URL'} ===\n\n${textarea.value}\n\n`
        ).join('\n');
        copyToClipboard(allContent);
    }
}

// Singleton initialization guard
if (!window.__appInitialized) {
    window.__appInitialized = true;
    
    // Handle DOM ready state
    const initApp = () => {
        if (document.readyState === 'complete') {
            new App();
        } else {
            document.addEventListener('readystatechange', () => {
                if (document.readyState === 'complete') {
                    new App();
                }
            });
        }
    };

    // Start initialization
    initApp();
}