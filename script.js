(function () {
  const BASE_ONION = "https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion";
  const SEARCH_URL_TEMPLATE = `${BASE_ONION}/?q={query}`;
  const SUGGEST_URL_TEMPLATE = `${BASE_ONION}/ac/?q={query}&type=list`;

  const searchInput = document.getElementById('searchInput');
  const suggestionsContainer = document.getElementById('suggestionsList');
  const searchForm = document.getElementById('searchForm');

  let currentSuggestions = [];
  let selectedIndex = -1;
  let activeRequestController = null;
  let debounceTimer = null;
  let isSuggestionsVisible = false;

  function buildSearchUrl(q) {
    if (!q.trim()) return null;
    return SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(q.trim()));
  }
  function buildSuggestUrl(q) {
    if (!q.trim()) return null;
    return SUGGEST_URL_TEMPLATE.replace('{query}', encodeURIComponent(q.trim()));
  }
  function performSearch(q) {
    const t = q.trim();
    if (!t) { searchInput.focus(); return; }
    const url = buildSearchUrl(t);
    if (url) window.location.href = url;
  }
  function hideSuggestions() {
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '';
    currentSuggestions = []; selectedIndex = -1; isSuggestionsVisible = false;
  }
  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }
  function parseSuggestionData(data) {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map(i => typeof i === 'string' ? i : (i && i.phrase) || '').filter(Boolean);
    }
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return data.suggestions.map(i => typeof i === 'string' ? i : (i.phrase || '')).filter(Boolean);
    }
    return [];
  }
  function renderSuggestions(suggestions, errorMsg = null, isLoading = false) {
    if (isLoading) {
      suggestionsContainer.style.display = 'flex';
      isSuggestionsVisible = true;
      suggestionsContainer.innerHTML = `<div class="loading-suggest"><div class="spinner"></div> fetching...</div>`;
      return;
    }
    if (errorMsg) {
      suggestionsContainer.style.display = 'flex';
      isSuggestionsVisible = true;
      suggestionsContainer.innerHTML = `<div class="suggest-error">⚠️ ${errorMsg}</div>`;
      currentSuggestions = []; selectedIndex = -1;
      return;
    }
    if (!suggestions || suggestions.length === 0) {
      if (isSuggestionsVisible) hideSuggestions();
      return;
    }
    let html = '';
    suggestions.forEach((text, idx) => {
      const cls = (idx === selectedIndex) ? 'active' : '';
      html += `<div class="suggestion-item ${cls}" data-index="${idx}" data-suggestion="${escapeHtml(text)}">
        <span class="suggestion-icon">🔍</span> ${escapeHtml(text)}
      </div>`;
    });
    suggestionsContainer.innerHTML = html;
    suggestionsContainer.style.display = 'flex';
    isSuggestionsVisible = true;
    document.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const s = item.getAttribute('data-suggestion');
        if (s) { searchInput.value = s; hideSuggestions(); performSearch(s); }
      });
    });
  }
  async function fetchSuggestions(query) {
    if (!query || query.trim().length < 2) { hideSuggestions(); return; }
    if (activeRequestController) activeRequestController.abort();
    const controller = new AbortController();
    activeRequestController = controller;
    const url = buildSuggestUrl(query);
    if (!url) return;
    renderSuggestions([], null, true);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (controller.signal.aborted) return;
      const limited = parseSuggestionData(raw).slice(0, 8);
      currentSuggestions = limited;
      selectedIndex = -1;
      renderSuggestions(limited);
    } catch (err) {
      if (err.name === 'AbortError') return;
      renderSuggestions([], 'Suggestions unavailable');
    } finally {
      if (activeRequestController === controller) activeRequestController = null;
    }
  }
  function debouncedSuggest(q) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(q), 280);
  }

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value;
    selectedIndex = -1;
    if (!q || q.trim().length < 2) {
      hideSuggestions();
      if (activeRequestController) { activeRequestController.abort(); activeRequestController = null; }
      return;
    }
    debouncedSuggest(q);
  });

  searchInput.addEventListener('keydown', (e) => {
    const visible = suggestionsContainer.style.display === 'flex' && currentSuggestions.length > 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!visible) { if (searchInput.value.trim().length >= 2) fetchSuggestions(searchInput.value.trim()); return; }
      if (currentSuggestions.length) { selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1); updateSelected(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible) return;
      if (currentSuggestions.length) { selectedIndex = Math.max(selectedIndex - 1, -1); updateSelected(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible && selectedIndex >= 0 && selectedIndex < currentSuggestions.length) {
        const chosen = currentSuggestions[selectedIndex];
        searchInput.value = chosen; hideSuggestions(); performSearch(chosen);
      } else { hideSuggestions(); performSearch(searchInput.value); }
    } else if (e.key === 'Escape') {
      hideSuggestions(); e.preventDefault();
    }
  });

  function updateSelected() {
    document.querySelectorAll('.suggestion-item').forEach((el, i) => {
      el.classList.toggle('active', i === selectedIndex);
    });
    const items = document.querySelectorAll('.suggestion-item');
    if (selectedIndex >= 0 && items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) { hideSuggestions(); performSearch(q); }
  });
  document.addEventListener('click', (e) => {
    const inside = suggestionsContainer.contains(e.target) || e.target === searchInput;
    if (!inside && isSuggestionsVisible) hideSuggestions();
  });
  suggestionsContainer.addEventListener('click', (e) => e.stopPropagation());
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) debouncedSuggest(searchInput.value.trim());
  });

  hideSuggestions();
})();
