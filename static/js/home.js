/* ================================================================
   home.js — Public map view with live location on load
   ================================================================ */

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress:  'In progress',
  done:         'Done'
};

// ---- Map init (neutral center, gets overridden by live location) ----
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([20, 0], 3);

// High-res tile layer — OpenStreetMap with retina support (no API key needed)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  detectRetina: true
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

let zones = [];
let pins  = [];
let locationMarker = null;
let locationCircle  = null;

// ---- Utilities ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

async function apiFetch(path) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Request failed');
  if (res.status === 204) return null;
  return res.json();
}

// ---- Live location ----
let _locWatchId = null;

function placeLocationMarker(lat, lng, accuracy) {
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationCircle)  map.removeLayer(locationCircle);

  // Accuracy ring — cap display radius so it doesn't fill the whole map
  locationCircle = L.circle([lat, lng], {
    radius: Math.min(accuracy, 500),
    color: '#fa4e05', fillColor: '#fa4e05',
    fillOpacity: 0.08, weight: 1.5, dashArray: '4 4'
  }).addTo(map);

  locationMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      iconSize:   [18, 18],
      iconAnchor: [9, 9],
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#fa4e05;border:3px solid #fff;
        box-shadow:0 0 0 4px rgba(250,78,5,.25),0 2px 6px rgba(0,0,0,.3);
        animation:loc-pulse 2s infinite;
      "></div>
      <style>
        @keyframes loc-pulse{
          0%,100%{box-shadow:0 0 0 4px rgba(250,78,5,.25),0 2px 6px rgba(0,0,0,.3)}
          50%{box-shadow:0 0 0 10px rgba(250,78,5,.08),0 2px 6px rgba(0,0,0,.3)}
        }
      </style>`
    })
  }).addTo(map);

  locationMarker.bindPopup('<div class="popup-title">📍 You are here</div>');
}

function requestLocation() {
  if (!navigator.geolocation) return;

  // Cancel any previous watch
  if (_locWatchId !== null) {
    navigator.geolocation.clearWatch(_locWatchId);
    _locWatchId = null;
  }

  const ACCURACY_THRESHOLD = 100; // metres — stop watching once we're this accurate
  const GIVE_UP_AFTER      = 20000; // ms — accept best result after 20 s regardless

  let bestAccuracy = Infinity;
  let gaveUp = false;

  const giveUpTimer = setTimeout(() => {
    // Accept whatever we have after 20 s
    gaveUp = true;
    if (_locWatchId !== null) {
      navigator.geolocation.clearWatch(_locWatchId);
      _locWatchId = null;
    }
  }, GIVE_UP_AFTER);

  _locWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;

      // Always update marker so the user sees improvement in real time
      placeLocationMarker(lat, lng, accuracy);

      // Pan only on first result or if accuracy improved meaningfully
      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        if (zones.length === 0) {
          map.setView([lat, lng], 14, { animate: true });
        }
      }

      // Once accurate enough, stop watching
      if (accuracy <= ACCURACY_THRESHOLD && !gaveUp) {
        clearTimeout(giveUpTimer);
        navigator.geolocation.clearWatch(_locWatchId);
        _locWatchId = null;
      }
    },
    err => {
      clearTimeout(giveUpTimer);
      console.info('Location access denied or unavailable:', err.message);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

// ---- Re-center button ----
document.getElementById('loc-btn').addEventListener('click', () => {
  if (locationMarker) {
    map.setView(locationMarker.getLatLng(), 16, { animate: true });
    locationMarker.openPopup();
  } else {
    requestLocation();
  }
});

function popupForZone(z) {
  const rows = [];
  if (z.description) rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16h12V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escapeHtml(z.description)}</div>`);
  if (z.timing)      rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(z.timing)}</div>`);
  if (z.contact)     rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 10a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.44-.44a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z"/></svg> <a href="tel:${escapeHtml(z.contact)}" style="color:var(--accent);font-weight:600;">${escapeHtml(z.contact)}</a></div>`);
  return `<div class="popup-title">${escapeHtml(z.name)}</div>${rows.join('')}`;
}

