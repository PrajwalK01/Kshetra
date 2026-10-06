/* ================================================================
   user.js — Member view: assigned zones, status updates, live loc
   ================================================================ */

const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' };
const STATUS_OPTIONS = ['not_started', 'in_progress', 'done'];

// ---- Map ----
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([12.9716, 77.5946], 13);

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

async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch(e) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Live location ----
let _locWatchId = null;

function placeLocationMarker(lat, lng, accuracy) {
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationCircle)  map.removeLayer(locationCircle);

  locationCircle = L.circle([lat, lng], {
    radius: Math.min(accuracy, 500), color: '#1a7f5a', fillColor: '#1a7f5a',
    fillOpacity: 0.08, weight: 1.5, dashArray: '4 4'
  }).addTo(map);

  locationMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '', iconSize: [18,18], iconAnchor: [9,9],
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#1a7f5a;border:3px solid #fff;box-shadow:0 0 0 4px rgba(26,127,90,.25),0 2px 6px rgba(0,0,0,.3);"></div>`
    })
  }).addTo(map);
  locationMarker.bindPopup('<div class="popup-title">📍 You are here</div>');
}

function requestLocation() {
  if (!navigator.geolocation) return;

  if (_locWatchId !== null) {
    navigator.geolocation.clearWatch(_locWatchId);
    _locWatchId = null;
  }

  const ACCURACY_THRESHOLD = 100; // metres
  const GIVE_UP_AFTER      = 20000; // ms

  let bestAccuracy = Infinity;
  let gaveUp = false;

  const giveUpTimer = setTimeout(() => {
    gaveUp = true;
    if (_locWatchId !== null) {
      navigator.geolocation.clearWatch(_locWatchId);
      _locWatchId = null;
    }
  }, GIVE_UP_AFTER);

  _locWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      placeLocationMarker(lat, lng, accuracy);

      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
        if (zones.length === 0) {
          map.setView([lat, lng], 14, { animate: true });
        }
      }

      if (accuracy <= ACCURACY_THRESHOLD && !gaveUp) {
        clearTimeout(giveUpTimer);
        navigator.geolocation.clearWatch(_locWatchId);
        _locWatchId = null;
      }
    },
    err => {
      clearTimeout(giveUpTimer);
      console.info('Location unavailable:', err.message);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

document.getElementById('loc-btn').addEventListener('click', () => {
  if (locationMarker) {
    map.setView(locationMarker.getLatLng(), 16, { animate: true });
    locationMarker.openPopup();
  } else {
    requestLocation();
  }
});

// ---- Map rendering ----
function popupForZone(z) {
  return `<div class="popup-title">${escapeHtml(z.name)}</div>`;
}

function addZoneToMap(z) {
  const latlngs = z.coords.map(c => L.latLng(c[0], c[1]));
  const layer = L.polygon(latlngs, {
    color: z.color, fillColor: z.color, fillOpacity: 0.25, weight: 2.5
  }).addTo(map);
  layer.bindPopup(popupForZone(z));
  layer.on('click', () => layer.openPopup());
  z._layer = layer;
  zones.push(z);
}

function addPinToMap(p) {
  const marker = L.marker([p.lat, p.lng], {
    icon: L.divIcon({
      className: '', iconSize: [16,16], iconAnchor: [8,8],
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#d4712a;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`
    })
  }).addTo(map);
  marker.bindPopup(`<div class="popup-title">${escapeHtml(p.name)}</div>`);
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
        No zones assigned to your team yet.
      </div>`;
    return;
  }

  el.innerHTML = zones.map(z => `
    <div class="zone-item" data-zone="${z.id}">
      <div class="zone-swatch" style="background:${z.color};"></div>
      <div class="zone-body">
        <p class="zone-name">${escapeHtml(z.name)}</p>
        <div class="zone-meta" style="margin-top:5px;">
          <select class="status-select" data-status-for="${z.id}" aria-label="Update status">
            ${STATUS_OPTIONS.map(s =>
              `<option value="${s}"${z.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-zone]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('select')) return;
      const z = zones.find(z => z.id === item.dataset.zone);
      if (z) {
        map.fitBounds(z._layer.getBounds(), { padding: [50,50], animate: true });
        z._layer.openPopup();
        closeSidebar();
      }
    });
  });

  el.querySelectorAll('[data-status-for]').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async () => {
      const id = sel.dataset.statusFor;
      try {
        const updated = await api('/api/zones/' + id, {
          method: 'PATCH',
          body: JSON.stringify({ status: sel.value })
        });
        const z = zones.find(z => z.id === id);
        if (z) {
          z.status = updated.status;
          z._layer.setPopupContent(popupForZone(z));
        }
        renderZoneList();
      } catch (err) { alert('Could not update status: ' + err.message); }
    });
  });
}

function renderPinList() {
  const el = document.getElementById('pin-list');
  document.getElementById('pin-count').textContent = pins.length;

  if (!pins.length) {
    el.innerHTML = `<div class="empty-state">No field notes in your zones yet.</div>`;
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
  sidebar.classList.add('open'); scrim.classList.add('show');
});
scrim.addEventListener('click', closeSidebar);

function closeSidebar() {
  sidebar.classList.remove('open'); scrim.classList.remove('show');
}

// ---- Init ----
async function init() {
  requestLocation();

  try {
    const [zoneData, pinData] = await Promise.all([
      api('/api/zones'),
      api('/api/pins')
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
    console.error('Failed to load data:', err);
  }
}

init();
