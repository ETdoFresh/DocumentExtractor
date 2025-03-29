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

        buttonContainer.append(selectAllButton, deselectAllButton);
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
}

document.addEventListener('DOMContentLoaded', () => new App());