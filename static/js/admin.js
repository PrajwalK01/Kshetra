/* ================================================================
   admin.js  —  Kshetra Admin Dashboard
   Mobile-first, Firestore-backed Flask API
   ================================================================ */

'use strict';

const ZONE_COLORS = [
  /* Reds */
  '#c0392b','#e74c3c','#ff6b6b','#ff8a80','#ff5252','#d32f2f','#b71c1c','#ff1744',
  /* Pinks */
  '#e91e63','#f06292','#f48fb1','#ff4081','#c2185b','#880e4f','#ff80ab','#ec407a',
  /* Purples */
  '#9b59b6','#8e24aa','#7b1fa2','#6a1b9a','#ab47bc','#ce93d8','#7c4dff','#651fff',
  /* Deep purples */
  '#673ab7','#512da8','#4527a0','#311b92','#b39ddb','#9575cd','#d500f9','#aa00ff',
  /* Indigos / Blues */
  '#3f51b5','#283593','#1a237e','#5c6bc0','#3949ab','#1565c0','#0d47a1','#2962ff',
  '#2196f3','#1976d2','#1e88e5','#42a5f5','#90caf9','#0277bd','#01579b','#0091ea',
  /* Cyans / Teals */
  '#00bcd4','#0097a7','#00838f','#006064','#4dd0e1','#00acc1','#26c6da','#00e5ff',
  '#009688','#00796b','#00695c','#004d40','#4db6ac','#26a69a','#80cbc4','#1de9b6',
  /* Greens */
  '#1a7f5a','#27ae72','#2ecc71','#43a047','#388e3c','#2e7d32','#1b5e20','#00c853',
  '#66bb6a','#a5d6a7','#8bc34a','#7cb342','#558b2f','#33691e','#76ff03','#64dd17',
  /* Yellow-greens / Limes */
  '#cddc39','#c0ca33','#afb42b','#827717','#d4e157','#9e9d24','#f9a825','#f57f17',
  /* Yellows / Ambers */
  '#f1c40f','#f9a825','#ff8f00','#ff6f00','#ffca28','#ffb300','#ffd54f','#ffe082',
  /* Oranges */
  '#e67e22','#ef6c00','#e65100','#ff6d00','#ffa726','#fb8c00','#ff9800','#ff5722',
  /* Browns */
  '#795548','#6d4c41','#5d4037','#4e342e','#3e2723','#a1887f','#8d6e63','#bcaaa4',
  /* Greys / Neutrals */
  '#607d8b','#546e7a','#455a64','#37474f','#263238','#90a4ae','#b0bec5','#78909c',
  '#9e9e9e','#757575','#616161','#424242','#212121','#bdbdbd','#e0e0e0','#eeeeee',
];
const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress:  'In progress',
  done:         'Done'
};

/* ── Map ─────────────────────────────────────────────────────── */
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  tap: true,
  tapTolerance: 15
}).setView([12.9716, 77.5946], 13);

// High-res tile layer — OpenStreetMap with retina support (no API key needed)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  detectRetina: true
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);

/* ── State ───────────────────────────────────────────────────── */
let mode            = 'zone';
let zones           = [];
let pins            = [];
let pendingCoords   = null;
let pendingLatLng   = null;
let pendingType     = null;
let selectedColor   = ZONE_COLORS[0];
let polygonDrawer   = null;
let pinClickHandler = null;
let locationMarker  = null;
let locationCircle  = null;
let selectedRole    = 'member';

/* ── API helper ──────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign(
    { headers: { 'Content-Type': 'application/json' } }, opts
  ));
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

/* ── Hint toast ──────────────────────────────────────────────── */
const hintEl = document.getElementById('hint');
let hintTimer = null;
function showHint(msg, duration = 6000) {
  hintEl.textContent = msg;
  hintEl.style.display = 'block';
  clearTimeout(hintTimer);
  if (duration > 0) hintTimer = setTimeout(hideHint, duration);
}
function hideHint() {
  hintEl.style.display = 'none';
}

