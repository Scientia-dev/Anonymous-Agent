/**
 * ANONYMOUS AGENT - Final Version
 * Clearnet DuckDuckGo integration (no Tor required)
 * Works in any browser and any WebView-based APK
 */

(function () {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const BASE_URL = "https://duckduckgo.com";
  const SEARCH_URL_TEMPLATE = `${BASE_URL}/?q={query}`;
  const SUGGEST_URL_TEMPLATE = `${BASE_URL}/ac/?q={query}&type=list`;

  const MAX_SUGGESTIONS = 8;
  const MIN_QUERY_LENGTH = 2;
  const DEBOUNCE_DELAY = 280;

  // ============================================
  // DOM ELEMENTS
  // ============================================
  const searchInput = document.getElementById('searchInput');
  const suggestionsContainer = document.getElementById('suggestionsList');
  const searchForm = document.getElementById('searchForm');

  if (!searchInput || !suggestionsContainer || !searchForm) {
    console.error('[Anonymous Agent] Required DOM elements not found.');
    return;
  }

  // ============================================
  // STATE
  // ============================================
  let currentSuggestions = [];
  let selectedIndex = -1;
  let activeRequestController = null;
  let debounceTimer = null;
  let isSuggestionsVisible = false;

  // ============================================
  // URL BUILDERS
  // ============================================
  function buildSearchUrl(rawQuery) {
    const q = (rawQuery || '').trim();
    if (!q) return null;
    return SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(q));
  }

  function buildSuggestUrl(rawQuery) {
    const q = (rawQuery || '').trim();
    if (!q) return null;
    return SUGGEST_URL_TEMPLATE.replace('{query}', encodeURIComponent(q));
  }

  // ============================================
  // SEARCH
  // ============================================
  function performSearch(rawQuery) {
    const q = (rawQuery || '').trim();
    if (!q) {
      searchInput.focus();
      return;
    }
    const url = buildSearchUrl(q);
    if (url) {
      window.location.href = url;
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================
  function hideSuggestions() {
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '';
    currentSuggestions = [];
    selectedIndex = -1;
    isSuggestionsVisible = false;
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseSuggestionData(data) {
    if (!data) return [];

    // DuckDuckGo returns: [query, [suggestion1, suggestion2, ...]]
    if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
      return data[1].filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
    }

    // Plain array of strings
    if (Array.isArray(data)) {
      return data
        .map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            return item.phrase || item.suggestion || item.query || '';
          }
          return '';
        })
        .filter(Boolean);
    }

    // { suggestions: [...] }
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return data.suggestions
        .map(item => (typeof item === 'string' ? item : item.phrase || ''))
        .filter(Boolean);
    }

    return [];
  }

  // ============================================
  // RENDERING
  // ============================================
  function renderSuggestions(suggestions, errorMsg = null, isLoading = false) {
    if (isLoading) {
      suggestionsContainer.style.display = 'flex';
      isSuggestionsVisible = true;
      suggestionsContainer.innerHTML =
        '<div class="loading-suggest"><div class="spinner"></div> fetching...</div>';
      return;
    }

    if (errorMsg) {
      suggestionsContainer.style.display = 'flex';
      isSuggestionsVisible = true;
      suggestionsContainer.innerHTML =
        `<div class="suggest-error">⚠️ ${escapeHtml(errorMsg)}</div>`;
      currentSuggestions = [];
      selectedIndex = -1;
      return;
    }

    if (!suggestions || suggestions.length === 0) {
      if (isSuggestionsVisible) hideSuggestions();
      return;
    }

    let html = '';
    suggestions.forEach((text, idx) => {
      const activeClass = idx === selectedIndex ? 'active' : '';
      html += `<div class="suggestion-item ${activeClass}" data-index="${idx}" data-suggestion="${escapeHtml(text)}">
        <span class="suggestion-icon">🔍</span> ${escapeHtml(text)}
      </div>`;
    });

    suggestionsContainer.innerHTML = html;
    suggestionsContainer.style.display = 'flex';
    isSuggestionsVisible = true;

    document.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const suggestion = item.getAttribute('data-suggestion');
        if (suggestion) {
          searchInput.value = suggestion;
          hideSuggestions();
          performSearch(suggestion);
        }
      });
    });
  }

  function updateSelectedSuggestion() {
    const items = document.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === selectedIndex);
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // ============================================
  // FETCH SUGGESTIONS
  // ============================================
  async function fetchSuggestions(query) {
    const q = (query || '').trim();
    if (q.length < MIN_QUERY_LENGTH) {
      hideSuggestions();
      return;
    }

    // Cancel previous request
    if (activeRequestController) {
      activeRequestController.abort();
      activeRequestController = null;
    }

    const controller = new AbortController();
    activeRequestController = controller;

    const url = buildSuggestUrl(q);
    if (!url) return;

    renderSuggestions([], null, true);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawData = await response.json();

      if (controller.signal.aborted) return;

      const suggestions = parseSuggestionData(rawData).slice(0, MAX_SUGGESTIONS);
      currentSuggestions = suggestions;
      selectedIndex = -1;
      renderSuggestions(suggestions);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[Anonymous Agent] Suggestions unavailable:', err);
      renderSuggestions([], 'Suggestions unavailable');
    } finally {
      if (activeRequestController === controller) {
        activeRequestController = null;
      }
    }
  }

  function debouncedSuggest(query) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_DELAY);
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  searchInput.addEventListener('input', e => {
    const query = e.target.value;
    selectedIndex = -1;

    if (query.trim().length < MIN_QUERY_LENGTH) {
      hideSuggestions();
      if (activeRequestController) {
        activeRequestController.abort();
        activeRequestController = null;
      }
      return;
    }

    debouncedSuggest(query);
  });

  searchInput.addEventListener('keydown', e => {
    const visible =
      suggestionsContainer.style.display === 'flex' && currentSuggestions.length > 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!visible) {
        if (searchInput.value.trim().length >= MIN_QUERY_LENGTH) {
          fetchSuggestions(searchInput.value.trim());
        }
        return;
      }
      if (currentSuggestions.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        updateSelectedSuggestion();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible) return;
      if (currentSuggestions.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelectedSuggestion();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (
        visible &&
        selectedIndex >= 0 &&
        selectedIndex < currentSuggestions.length
      ) {
        const chosen = currentSuggestions[selectedIndex];
        searchInput.value = chosen;
        hideSuggestions();
        performSearch(chosen);
      } else {
        hideSuggestions();
        performSearch(searchInput.value);
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
      e.preventDefault();
    }
  });

  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) {
      hideSuggestions();
      performSearch(q);
    }
  });

  document.addEventListener('click', e => {
    const inside =
      suggestionsContainer.contains(e.target) ||
      e.target === searchInput ||
      searchInput.contains(e.target);
    if (!inside && isSuggestionsVisible) {
      hideSuggestions();
    }
  });

  suggestionsContainer.addEventListener('click', e => {
    e.stopPropagation();
  });

  searchInput.addEventListener('focus', () => {
    const q = searchInput.value.trim();
    if (q.length >= MIN_QUERY_LENGTH) {
      debouncedSuggest(q);
    }
  });

  // ============================================
  // INIT
  // ============================================
  hideSuggestions();
})();
