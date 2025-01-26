import './styles.css';

class ContentRetriever {
    private urlInput: HTMLInputElement;
    private retrieveButton: HTMLButtonElement;
    private responseOutput: HTMLPreElement;

    constructor() {
        this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
        this.retrieveButton = document.getElementById('retrieveButton') as HTMLButtonElement;
        this.responseOutput = document.getElementById('responseOutput') as HTMLPreElement;
        
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
        this.retrieveButton.disabled = true;
        this.responseOutput.textContent = 'Loading...';

        try {
            const fetchUrl = `/proxy?url=${encodeURIComponent(inputUrl)}`;
            const response = await fetch(fetchUrl, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            });
            const text = await response.text();
            this.responseOutput.textContent = text;
        } catch (error) {
            this.responseOutput.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to fetch content'}`;
        } finally {
            this.retrieveButton.disabled = false;
            this.validateInput();
        }
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new ContentRetriever();
});