/* ── Live Location ───────────────────────────────────────────── */
function showLocDeniedCard() {
  // Remove any existing card
  const existing = document.getElementById('loc-denied-card');
  if (existing) existing.remove();

  const isHTTP = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';

  const card = document.createElement('div');
  card.id = 'loc-denied-card';
  card.innerHTML = isHTTP ? `
    <div class="loc-card-icon">📍</div>
    <div class="loc-card-title">Location blocked</div>
    <div class="loc-card-body">
      Chrome blocks GPS on <b>http://</b> for non-localhost addresses.<br>
      To fix this, open Chrome settings for this site:
    </div>
    <div class="loc-card-steps">
      <div>1. Click the <b>🔒 / ⚠️ icon</b> in the address bar</div>
      <div>2. Tap <b>Site settings</b></div>
      <div>3. Set <b>Location → Allow</b></div>
      <div>4. Refresh the page</div>
    </div>
    <button class="loc-card-close" onclick="this.closest('#loc-denied-card').remove()">Got it</button>
  ` : `
    <div class="loc-card-icon">📍</div>
    <div class="loc-card-title">Allow location</div>
    <div class="loc-card-body">Location permission was denied. Please allow it to see your position on the map.</div>
    <button class="loc-card-btn" onclick="document.getElementById('loc-denied-card').remove(); requestLocation();">Try again</button>
    <button class="loc-card-close" onclick="this.closest('#loc-denied-card').remove()">Dismiss</button>
  `;

  document.getElementById('map-wrap').appendChild(card);
}

let _locWatchId = null;

function placeLocationMarker(lat, lng, accuracy) {
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationCircle)  map.removeLayer(locationCircle);

  locationCircle = L.circle([lat, lng], {
    radius: Math.min(accuracy, 500),
    color: '#1a7f5a', fillColor: '#1a7f5a',
    fillOpacity: 0.10, weight: 1.5, dashArray: '5 5'
  }).addTo(map);

  locationMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      html: `<div class="loc-dot"></div>`
    })
  }).addTo(map);

  locationMarker.bindPopup('<div class="popup-title">📍 You are here</div>');
}