function popupForPin(p) {
  const rows = [];
  if (p.description) rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16h12V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escapeHtml(p.description)}</div>`);
  if (p.timing)      rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(p.timing)}</div>`);
  if (p.contact)     rows.push(`<div class="popup-row"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 10a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.44-.44a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z"/></svg> <a href="tel:${escapeHtml(p.contact)}" style="color:var(--accent);font-weight:600;">${escapeHtml(p.contact)}</a></div>`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  rows.push(`<a href="${navUrl}" target="_blank" rel="noopener" class="popup-nav-btn">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
    Navigate
  </a>`);
  return `<div class="popup-title">${escapeHtml(p.name)}</div>${rows.join('')}`;
}

function addZoneToMap(z) {
  const latlngs = z.coords.map(c => L.latLng(c[0], c[1]));
  const layer = L.polygon(latlngs, {
    color:       z.color,
    fillColor:   z.color,
    fillOpacity: 0.22,
    weight:      2.5
  }).addTo(map);
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
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
      html: `<div style="
        width:22px;height:22px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        animation:loc-pulse 2s infinite;
      "></div>`
    })
  }).addTo(map);
  marker.bindPopup(popupForPin(p), { maxWidth: 260 });
  marker.on('click', () => marker.openPopup());
  p._marker = marker;
  pins.push(p);
}

// ---- Sidebar lists ----
function renderZoneList() {
  const el = document.getElementById('zone-list');
  document.getElementById('zone-count').textContent = zones.length;

  if (!zones.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>
        No zones published yet.
      </div>`;
    return;
  }

  el.innerHTML = zones.map(z => `
    <div class="zone-item" data-zone="${z.id}">
      <div class="zone-swatch" style="background:${z.color};"></div>
      <div class="zone-body">
        <p class="zone-name">${escapeHtml(z.name)}</p>
        <div class="zone-meta">
          <span>${escapeHtml(z.team || 'Unassigned')}</span>
          <span class="pill pill-${z.status}">${STATUS_LABEL[z.status]}</span>
        </div>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-zone]').forEach(item => {
    item.addEventListener('click', () => {
      const z = zones.find(z => z.id === item.dataset.zone);
      if (z) {
        map.fitBounds(z._layer.getBounds(), { padding: [50, 50], animate: true });
        z._layer.openPopup();
        closeSidebar();
      }
    });
  });
}

function renderPinList() {
  const el = document.getElementById('pin-list');
  document.getElementById('pin-count').textContent = pins.length;

  if (!pins.length) {
    el.innerHTML = `<div class="empty-state">No pins yet.</div>`;
    return;
  }

  el.innerHTML = pins.map(p => `
    <div class="pin-item" data-pin="${p.id}">
      <div class="pin-dot"></div>
      <span class="pin-name">${escapeHtml(p.name)}</span>
    </div>
  `).join('');

  el.querySelectorAll('[data-pin]').forEach(item => {
    item.addEventListener('click', () => {
      const p = pins.find(p => p.id === item.dataset.pin);
      if (p) {
        map.setView(p._marker.getLatLng(), 17, { animate: true });
        p._marker.openPopup();
        closeSidebar();
      }
    });
  });
}

// ---- Mobile sidebar ----
const sidebar = document.getElementById('sidebar');
const scrim   = document.getElementById('sidebar-scrim');

document.getElementById('hamburger').addEventListener('click', () => {
  sidebar.classList.add('open');
  scrim.classList.add('show');
});
document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);
scrim.addEventListener('click', closeSidebar);

function closeSidebar() {
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
}

// ---- Init ----
async function init() {
  // Ask for live location immediately on page open
  requestLocation();

  try {
    const [zoneData, pinData] = await Promise.all([
      apiFetch('/api/zones'),
      apiFetch('/api/pins')
    ]);

    zoneData.forEach(addZoneToMap);
    pinData.forEach(addPinToMap);
    renderZoneList();
    renderPinList();

    if (zones.length) {
      const group = L.featureGroup(zones.map(z => z._layer));
      map.fitBounds(group.getBounds(), { padding: [60, 60], animate: true });
    }
  } catch (err) {
    console.error('Failed to load map data:', err);
  }
}

init();
