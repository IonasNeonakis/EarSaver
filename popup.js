document.addEventListener('DOMContentLoaded', () => {
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');

    // Load saved volume
    chrome.storage.local.get(['volume'], (result) => {
        if (result.volume !== undefined) {
            volumeSlider.value = result.volume;
            volumeValue.textContent = `${result.volume}%`;
        }
    });

    // Update volume and notify content script
    volumeSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        volumeValue.textContent = `${value}%`;

        // Save locally
        chrome.storage.local.set({ volume: value });

        // Send to active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_VOLUME', value: value / 100 }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Silent fail if not on YouTube or script not injected yet
                    }
                });
            }
        });
    });
});