function requestLocation() {
  if (!navigator.geolocation) {
    showHint('Geolocation not supported on this device.', 4000);
    return;
  }

  // Remove any existing denied card
  const existing = document.getElementById('loc-denied-card');
  if (existing) existing.remove();

  showHint(' Getting your location…', 0);

  // Cancel any previous watch
  if (_locWatchId !== null) {
    navigator.geolocation.clearWatch(_locWatchId);
    _locWatchId = null;
  }

  const ACCURACY_THRESHOLD = 100; // metres — stop once we reach this accuracy
  const GIVE_UP_AFTER      = 20000; // ms — accept best result after 20 s

  let bestAccuracy = Infinity;
  let gaveUp = false;

  const giveUpTimer = setTimeout(() => {
    gaveUp = true;
    if (_locWatchId !== null) {
      navigator.geolocation.clearWatch(_locWatchId);
      _locWatchId = null;
    }
    hideHint();
  }, GIVE_UP_AFTER);

  _locWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;

      placeLocationMarker(lat, lng, accuracy);

      // Pan to location and update hint as accuracy improves
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        map.setView([lat, lng], 16, { animate: true });
        if (accuracy > ACCURACY_THRESHOLD) {
          showHint(`📡 Improving accuracy… (±${Math.round(accuracy)} m)`, 0);
        }
      }

      // Stop watching once accurate enough
      if (accuracy <= ACCURACY_THRESHOLD && !gaveUp) {
        clearTimeout(giveUpTimer);
        navigator.geolocation.clearWatch(_locWatchId);
        _locWatchId = null;
        hideHint();
      }
    },
    err => {
      clearTimeout(giveUpTimer);
      hideHint();
      if (err.code === 1) {
        // Permission denied — show card
        showLocDeniedCard();
      } else {
        const msgs = {
          2: 'Location unavailable. Try again.',
          3: 'Location request timed out.'
        };
        showHint('⚠️ ' + (msgs[err.code] || err.message), 5000);
      }
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

document.getElementById('loc-btn').addEventListener('click', () => {
  if (locationMarker) {
    map.setView(locationMarker.getLatLng(), 17, { animate: true });
    locationMarker.openPopup();
  } else {
    requestLocation();
  }
});

// Auto-attempt location on load
window.addEventListener('load', () => {
  setTimeout(requestLocation, 800);
});

/* ── Tool Mode ───────────────────────────────────────────────── */
function setMode(m) {
  mode = m;
  document.getElementById('btn-none').classList.toggle('active', m === 'none');
  document.getElementById('btn-zone').classList.toggle('active', m === 'zone');
  document.getElementById('btn-pin').classList.toggle('active',  m === 'pin');

  // Always cancel any in-progress drawing and pin click first
  if (polygonDrawer) { polygonDrawer.disable(); polygonDrawer = null; }
  disablePinClick();

  if (m === 'zone') {
    startPolygonDraw();
    showHint('Tap points to trace a zone — double-tap to finish', 8000);
  } else if (m === 'pin') {
    enablePinClick();
    showHint('Tap anywhere on the map to drop a pin', 5000);
  } else {
    // none — just cancel everything, no hint needed
    hideHint();
  }
}

function startPolygonDraw() {
  if (polygonDrawer) { polygonDrawer.disable(); polygonDrawer = null; }

  // Safety check — leaflet.draw loaded correctly
  if (!L.Draw || !L.Draw.Polygon) {
    showHint('⚠️ Draw tools failed to load. Please refresh.', 5000);
    return;
  }

  polygonDrawer = new L.Draw.Polygon(map, {
    shapeOptions: {
      color: selectedColor,
      fillColor: selectedColor,
      weight: 2.5,
      fillOpacity: 0.22
    },
    showArea: false,
    allowIntersection: false
  });
  polygonDrawer.enable();
}

map.on(L.Draw.Event.CREATED, e => {
  if (e.layerType === 'polygon') {
    const rawLls = e.layer.getLatLngs();
    // getLatLngs returns array of arrays for polygons
    const lls = Array.isArray(rawLls[0]) ? rawLls[0] : rawLls;
    if (lls.length < 3) { showHint('Need at least 3 points for a zone.', 3000); return; }
    pendingCoords = lls.map(ll => [ll.lat, ll.lng]);
    pendingType   = 'zone';
    openModal('zone');
  }
});

function enablePinClick() {
  pinClickHandler = e => {
    pendingLatLng = e.latlng;
    pendingType   = 'pin';
    openModal('pin');
  };
  map.on('click', pinClickHandler);
}

function disablePinClick() {
  if (pinClickHandler) {
    map.off('click', pinClickHandler);
    pinClickHandler = null;
  }
}

document.getElementById('btn-none').addEventListener('click', () => setMode('none'));
document.getElementById('btn-zone').addEventListener('click', () => setMode('zone'));
document.getElementById('btn-pin').addEventListener('click',  () => setMode('pin'));

/* ── Modal ───────────────────────────────────────────────────── */
const backdrop          = document.getElementById('modal-backdrop');
const inputName         = document.getElementById('input-name');
const inputDesc         = document.getElementById('input-desc');
const inputTiming       = document.getElementById('input-timing');
const inputContact      = document.getElementById('input-contact');
const colorBlock        = document.getElementById('color-block');
const colorGrid         = document.getElementById('color-grid');
const pinColorBlock     = document.getElementById('pin-color-block');
const pinColorGrid      = document.getElementById('pin-color-grid');
const modalHeading      = document.getElementById('modal-heading');
const modalSub          = document.getElementById('modal-sub');
const colorPreviewLabel = document.getElementById('color-preview-label');

// Zone colour grid (120 colours)
colorGrid.innerHTML = ZONE_COLORS.map((c, i) =>
  `<button type="button" class="swatch-btn${i === 0 ? ' selected' : ''}"
     style="background:${c}" data-color="${c}" title="${c}" aria-label="${c}"></button>`
).join('');
colorGrid.querySelectorAll('.swatch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedColor = btn.dataset.color;
    colorGrid.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    colorPreviewLabel.textContent = selectedColor;
    colorPreviewLabel.style.color = selectedColor;
  });
});

