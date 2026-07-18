document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('scraper-form');
    const urlInput = document.getElementById('url-input');
    const modelSelect = document.getElementById('model-select');
    const formatSelect = document.getElementById('format-select');
    const submitBtn = document.getElementById('submit-btn');
    
    const loaderPanel = document.getElementById('loader-panel');
    const loaderStatus = document.getElementById('loader-status');
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    
    const resultsPanel = document.getElementById('results-panel');
    const summaryContent = document.getElementById('summary-content');
    const extractedTextBody = document.getElementById('extracted-text-body');
    const speakBtn = document.getElementById('speak-btn');
    const copyBtn = document.getElementById('copy-btn');
    const toast = document.getElementById('toast');
    const modelWarning = document.getElementById('model-warning');
    const historyList = document.getElementById('history-list');

    let currentLoadingInterval = null;

    // Load available models from the backend
    async function loadModels() {
        try {
            const host = localStorage.getItem('ollama_host') || '';
            const response = await fetch('/api/models', {
                headers: { 'X-Ollama-Host': host }
            });
            const data = await response.json();
            
            modelSelect.innerHTML = '';
            
            if (data.models && data.models.length > 0) {
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
                
                // Select a Gemma model automatically if available, otherwise select first
                const gemmaModel = data.models.find(m => m.toLowerCase().includes('gemma'));
                if (gemmaModel) {
                    modelSelect.value = gemmaModel;
                } else {
                    modelSelect.selectedIndex = 0;
                }
                modelWarning.classList.add('hidden');
            } else {
                showFallbackModels(data.warning || "Ollama service connection issue.");
            }
        } catch (err) {
            showFallbackModels("Could not connect to FastAPI server backend.");
        }
    }

    function showFallbackModels(reason) {
        console.warn("Using fallback models because:", reason);
        modelWarning.classList.remove('hidden');
        
        // Define some standard Ollama models for dropdown fallback
        const fallbacks = ['gemma2', 'gemma4:e2b', 'gemma4:e4b', 'gemma:2b', 'gemma:7b'];
        modelSelect.innerHTML = '';
        fallbacks.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = `${model} (fallback)`;
            modelSelect.appendChild(option);
        });
        modelSelect.selectedIndex = 0;
    }

    // Dynamic phase transitions for the loading status message
    function startLoadingSequence() {
        const phases = [
            { time: 0, text: "Connecting to server..." },
            { time: 1000, text: "Fetching webpage HTML..." },
            { time: 3000, text: "Parsing content & extracting readable text..." },
            { time: 5000, text: "Connecting to local Ollama service..." },
            { time: 6500, text: "Generating summary with Gemma model (this may take a bit)..." },
            { time: 15000, text: "Summarizer is still working. Generating final tokens..." }
        ];
        
        let start = Date.now();
        loaderStatus.textContent = phases[0].text;
        
        currentLoadingInterval = setInterval(() => {
            const elapsed = Date.now() - start;
            // Find current phase based on elapsed time
            const activePhase = [...phases].reverse().find(p => elapsed >= p.time);
            if (activePhase) {
                loaderStatus.textContent = activePhase.text;
            }
        }, 500);
    }

    function stopLoadingSequence() {
        if (currentLoadingInterval) {
            clearInterval(currentLoadingInterval);
            currentLoadingInterval = null;
        }
    }

    // Process Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        const model = modelSelect.value;
        const format = formatSelect.value;
        
        if (!url) return;

        // Reset UI components
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            if (typeof updateSpeakButton === 'function') {
                updateSpeakButton(false);
            }
        }
        errorPanel.classList.add('hidden');
        resultsPanel.classList.add('hidden');
        loaderPanel.classList.remove('hidden');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        startLoadingSequence();

        try {
            const host = localStorage.getItem('ollama_host') || '';
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Ollama-Host': host
                },
                body: JSON.stringify({ url, model, format })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "An unexpected error occurred during summarization.");
            }

            // Display Results
            displaySummary(data.summary, format);
            extractedTextBody.textContent = data.raw_text;
            
            resultsPanel.classList.remove('hidden');
            if (typeof loadHistory === 'function') {
                loadHistory();
            }
            // Scroll to results smoothly
            resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            console.error(err);
            errorMessage.textContent = err.message || "Failed to connect to backend service.";
            errorPanel.classList.remove('hidden');
            errorPanel.scrollIntoView({ behavior: 'smooth' });
        } finally {
            stopLoadingSequence();
            loaderPanel.classList.add('hidden');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });

    // Formatting raw string output based on selected format type
    function displaySummary(text, format) {
        summaryContent.className = 'summary-body';
        summaryContent.innerHTML = '';
        
        if (format === 'json') {
            summaryContent.classList.add('json-format');
            const pre = document.createElement('pre');
            
            // Try to extract JSON if LLM returned it wrapped in markdown code blocks
            let jsonText = text.trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.substring(7);
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.substring(3);
            }
            if (jsonText.endsWith('```')) {
                jsonText = jsonText.substring(0, jsonText.length - 3);
            }
            
            try {
                // Pretty print the JSON
                const jsonObj = JSON.parse(jsonText.trim());
                pre.textContent = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                // If it fails to parse, just print raw text
                pre.textContent = text;
            }
            summaryContent.appendChild(pre);
        } else if (format === 'bullet') {
            summaryContent.classList.add('bullet-format');
            const ul = document.createElement('ul');
            
            // Clean up lines and convert standard list syntaxes to HTML lists
            const lines = text.split('\n');
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('*') || trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
                    const li = document.createElement('li');
                    // Remove leading list indicators (e.g. *, -, 1.) and bold qualifiers
                    let cleanLine = trimmed.replace(/^[\*\-\d\.]+\s*/, '');
                    
                    // Simple replacement of markdown double asterisks with bold tags
                    cleanLine = cleanLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    
                    li.innerHTML = cleanLine;
                    ul.appendChild(li);
                } else if (trimmed.length > 0) {
                    // Fallback to p if it's text without bullet tags
                    const p = document.createElement('p');
                    p.innerHTML = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    p.style.margin = "10px 0";
                    summaryContent.appendChild(p);
                }
            });
            if (ul.children.length > 0) {
                summaryContent.appendChild(ul);
            }
        } else {
            summaryContent.classList.add('text-format');
            
            // Parse basic markdown double asterisks in general text summary paragraphs
            const paragraphs = text.split('\n\n');
            paragraphs.forEach(pText => {
                if (pText.trim().length > 0) {
                    const p = document.createElement('p');
                    p.innerHTML = pText.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    p.style.marginBottom = "12px";
                    summaryContent.appendChild(p);
                }
            });
        }
    }

    // Copy to Clipboard logic
    copyBtn.addEventListener('click', () => {
        let textToCopy = '';
        
        // Grab pre text or simple text depending on display children
        const pre = summaryContent.querySelector('pre');
        if (pre) {
            textToCopy = pre.textContent;
        } else {
            textToCopy = summaryContent.innerText;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast("Copied to clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast("Failed to copy summary.");
        });
    });

    // Speech Synthesis (Read Aloud) logic
    let synth = window.speechSynthesis;
    let utterance = null;

    speakBtn.addEventListener('click', () => {
        if (!synth) {
            showToast("Speech synthesis not supported in this browser.");
            return;
        }

        if (synth.speaking) {
            synth.cancel();
            updateSpeakButton(false);
            return;
        }

        let textToSpeak = '';
        const pre = summaryContent.querySelector('pre');
        if (pre) {
            try {
                const jsonObj = JSON.parse(pre.textContent);
                // For JSON summary, speak the title and summary paragraph, followed by key points
                textToSpeak = `${jsonObj.title || 'Summary'}. ${jsonObj.summary || ''}`;
                if (jsonObj.key_takeaways && Array.isArray(jsonObj.key_takeaways)) {
                    textToSpeak += `. Key takeaways: ${jsonObj.key_takeaways.join('. ')}`;
                }
            } catch (e) {
                textToSpeak = pre.textContent;
            }
        } else {
            textToSpeak = summaryContent.innerText;
        }

        if (!textToSpeak || textToSpeak.trim().length === 0) return;

        utterance = new SpeechSynthesisUtterance(textToSpeak);
        
        // Select an English voice if possible (prioritizing natural Siri or Google voices)
        const voices = synth.getVoices();
        const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
                              voices.find(v => v.lang.startsWith('en') && v.name.includes('Siri')) || 
                              voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) || 
                              voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) {
            utterance.voice = englishVoice;
        }

        utterance.onend = () => {
            updateSpeakButton(false);
        };

        utterance.onerror = () => {
            updateSpeakButton(false);
        };

        updateSpeakButton(true);
        synth.speak(utterance);
    });

    function updateSpeakButton(isSpeaking) {
        if (isSpeaking) {
            speakBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
            speakBtn.classList.add('speaking-active');
        } else {
            speakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Speak';
            speakBtn.classList.remove('speaking-active');
        }
    }

    function showToast(message) {
        const toastMsg = document.getElementById('toast-message');
        toastMsg.textContent = message;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 300);
        }, 2000);
    }

    // Fetch tool status (scraper internet connectivity & local Ollama availability)
    async function checkStatus() {
        const scraperDot = document.querySelector('#status-scraper .status-dot');
        const scraperLabel = document.querySelector('#status-scraper .status-label');
        const ollamaDot = document.querySelector('#status-ollama .status-dot');
        const ollamaLabel = document.querySelector('#status-ollama .status-label');

        try {
            const host = localStorage.getItem('ollama_host') || '';
            const response = await fetch('/api/status', {
                headers: { 'X-Ollama-Host': host }
            });
            const data = await response.json();

            // Update scraper status
            if (data.scraper === 'online') {
                scraperDot.className = 'status-dot status-online';
                scraperLabel.textContent = 'Scraper: Online';
            } else {
                scraperDot.className = 'status-dot status-offline';
                scraperLabel.textContent = 'Scraper: Offline';
            }

            // Update Ollama status
            if (data.ollama === 'online') {
                ollamaDot.className = 'status-dot status-online';
                ollamaLabel.textContent = 'Local AI Engine: Online';
            } else {
                ollamaDot.className = 'status-dot status-offline';
                ollamaLabel.textContent = 'Local AI Engine: Offline';
            }
        } catch (err) {
            scraperDot.className = 'status-dot status-offline';
            scraperLabel.textContent = 'Scraper: Offline';
            ollamaDot.className = 'status-dot status-offline';
            ollamaLabel.textContent = 'Local AI Engine: Offline';
        }
    }

    // Fetch and display history items
    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            const data = await response.json();

            historyList.innerHTML = '';

            if (data.error) {
                console.error(data.error);
                showEmptyHistory();
                return;
            }

            if (data && data.length > 0) {
                data.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'history-item';
                    itemEl.innerHTML = `
                        <div class="history-item-header">
                            <div class="history-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                            <button class="history-item-delete" title="Delete from history">
                                <i class="fa-regular fa-trash-can"></i>
                            </button>
                        </div>
                        <div class="history-item-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
                        <div class="history-item-meta">
                            <span class="history-item-model">${escapeHtml(item.model)}</span>
                            <span class="history-item-time">${formatDate(item.timestamp)}</span>
                        </div>
                    `;

                    // Click item to restore it in the results
                    itemEl.addEventListener('click', (e) => {
                        // Prevent restoring if user clicked delete button
                        if (e.target.closest('.history-item-delete')) return;
                        restoreHistoryItem(item);
                    });

                    // Delete item listener
                    const deleteBtn = itemEl.querySelector('.history-item-delete');
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await deleteHistoryItem(item.id);
                    });

                    historyList.appendChild(itemEl);
                });
            } else {
                showEmptyHistory();
            }
        } catch (err) {
            console.error("Failed to load history:", err);
            showEmptyHistory();
        }
    }

    function showEmptyHistory() {
        historyList.innerHTML = `
            <div class="history-empty">
                <i class="fa-solid fa-ghost"></i>
                <p>No recent summaries</p>
            </div>
        `;
    }

    async function deleteHistoryItem(id) {
        try {
            const response = await fetch(`/api/history/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast("Item deleted from history");
                loadHistory();
            }
        } catch (err) {
            console.error("Failed to delete history item:", err);
        }
    }



    // Restore a past summary in the results section
    function restoreHistoryItem(item) {
        // Stop current speaking if any
        if (synth && synth.speaking) {
            synth.cancel();
            updateSpeakButton(false);
        }

        // Fill inputs
        urlInput.value = item.url;
        modelSelect.value = item.model;
        formatSelect.value = item.format;

        // Display results
        displaySummary(item.summary, item.format);
        extractedTextBody.textContent = item.raw_text;
        
        resultsPanel.classList.remove('hidden');
        resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast("Restored from history");
    }

    // Format timestamps to human-readable strings
    function formatDate(isoString) {
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);

            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch (e) {
            return '';
        }
    }

    // Simple HTML escaping helper
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Settings Modal Controllers
    const settingsToggleBtn = document.getElementById('settings-toggle-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modeToggleCheckbox = document.getElementById('mode-toggle-checkbox');
    const modeToggleLabel = document.getElementById('mode-toggle-label');
    const styleToggleCheckbox = document.getElementById('style-toggle-checkbox');
    const styleToggleLabel = document.getElementById('style-toggle-label');
    const ollamaHostInput = document.getElementById('ollama-host-input');
    const saveHostBtn = document.getElementById('save-host-btn');
    const hostSaveStatus = document.getElementById('host-save-status');
    const clearHistoryBtnModal = document.getElementById('clear-history-btn-modal');

    // Open Settings Modal
    settingsToggleBtn.addEventListener('click', () => {
        ollamaHostInput.value = localStorage.getItem('ollama_host') || 'http://localhost:11434';
        settingsModal.classList.remove('hidden');
    });

    // Close Settings Modal
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    // Close on click outside modal card
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // Init Theme and Style Configurations
    function initSettings() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
        modeToggleCheckbox.checked = (savedTheme === 'light');

        const savedStyle = localStorage.getItem('theme-style') || 'glass';
        setStyle(savedStyle);
        styleToggleCheckbox.checked = (savedStyle === 'flat');
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        modeToggleLabel.textContent = theme === 'light' ? 'Light' : 'Dark';
    }

    // Toggle Color Mode Handler
    modeToggleCheckbox.addEventListener('change', () => {
        const nextTheme = modeToggleCheckbox.checked ? 'light' : 'dark';
        setTheme(nextTheme);
    });

    function setStyle(style) {
        document.documentElement.setAttribute('data-style', style);
        localStorage.setItem('theme-style', style);
        styleToggleLabel.textContent = style === 'flat' ? 'Flat Design' : 'Glassmorphic';
    }

    // Toggle Style Theme Handler
    styleToggleCheckbox.addEventListener('change', () => {
        const nextStyle = styleToggleCheckbox.checked ? 'flat' : 'glass';
        setStyle(nextStyle);
    });

    // Save Custom Ollama Host URL
    saveHostBtn.addEventListener('click', () => {
        const customHost = ollamaHostInput.value.trim();
        if (customHost) {
            try {
                const url = new URL(customHost);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error("Only http and https protocols are supported");
                }
                localStorage.setItem('ollama_host', customHost);
                
                hostSaveStatus.textContent = "Saved successfully!";
                hostSaveStatus.classList.remove('hidden');
                setTimeout(() => hostSaveStatus.classList.add('hidden'), 3000);
                
                loadModels();
                checkStatus();
            } catch (err) {
                alert("Please enter a valid URL (e.g., http://localhost:11434)");
            }
        } else {
            localStorage.removeItem('ollama_host');
            hostSaveStatus.textContent = "Reset to default!";
            hostSaveStatus.classList.remove('hidden');
            setTimeout(() => hostSaveStatus.classList.add('hidden'), 3000);
            loadModels();
            checkStatus();
        }
    });

    // Clear History inside Modal
    clearHistoryBtnModal.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to clear your entire search history?")) return;
        try {
            const response = await fetch('/api/history', {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast("History cleared");
                loadHistory();
                settingsModal.classList.add('hidden');
            }
        } catch (err) {
            console.error("Failed to clear history:", err);
        }
    });

    // Run status check and model loading on startup
    initSettings();
    checkStatus();
    loadModels();
    loadHistory();
    
    // Poll status periodically (every 15 seconds)
    setInterval(checkStatus, 15000);
});
