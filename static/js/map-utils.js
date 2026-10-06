/* ================================================================
   map-utils.js — Shared map utilities
   Compass (N/S/E/W), FPS + Network overlay, Search bar
   ================================================================ */

/* ── 1. COMPASS ─────────────────────────────────────────────── */
function addCompass(map) {
  const compass = L.control({ position: 'topright' });
  compass.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-compass');
    div.innerHTML = `
      <div class="compass-ring">
        <span class="compass-n">N</span>
        <span class="compass-e">E</span>
        <span class="compass-s">S</span>
        <span class="compass-w">W</span>
        <div class="compass-needle">
          <div class="needle-n"></div>
          <div class="needle-s"></div>
        </div>
        <div class="compass-center"></div>
      </div>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  compass.addTo(map);
}

/* ── 2. FPS + NETWORK OVERLAY ───────────────────────────────── */
function addStatusOverlay(map) {
  const overlay = L.control({ position: 'topleft' });
  overlay.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-status-bar');
    div.innerHTML = `
      <span class="status-item">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span id="fps-val" style="color:#fff;">-- FPS</span>
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">
        <span id="net-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;flex-shrink:0;"></span>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
        <span id="net-val" style="color:#fff;">--</span>
      </span>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  overlay.addTo(map);

  // FPS counter
  let lastTime = performance.now();
  let frames = 0;
  let fps = 0;
  function countFPS() {
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fps = Math.round((frames * 1000) / (now - lastTime));
      frames = 0;
      lastTime = now;
      const el = document.getElementById('fps-val');
      if (el) {
        el.textContent = fps + ' FPS';
        // Keep text white, show quality via a small dot prefix colour instead
        el.style.color = '#fff';
      }
    }
    requestAnimationFrame(countFPS);
  }
  requestAnimationFrame(countFPS);

  // Network info
  function updateNetwork() {
    const el = document.getElementById('net-val');
    const dot = document.getElementById('net-dot');
    if (!el) return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let dotColor = '#1a6b2a';
    if (conn) {
      const type = conn.effectiveType || conn.type || '';
      const dl   = conn.downlink ? conn.downlink.toFixed(1) + ' Mb/s' : '';
      el.textContent = [type.toUpperCase(), dl].filter(Boolean).join(' ') || 'Online';
      dotColor = type === '4g' ? '#4ade80' : type === '3g' ? '#fbbf24' : '#f87171';
    } else {
      el.textContent = navigator.onLine ? 'Online' : 'Offline';
      dotColor = navigator.onLine ? '#4ade80' : '#f87171';
    }
    if (dot) dot.style.background = dotColor;
  }
  updateNetwork();
  window.addEventListener('online',  updateNetwork);
  window.addEventListener('offline', updateNetwork);
  if (navigator.connection) navigator.connection.addEventListener('change', updateNetwork);
}

/* ── 3. SEARCH BAR ──────────────────────────────────────────── */
function initSearch(map, inputId, resultsId) {
  const input   = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  let debounceTimer = null;
  let searchMarker  = null;

  function clearMarker() {
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
  }

  function showResults(items) {
    results.innerHTML = '';
    if (!items.length) {
      results.innerHTML = '<div class="search-no-result">No results found</div>';
      results.classList.add('show');
      return;
    }
    items.forEach(item => {
      const li = document.createElement('div');
      li.className = 'search-result-item';
      const icon = item._type === 'local'
        ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fa4e05" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
        : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      li.innerHTML = `<span class="search-result-icon">${icon}</span>
        <div class="search-result-text">
          <span class="search-result-name">${escHtml(item.display_name_short || item.display_name)}</span>
          ${item.display_name_full ? `<span class="search-result-sub">${escHtml(item.display_name_full)}</span>` : ''}
        </div>`;
      li.addEventListener('click', () => {
        clearMarker();
        input.value = item.display_name_short || item.display_name;
        results.classList.remove('show');
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon !== undefined ? item.lon : item.lng);
        map.setView([lat, lng], 17, { animate: true });
        searchMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            iconSize: [22, 22], iconAnchor: [11, 22],
            html: `<div style="
              width:22px;height:22px;
              background:#fa4e05;border-radius:50% 50% 50% 0;
              transform:rotate(-45deg);border:2.5px solid #fff;
              box-shadow:0 2px 8px rgba(0,0,0,.4);
            "></div>`
          })
        }).addTo(map);
        searchMarker.bindPopup(`<div class="popup-title">${escHtml(item.display_name_short || item.display_name)}</div>`).openPopup();
      });
      results.appendChild(li);
    });
    results.classList.add('show');
  }

  async function doSearch(q) {
    if (q.length < 2) { results.classList.remove('show'); return; }

    // First search local zones + pins
    const localMatches = [];
    if (typeof zones !== 'undefined') {
      zones.forEach(z => {
        if (z.name.toLowerCase().includes(q.toLowerCase())) {
          localMatches.push({
            display_name: z.name,
            display_name_short: z.name,
            lat: z._layer.getBounds().getCenter().lat,
            lon: z._layer.getBounds().getCenter().lng,
            _type: 'local', _zone: z
          });
        }
      });
    }
    if (typeof pins !== 'undefined') {
      pins.forEach(p => {
        if (p.name.toLowerCase().includes(q.toLowerCase())) {
          localMatches.push({
            display_name: p.name,
            display_name_short: p.name,
            lat: p.lat, lon: p.lng,
            _type: 'local'
          });
        }
      });
    }

    // Then Nominatim geocoding
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      const geoMatches = data.map(item => ({
        display_name_short: item.display_name.split(',')[0].trim(),
        display_name_full:  item.display_name,
        display_name:       item.display_name,
        lat: item.lat, lon: item.lon,
        _type: 'geo'
      }));
      showResults([...localMatches, ...geoMatches]);
    } catch {
      showResults(localMatches);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { results.classList.remove('show'); return; }
    debounceTimer = setTimeout(() => doSearch(q), 300);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.classList.remove('show'); input.blur(); }
    if (e.key === 'Enter') {
      const first = results.querySelector('.search-result-item');
      if (first) first.click();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) results.classList.remove('show');
  });
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