// Pin colour palette
const PIN_COLORS = [
  '#d4712a','#e74c3c','#c0392b','#e91e63','#9b59b6',
  '#3f51b5','#2196f3','#00bcd4','#009688','#1a7f5a',
  '#27ae60','#8bc34a','#f1c40f','#ff9800','#ff5722',
  '#795548','#607d8b','#212121','#ffffff','#000000'
];
let selectedPinColor = PIN_COLORS[0];
pinColorGrid.innerHTML = PIN_COLORS.map((c, i) =>
  `<button type="button" class="pin-color-btn${i === 0 ? ' selected' : ''}"
     style="background:${c};width:30px;height:30px;border-radius:50%;border:3px solid ${i === 0 ? '#000' : 'transparent'};transition:all .15s;cursor:pointer;"
     data-color="${c}" aria-label="${c}"></button>`
).join('');
pinColorGrid.querySelectorAll('.pin-color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedPinColor = btn.dataset.color;
    pinColorGrid.querySelectorAll('.pin-color-btn').forEach(b => {
      b.style.borderColor = 'transparent';
      b.style.transform = 'scale(1)';
    });
    btn.style.borderColor = '#000';
    btn.style.transform = 'scale(1.25)';
  });
});

function openModal(type) {
  inputName.value    = '';
  inputDesc.value    = '';
  inputTiming.value  = '';
  inputContact.value = '';

  if (type === 'zone') {
    modalHeading.textContent  = 'New Zone';
    modalSub.textContent      = 'Fill in the zone details.';
    colorBlock.style.display  = '';
    pinColorBlock.style.display = 'none';
  } else {
    modalHeading.textContent  = 'New Pin';
    modalSub.textContent      = 'Fill in the pin details.';
    colorBlock.style.display  = 'none';
    pinColorBlock.style.display = '';
  }
  backdrop.style.display = 'flex';
  setTimeout(() => inputName.focus(), 80);
}

function closeModal() {
  backdrop.style.display = 'none';
  pendingCoords = pendingLatLng = pendingType = null;
}

document.getElementById('modal-cancel').addEventListener('click', closeModal);
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

// Allow Enter key to save
document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('modal-save').click();
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const name    = inputName.value.trim();
  const desc    = inputDesc.value.trim();
  const timing  = inputTiming.value.trim();
  const contact = inputContact.value.trim();
  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  try {
    if (pendingType === 'zone') {
      const z = await api('/api/zones', {
        method: 'POST',
        body: JSON.stringify({
          name:        name || 'Untitled Zone',
          team:        '',
          color:       selectedColor,
          coords:      pendingCoords,
          description: desc,
          timing:      timing,
          contact:     contact,
        })
      });
      addZoneToMap(z);
      renderZoneList();
    } else {
      const p = await api('/api/pins', {
        method: 'POST',
        body: JSON.stringify({
          name:        name || 'Untitled Pin',
          lat:         pendingLatLng.lat,
          lng:         pendingLatLng.lng,
          color:       selectedPinColor,
          description: desc,
          timing:      timing,
          contact:     contact,
        })
      });
      addPinToMap(p);
      renderPinList();
    }
    closeModal();
    if (mode === 'zone') startPolygonDraw();
  } catch (err) {
    alert(err.message);
  }
  saveBtn.disabled = false;
});

/* ── Map rendering ───────────────────────────────────────────── */
function popupForZone(z) {
  const rows = [];
  if (z.description) rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${esc(z.description)}</div>`);
  if (z.timing)      rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${esc(z.timing)}</div>`);
  if (z.contact)     rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.44-.44a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 18z"/></svg> <a href="tel:${esc(z.contact)}" style="color:var(--accent);font-weight:600;">${esc(z.contact)}</a></div>`);
  return `<div class="popup-title">${esc(z.name)}</div>${rows.join('')}`;
}

