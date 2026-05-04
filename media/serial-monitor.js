try {
        const vscode = acquireVsCodeApi();
        // IMPORTANT: Fire ready IMMEDIATELY so host knows this script is alive.
        // Must be before any complex logic that could throw.
        vscode.postMessage({ command: 'ready' });
        vscode.postMessage({ command: 'requestStatus' });

        const logContent = document.getElementById('logContent');
        const logContainer = document.getElementById('logContainer');
        const welcome = document.getElementById('welcome');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const btnConnect = document.getElementById('btnConnect');
        const btnDisconnect = document.getElementById('btnDisconnect');
        const btnPause = document.getElementById('btnPause');
        const btnAutoScroll = document.getElementById('btnAutoScroll');
        const pausedIndicator = document.getElementById('pausedIndicator');
        const inputBar = document.getElementById('inputBar');
        const searchInput = document.getElementById('searchInput');
        const searchCountEl = document.getElementById('searchCount');
        const filterCountEl = document.getElementById('filterCount');
        const dataCounterEl = document.getElementById('dataCounter');

        let autoScroll = true;
        let paused = false;
        let lineCount = 0;
        let searchMatches = [];
        let currentSearchIndex = -1;
        let showTimestamp = false;
        let maxBufferBytes = window.__maxBufferBytes || 2097152;
        let displayedBufferBytes = 0;

        function getLineByteSize(text) {
            return new TextEncoder().encode(text + '\n').length;
        }

        // ---- Filter system ----
        const DEFAULT_FILTER_COLORS = [
            '#4ec9b0', '#569cd6', '#ce9178', '#c586c0',
            '#dcdcaa', '#d7ba7d', '#9cdcfe', '#b5cea8'
        ];
        let filters = [];
        let filterId = 0;
        let filterOnly = false;

        function toggleFilterMode() {
            filterOnly = document.getElementById('chkFilterOnly').checked;
            applyFiltersToExisting();
        }

        function addFilter() {
            const id = filterId++;
            const color = DEFAULT_FILTER_COLORS[filters.length % DEFAULT_FILTER_COLORS.length];
            filters.push({ id, text: '', color, enabled: true });
            renderFilterEntry(id, color);
            applyFiltersToExisting();
        }

        function renderFilterEntry(id, color) {
            const container = document.getElementById('filterEntries');
            const entry = document.createElement('div');
            entry.className = 'filter-entry';
            entry.id = 'filter-' + id;

            const chk = document.createElement('input');
            chk.type = 'checkbox'; chk.checked = true; chk.title = 'Enable/Disable';
            chk.onchange = () => { const f = filters.find(f => f.id === id); if (f) { f.enabled = chk.checked; entry.classList.toggle('disabled', !f.enabled); applyFiltersToExisting(); } };

            const input = document.createElement('input');
            input.type = 'text'; input.placeholder = 'keyword...';
            input.oninput = () => { const f = filters.find(f => f.id === id); if (f) { f.text = input.value; applyFiltersToExisting(); } };

            const colorPicker = document.createElement('input');
            colorPicker.type = 'color'; colorPicker.value = color; colorPicker.title = 'Set highlight color';
            colorPicker.oninput = () => { const f = filters.find(f => f.id === id); if (f) { f.color = colorPicker.value; applyFiltersToExisting(); } };

            const removeBtn = document.createElement('button');
            removeBtn.className = 'filter-remove'; removeBtn.innerHTML = '&times;'; removeBtn.title = 'Remove filter';
            removeBtn.onclick = () => { filters = filters.filter(f => f.id !== id); entry.remove(); applyFiltersToExisting(); };

            entry.appendChild(chk); entry.appendChild(input); entry.appendChild(colorPicker); entry.appendChild(removeBtn);
            container.appendChild(entry);
            input.focus();
        }

        function clearFilters() {
            filters = [];
            document.getElementById('filterEntries').innerHTML = '';
            applyFiltersToExisting();
        }

        function getActiveFilters() { return filters.filter(f => f.enabled && f.text.trim().length > 0); }

        function matchFilters(text) {
            const active = getActiveFilters();
            if (active.length === 0) return [];
            return active.filter(f => text.toLowerCase().includes(f.text.toLowerCase()));
        }

        function applyFiltersToExisting() {
            const active = getActiveFilters();
            const allLines = logContent.querySelectorAll('.log-line');
            let visibleCount = 0;

            for (const line of allLines) {
                const dataSpan = line.querySelector('.data');
                if (!dataSpan) continue;
                const text = dataSpan.textContent || '';

                if (active.length === 0) {
                    line.style.display = ''; dataSpan.style.color = ''; dataSpan.style.background = '';
                    dataSpan.style.borderRadius = ''; dataSpan.style.padding = ''; visibleCount++; continue;
                }

                const matched = matchFilters(text);
                if (matched.length > 0) {
                    line.style.display = ''; dataSpan.style.color = matched[0].color;
                    dataSpan.style.background = hexToRgba(matched[0].color, 0.12);
                    dataSpan.style.borderRadius = '2px'; dataSpan.style.padding = '0 2px'; visibleCount++;
                } else if (filterOnly) {
                    line.style.display = 'none';
                } else {
                    line.style.display = ''; dataSpan.style.color = ''; dataSpan.style.background = '';
                    dataSpan.style.borderRadius = ''; dataSpan.style.padding = ''; visibleCount++;
                }
            }

            filterCountEl.textContent = active.length > 0 ? visibleCount + '/' + allLines.length : String(allLines.length);
        }

        function hexToRgba(hex, alpha) {
            return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + alpha + ')';
        }

        // ---- Message handling ----
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'log': appendLines(msg.lines); break;
                case 'snapshot': doClear(); appendLines(msg.lines); break;
                case 'clear': doClear(); break;
                case 'status': updateStatus(msg.connected, msg.info); break;
                case 'debug': if (dataCounterEl) { dataCounterEl.textContent = msg.text; } break;
            }
        });

        function appendLines(lines) {
            if (welcome) { welcome.style.display = 'none'; }
            if (paused) return;

            const active = getActiveFilters();
            const frag = document.createDocumentFragment();
            for (const text of lines) {
                const div = document.createElement('div');
                div.className = 'log-line';
                const lineByteSize = getLineByteSize(text);
                div.setAttribute('data-bytes', String(lineByteSize));

                if (showTimestamp) {
                    const now = new Date();
                    const ts = String(now.getHours()).padStart(2, '0') + ':' +
                               String(now.getMinutes()).padStart(2, '0') + ':' +
                               String(now.getSeconds()).padStart(2, '0') + '.' +
                               String(now.getMilliseconds()).padStart(3, '0');
                    const tsSpan = document.createElement('span');
                    tsSpan.className = 'timestamp'; tsSpan.textContent = '[' + ts + '] ';
                    div.appendChild(tsSpan);
                }

                const dataSpan = document.createElement('span');
                dataSpan.className = 'data'; dataSpan.textContent = text;

                if (active.length > 0) {
                    const matched = matchFilters(text);
                    if (matched.length > 0) {
                        dataSpan.style.color = matched[0].color;
                        dataSpan.style.background = hexToRgba(matched[0].color, 0.12);
                        dataSpan.style.borderRadius = '2px'; dataSpan.style.padding = '0 2px';
                    } else if (filterOnly) { div.style.display = 'none'; }
                }

                div.appendChild(dataSpan);
                frag.appendChild(div);
                lineCount++;
                displayedBufferBytes += lineByteSize;
            }

            logContent.appendChild(frag);

            while (displayedBufferBytes > maxBufferBytes && logContent.firstChild) {
                if (logContent.firstChild === welcome) {
                    if (logContent.children.length <= 1) break;
                    const firstLine = logContent.children[1];
                    displayedBufferBytes -= Number(firstLine?.getAttribute('data-bytes') || '0');
                    logContent.removeChild(firstLine);
                } else {
                    const firstNode = logContent.firstChild;
                    displayedBufferBytes -= Number(firstNode?.getAttribute?.('data-bytes') || '0');
                    logContent.removeChild(firstNode);
                }
                lineCount--;
            }

            if (autoScroll) { logContent.scrollTop = logContent.scrollHeight; }
            if (dataCounterEl) { dataCounterEl.textContent = lineCount; }
        }

        function doClear() {
            logContent.innerHTML = '';
            displayedBufferBytes = 0;
            if (welcome) { logContent.appendChild(welcome); welcome.style.display = ''; }
            lineCount = 0; searchMatches = []; currentSearchIndex = -1;
            searchCountEl.textContent = ''; filterCountEl.textContent = '';
            if (dataCounterEl) { dataCounterEl.textContent = '0'; }
        }

        function clearLog() { vscode.postMessage({ command: 'clear' }); doClear(); }
        function copyLog() { vscode.postMessage({ command: 'copy' }); }
        function saveLog() { vscode.postMessage({ command: 'save' }); }

        function updateStatus(connected, info) {
            if (connected) {
                statusDot.classList.add('connected'); statusText.textContent = info || 'Connected';
                btnConnect.classList.add('hidden'); btnDisconnect.classList.remove('hidden');
            } else {
                statusDot.classList.remove('connected'); statusText.textContent = info || 'Disconnected';
                btnConnect.classList.remove('hidden'); btnDisconnect.classList.add('hidden');
            }
        }

        function handleConnect() { vscode.postMessage({ command: 'connect' }); }
        function handleDisconnect() { vscode.postMessage({ command: 'disconnect' }); }

        function togglePause() {
            paused = !paused;
            if (paused) { btnPause.textContent = '▶ Resume'; pausedIndicator.classList.add('visible'); }
            else { btnPause.textContent = '⏸ Pause'; pausedIndicator.classList.remove('visible'); if (autoScroll) logContent.scrollTop = logContent.scrollHeight; }
        }

        function toggleAutoScroll() {
            autoScroll = !autoScroll;
            btnAutoScroll.textContent = autoScroll ? '⬇ Auto-scroll: ON' : '⬇ Auto-scroll: OFF';
            if (autoScroll) { logContent.scrollTop = logContent.scrollHeight; }
        }

        function toggleTimestamp() { showTimestamp = document.getElementById('chkTimestamp').checked; }

        function toggleInput() {
            inputBar.classList.toggle('visible');
            if (inputBar.classList.contains('visible')) { document.getElementById('sendInput').focus(); }
        }

        function sendData() {
            const input = document.getElementById('sendInput');
            const hexMode = document.getElementById('hexMode');
            const text = input.value;
            if (text) { vscode.postMessage({ command: 'send', text, hex: hexMode.checked }); input.value = ''; }
        }

        // ---- Search ----
        let searchDebounce = undefined;
        function onSearchInput() { clearTimeout(searchDebounce); searchDebounce = setTimeout(performSearch, 200); }

        function performSearch() {
            const query = searchInput.value.trim().toLowerCase();
            document.querySelectorAll('.search-match').forEach(el => {
                const parent = el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent), el);
                parent.normalize();
            });
            searchMatches = []; currentSearchIndex = -1; searchCountEl.textContent = '';
            if (!query) return;

            const dataSpans = logContent.querySelectorAll('.data');
            for (const span of dataSpans) {
                const text = span.textContent || '';
                const lowerText = text.toLowerCase();
                const parts = [];
                let lastIndex = 0;
                let matchIdx;
                while ((matchIdx = lowerText.indexOf(query, lastIndex)) !== -1) {
                    parts.push({ start: matchIdx, end: matchIdx + query.length });
                    lastIndex = matchIdx + 1;
                }
                if (parts.length > 0) {
                    const fragment = document.createDocumentFragment();
                    let pos = 0;
                    for (const part of parts) {
                        if (part.start > pos) { fragment.appendChild(document.createTextNode(text.slice(pos, part.start))); }
                        const mark = document.createElement('span');
                        mark.className = 'search-match'; mark.textContent = text.slice(part.start, part.end);
                        fragment.appendChild(mark); searchMatches.push(mark); pos = part.end;
                    }
                    if (pos < text.length) { fragment.appendChild(document.createTextNode(text.slice(pos))); }
                    span.textContent = ''; span.appendChild(fragment);
                }
            }
            searchCountEl.textContent = searchMatches.length > 0 ? '0/' + searchMatches.length : 'No results';
            if (searchMatches.length > 0) { navigateSearch(0); }
        }

        function navigateSearch(index) {
            if (searchMatches.length === 0) return;
            if (currentSearchIndex >= 0 && currentSearchIndex < searchMatches.length) { searchMatches[currentSearchIndex].classList.remove('active'); }
            currentSearchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
            searchMatches[currentSearchIndex].classList.add('active');
            searchMatches[currentSearchIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
            searchCountEl.textContent = (currentSearchIndex + 1) + '/' + searchMatches.length;
        }

        function searchNext() { navigateSearch(currentSearchIndex + 1); }
        function searchPrev() { navigateSearch(currentSearchIndex - 1); }

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.shiftKey ? searchPrev() : searchNext(); }
            if (e.key === 'Escape') { searchInput.value = ''; performSearch(); searchInput.blur(); }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
        });

        } catch (e) {
            document.body.innerHTML = '<div style="padding:20px;color:#f44747;font-family:monospace;white-space:pre-wrap;">'
                + 'WebView script error:\\n' + (e && e.stack || String(e)) + '</div>';
            try { const _vs = acquireVsCodeApi(); _vs.postMessage({ command: 'ready' }); _vs.postMessage({ command: 'requestStatus' }); } catch (_) {}
        }
    