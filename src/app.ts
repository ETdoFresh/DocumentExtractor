import './styles.css';
import { crawl } from './crawler';
import { formatToMarkdown } from './markdownFormatter';
import { copyToClipboard, debounce } from './utils';

class App {
    private urlInput: HTMLInputElement;
    private depthSelect: HTMLSelectElement;
    private retrieveButton: HTMLButtonElement;
    private urlsContainer: HTMLElement;
    private htmlOutputContainer: HTMLElement;
    private markdownOutputContainer: HTMLElement;
    private crawledResults: Map<string, string> = new Map();

    constructor() {
        this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
        this.depthSelect = document.getElementById('recursionLimit') as HTMLSelectElement;
        this.retrieveButton = document.getElementById('retrieveButton') as HTMLButtonElement;
        this.urlsContainer = document.getElementById('urlsContainer') as HTMLElement;
        this.htmlOutputContainer = document.getElementById('htmlOutputContainer') as HTMLElement;
        this.markdownOutputContainer = document.getElementById('markdownOutputContainer') as HTMLElement;

        this.init();
    }

    private init() {
        this.retrieveButton.addEventListener('click', () => this.handleRetrieve());
        // Add event listeners for other buttons (copy, format, etc.) here
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

        // Create Select All / Deselect All buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';

        const selectAllButton = document.createElement('button');
        selectAllButton.textContent = 'Select All';
        selectAllButton.addEventListener('click', () => this.toggleAllCheckboxes(true));

        const deselectAllButton = document.createElement('button');
        deselectAllButton.textContent = 'Deselect All';
        deselectAllButton.addEventListener('click', () => this.toggleAllCheckboxes(false));

        // NEW: Create a "Download HTML" button
        const downloadHtmlButton = document.createElement('button');
        downloadHtmlButton.textContent = 'Download HTML';
        downloadHtmlButton.addEventListener('click', () => this.downloadSelectedHtml());

        // Append all three buttons
        buttonContainer.append(selectAllButton, deselectAllButton, downloadHtmlButton);
        this.urlsContainer.appendChild(buttonContainer);

        // Create an ordered list of checkboxes
        const list = document.createElement('ol');
        urls.forEach(url => {
            const listItem = document.createElement('li');
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = url;
            checkbox.id = `url-${urls.indexOf(url)}`;
            
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = url;
            
            listItem.append(checkbox, label);
            list.appendChild(listItem);
        });

        this.urlsContainer.appendChild(list);
    }

    private toggleAllCheckboxes(checked: boolean) {
        const checkboxes = this.urlsContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            (checkbox as HTMLInputElement).checked = checked;
        });
    }

    private async handleFormat(html: string, options = {}) {
        try {
            const markdown = await formatToMarkdown(html, options);
            this.markdownOutputContainer.textContent = markdown;
        } catch (error) {
            this.markdownOutputContainer.textContent = `Error formatting markdown: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private htmlItems: {url: string, html: string, container: HTMLElement}[] = [];

    private downloadSelectedHtml(): void {
        // Clear existing content
        this.htmlOutputContainer.innerHTML = '';
        this.htmlItems = [];

        // Find all checked checkboxes
        const checkboxes = this.urlsContainer.querySelectorAll('input[type="checkbox"]:checked');
        checkboxes.forEach((checkbox) => {
            const url = (checkbox as HTMLInputElement).value;
            const htmlContent = this.crawledResults.get(url);
            if (htmlContent) {
                // Create a container for this HTML
                const container = document.createElement('div');
                container.className = 'html-output-item';
                
                // Add URL as heading
                const heading = document.createElement('h3');
                heading.textContent = url;
                container.appendChild(heading);
                
                // Add HTML in a textarea
                const textarea = document.createElement('textarea');
                textarea.value = htmlContent;
                textarea.readOnly = true;
                textarea.style.width = '100%';
                textarea.style.height = '300px';
                container.appendChild(textarea);
                
                this.htmlOutputContainer.appendChild(container);
                this.htmlItems.push({url, html: htmlContent, container});
            }
        });

        // Add Format to Markdown button if we have HTML items
        if (this.htmlItems.length > 0) {
            const formatButton = document.createElement('button');
            formatButton.className = 'format-button';
            formatButton.textContent = 'Format to Markdown';
            formatButton.addEventListener('click', () => this.handleFormatAll());
            this.htmlOutputContainer.appendChild(formatButton);
        }
    }

    private async handleFormatAll() {
        this.markdownOutputContainer.innerHTML = '';
        
        for (const item of this.htmlItems) {
            // Create markdown container for this item
            const mdContainer = document.createElement('div');
            mdContainer.className = 'markdown-output-item';
            
            const heading = document.createElement('h3');
            heading.textContent = item.url;
            mdContainer.appendChild(heading);
            
            const textarea = document.createElement('textarea');
            textarea.readOnly = true;
            textarea.style.width = '100%';
            textarea.style.height = '300px';
            mdContainer.appendChild(textarea);
            
            this.markdownOutputContainer.appendChild(mdContainer);
            
            // Stream markdown conversion
            await this.streamMarkdownConversion(item.html, textarea);
        }
    }

    private async streamMarkdownConversion(html: string, output: HTMLTextAreaElement) {
        // TODO: Implement actual streaming from LLM
        // For now just do immediate conversion
        const markdown = await formatToMarkdown(html);
        output.value = markdown;
    }
}

document.addEventListener('DOMContentLoaded', () => new App());