function popupForPin(p) {
  const rows = [];
  if (p.description) rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${esc(p.description)}</div>`);
  if (p.timing)      rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${esc(p.timing)}</div>`);
  if (p.contact)     rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.44-.44a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 18z"/></svg> <a href="tel:${esc(p.contact)}" style="color:var(--accent);font-weight:600;">${esc(p.contact)}</a></div>`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  rows.push(`<a href="${navUrl}" target="_blank" rel="noopener" class="popup-nav-btn">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
    Navigate
  </a>`);
  return `<div class="popup-title">${esc(p.name)}</div>${rows.join('')}`;
}

function addZoneToMap(z) {
  const latlngs = z.coords.map(c => L.latLng(c[0], c[1]));
  const layer = L.polygon(latlngs, {
    color: z.color, fillColor: z.color, fillOpacity: 0.22, weight: 2.5
  }).addTo(drawnItems);
  layer.bindPopup(popupForZone(z), { maxWidth: 260 });
  layer.on('click', () => layer.openPopup());
  z._layer = layer;
  zones.push(z);
}

function addPinToMap(p) {
  const color = p.color || '#d4712a';
  const marker = L.marker([p.lat, p.lng], {
    icon: L.divIcon({
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div style="
        width:22px;height:22px;border-radius:50%;
        background:${color};
        border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,.4);
        transition:transform .15s;
        cursor:pointer;
      " class="pin-marker-dot"></div>`
    })
  }).addTo(map);
  marker.bindPopup(popupForPin(p), { maxWidth: 260 });
  marker.on('click', () => marker.openPopup());
  p._marker = marker;
  pins.push(p);
}

/* ── Sidebar lists ───────────────────────────────────────────── */
function renderZoneList() {
  const el = document.getElementById('zone-list');
  document.getElementById('zone-count').textContent = zones.length;

  if (!zones.length) {
    el.innerHTML = `<div class="empty-state">No zones yet.<br>Tap <b>Zone</b> on the map to draw one.</div>`;
    return;
  }

  el.innerHTML = zones.map(z => `
    <div class="zone-item" data-zone="${z.id}">
      <div class="zone-swatch" style="background:${z.color};"></div>
      <div class="zone-body">
        <p class="zone-name">${esc(z.name)}</p>
      </div>
      <button class="del-btn" data-del-zone="${z.id}" aria-label="Delete zone">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>`).join('');

  el.querySelectorAll('[data-zone]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-del-zone]')) return;
      const z = zones.find(z => z.id === item.dataset.zone);
      if (z) {
        map.fitBounds(z._layer.getBounds(), { padding: [60, 60] });
        z._layer.openPopup();
        closeSidebar();
      }
    });
  });

  el.querySelectorAll('[data-del-zone]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this zone?')) return;
      try {
        await api('/api/zones/' + btn.dataset.delZone, { method: 'DELETE' });
        const z = zones.find(z => z.id === btn.dataset.delZone);
        if (z) drawnItems.removeLayer(z._layer);
        zones = zones.filter(z => z.id !== btn.dataset.delZone);
        renderZoneList();
      } catch (err) { alert(err.message); }
    });
  });
}

function renderPinList() {
  const el = document.getElementById('pin-list');
  document.getElementById('pin-count').textContent = pins.length;

  if (!pins.length) {
    el.innerHTML = `<div class="empty-state">No pins yet.<br>Tap <b>Pin</b> on the map to drop one.</div>`;
    return;
  }

  el.innerHTML = pins.map(p => `
    <div class="pin-item" data-pin="${p.id}">
      <div class="pin-dot"></div>
      <span class="pin-name">${esc(p.name)}</span>
      <button class="del-btn" data-del-pin="${p.id}" aria-label="Delete pin">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`).join('');

  el.querySelectorAll('[data-pin]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-del-pin]')) return;
      const p = pins.find(p => p.id === item.dataset.pin);
      if (p) {
        map.setView(p._marker.getLatLng(), 17);
        p._marker.openPopup();
        closeSidebar();
      }
    });
  });

  el.querySelectorAll('[data-del-pin]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this pin?')) return;
      try {
        await api('/api/pins/' + btn.dataset.delPin, { method: 'DELETE' });
        const p = pins.find(p => p.id === btn.dataset.delPin);
        if (p) map.removeLayer(p._marker);
        pins = pins.filter(p => p.id !== btn.dataset.delPin);
        renderPinList();
      } catch (err) { alert(err.message); }
    });
  });
}

/* ── Members ─────────────────────────────────────────────────── */
async function loadMembers() {
  try {
    const members = await api('/api/members');
    const el = document.getElementById('member-list');
    document.getElementById('member-count').textContent = members.length;

    if (!members.length) {
      el.innerHTML = '<div class="empty-state">No members yet.</div>';
      return;
    }

    el.innerHTML = members.map(m => `
      <div class="member-item">
        <div class="member-avatar">${esc((m.username || '?')[0].toUpperCase())}</div>
        <div class="member-info">
          <div class="member-name">${esc(m.username)}</div>
          <div class="member-team">
            ${m.team_name ? esc(m.team_name) : ''}
            <span class="role-badge role-${m.role || 'member'}">${m.role || 'member'}</span>
          </div>
        </div>
        <button class="del-btn" data-del-member="${m.id}" aria-label="Remove member">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>`).join('');

    el.querySelectorAll('[data-del-member]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this member?')) return;
        try {
          await api('/api/members/' + btn.dataset.delMember, { method: 'DELETE' });
          loadMembers();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    console.error('Failed to load members:', err);
  }
}

/* ── Role toggle ─────────────────────────────────────────────── */
document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRole = btn.dataset.role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Hide team name for admin role
    const teamField = document.getElementById('new-member-team').closest('.field');
    teamField.style.opacity = selectedRole === 'admin' ? '0.4' : '1';
  });
});

/* ── Password eye toggle ─────────────────────────────────────── */
document.getElementById('toggle-pw').addEventListener('click', () => {
  const pwInput = document.getElementById('new-member-password');
  const isText = pwInput.type === 'text';
  pwInput.type = isText ? 'password' : 'text';
});

/* ── Add member ──────────────────────────────────────────────── */
document.getElementById('add-member-btn').addEventListener('click', async () => {
  const username  = document.getElementById('new-member-username').value.trim();
  const password  = document.getElementById('new-member-password').value.trim();
  const team_name = document.getElementById('new-member-team').value.trim();
  const role      = selectedRole;
  const errEl     = document.getElementById('add-member-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  errEl.style.display = 'none';

  // Client-side validation
  if (!username) return showErr('Username is required.');
  if (username.length < 3) return showErr('Username must be at least 3 characters.');
  if (!password) return showErr('Password is required.');
  if (password.length < 6) return showErr('Password must be at least 6 characters.');

  // Check password is not same as username
  if (password.toLowerCase() === username.toLowerCase()) {
    return showErr('Password cannot be the same as the username.');
  }

  const addBtn = document.getElementById('add-member-btn');
  addBtn.disabled = true;
  addBtn.textContent = 'Adding…';

  try {
    await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ username, password, team_name, role })
    });
    // Reset form
    document.getElementById('new-member-username').value = '';
    document.getElementById('new-member-password').value = '';
    document.getElementById('new-member-team').value     = '';
    errEl.style.display = 'none';
    loadMembers();
  } catch (err) {
    showErr(err.message);
  }

  addBtn.disabled = false;
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Member`;
});

/* ── Sidebar ─────────────────────────────────────────────────── */
const sidebar   = document.getElementById('sidebar');
const scrim     = document.getElementById('sidebar-scrim');
const openBtn   = document.getElementById('sidebar-open-btn');
const closeBtn  = document.getElementById('sidebar-close');

openBtn.addEventListener('click',  openSidebar);
closeBtn.addEventListener('click', closeSidebar);
scrim.addEventListener('click',    closeSidebar);

function openSidebar() {
  sidebar.classList.add('open');
  scrim.classList.add('show');
  openBtn.style.display = 'none';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
  openBtn.style.display = '';
}

/* ── Init ────────────────────────────────────────────────────── */
async function init() {
  try {
    const [zoneData, pinData] = await Promise.all([
      api('/api/zones'),
      api('/api/pins')
    ]);
    zoneData.forEach(addZoneToMap);
    pinData.forEach(addPinToMap);
    renderZoneList();
    renderPinList();
    loadMembers();

    if (zones.length) {
      const group = L.featureGroup(zones.map(z => z._layer));
      map.fitBounds(group.getBounds(), { padding: [80, 80] });
    }
  } catch (err) {
    console.error('Init failed:', err);
    showHint('⚠️ Failed to load data. Check your connection.', 5000);
  }

  // Start in no-tool mode
  setMode('none');
}

init();
