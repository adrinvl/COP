/* COP — application web (première version)
   Données : data/bordeaux.json, issues de la base vérifiée.
   Carte : MapLibre GL + tuiles OpenFreeMap. Adresses : Géoplateforme IGN. */

const TYPES = { club: 'Club', bar: 'Bar dansant', peniche: 'Péniche', warehouse: 'Warehouse' };
const GENRES = {
  techno: 'Techno', electro: 'Électro / house', hard: 'Hard techno', rap: 'Rap / R&B',
  latino: 'Latino', afro: 'Afro / shatta', retro: 'Années 80-2000', pop: 'Pop',
  variete: 'Variété', generaliste: 'Généraliste',
};
const STATUS = {
  confirme: { label: 'Vérifié', cls: 'ok' },
  'a-verifier': { label: 'À vérifier', cls: 'warn' },
  annonce: { label: 'Ouverture annoncée', cls: 'new' },
};
const QUICK = [['type', 'club'], ['type', 'bar'], ['genre', 'techno'], ['genre', 'rap'], ['genre', 'latino'], ['genre', 'retro'], ['genre', 'electro']];
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const GEO_CACHE = 'cop.geo.v1';

const ICON = {
  sliders: '<svg aria-hidden="true" viewBox="0 0 24 24" class="ico ico-sm"><path d="M4 7h9M17 7h3M4 17h4M12 17h8"/><circle cx="15" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  down: '<svg aria-hidden="true" viewBox="0 0 24 24" class="ico"><path d="M6 9l6 6 6-6"/></svg>',
  share: '<svg aria-hidden="true" viewBox="0 0 24 24" class="ico"><path d="M12 3v13M7 8l5-5 5 5M5 13v7h14v-7"/></svg>',
  go: '<svg aria-hidden="true" viewBox="0 0 24 24" class="ico"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  map: '<svg aria-hidden="true" viewBox="0 0 24 24" class="ico"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
};

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const plural = (n, word) => `${n} ${word}${n > 1 ? 'x' : ''}`;
const isWide = () => window.matchMedia('(min-width: 760px)').matches;

const state = {
  city: null, venues: [], q: '', types: new Set(), genres: new Set(), unverified: false,
  user: null, selected: null, map: null, markers: new Map(), me: null, sheet: 'half', fitted: false,
};

/* ---------- Stockage local (préférences légères, cache des adresses) ---------- */
function readStore(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function writeStore(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* stockage indisponible */ } }

/* ---------- Distances ---------- */
export function haversine(a, b) {
  const R = 6371000; const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]); const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function fmtDist(m) { return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`; }
// Estimation : trajet réel ≈ 1,3 × la ligne droite, marche à 80 m/min.
export function walkMin(m) { return Math.max(1, Math.round((m * 1.3) / 80)); }

/* ---------- Filtres ---------- */
const rank = (v) => (v.status === 'confirme' ? 0 : v.status === 'annonce' ? 1 : 2);
export function matches(v, s = state) {
  if (!s.unverified && v.status === 'a-verifier') return false;
  if (s.types.size && !s.types.has(v.type)) return false;
  if (s.genres.size && !v.tags.some((t) => s.genres.has(t))) return false;
  if (s.q) {
    const hay = norm([v.name, v.quartier, v.styles, TYPES[v.type], v.tags.map((t) => GENRES[t]).join(' ')].join(' '));
    if (!s.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
function visibleVenues() {
  const list = state.venues.filter((v) => matches(v));
  if (state.user) {
    list.forEach((v) => { v._d = v.coords ? haversine(state.user, v.coords) : Infinity; });
    list.sort((a, b) => a._d - b._d);
  } else {
    list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));
  }
  return list;
}
const activeFilters = () => state.types.size + state.genres.size + (state.unverified ? 1 : 0);

/* ---------- Rendu ---------- */
function renderChips() {
  const n = activeFilters();
  const html = [`<button class="chip" type="button" data-act="filters" aria-haspopup="dialog">${ICON.sliders}Filtres${n ? `<span class="badge">${n}</span>` : ''}</button>`];
  for (const [kind, key] of QUICK) {
    const on = kind === 'type' ? state.types.has(key) : state.genres.has(key);
    const label = kind === 'type' ? TYPES[key] : GENRES[key];
    html.push(`<button class="chip" type="button" aria-pressed="${on}" data-kind="${kind}" data-key="${key}">${esc(label)}</button>`);
  }
  $('#chips').innerHTML = html.join('');
}

function cardHTML(v) {
  const st = v.status !== 'confirme' ? `<span class="tag ${STATUS[v.status].cls}">${STATUS[v.status].label}</span>` : '';
  const dist = state.user && v.coords
    ? `<span class="dist">${fmtDist(v._d)}<br><span class="muted">${walkMin(v._d)} min</span></span>` : '';
  return `<li><button class="card${state.selected === v.id ? ' sel' : ''}" type="button" data-id="${esc(v.id)}">
    <span class="mark${v.type === 'bar' ? ' bar' : ''}" aria-hidden="true"><span></span></span>
    <span class="body">
      <span class="name">${esc(v.name)} ${st}</span>
      <span class="meta">${esc(TYPES[v.type])}${v.quartier ? ` · ${esc(v.quartier)}` : ''}</span>
      <span class="styles">${esc(v.styles)}</span>
    </span>${dist}</button></li>`;
}

function renderList() {
  const list = visibleVenues();
  $('#count').textContent = list.length ? plural(list.length, 'lieu') : 'Aucun lieu';
  const where = state.city ? state.city.city : '';
  $('#sub').textContent = state.user ? `${where} · triés par distance` : `${where} · ${state.unverified ? 'tous les lieux' : 'lieux vérifiés'}`;
  $('#list').innerHTML = list.length
    ? list.map(cardHTML).join('')
    : '<li class="empty"><span>Aucun lieu ne correspond à ces filtres.</span><button class="btn ghost" type="button" data-act="reset">Tout effacer</button></li>';
  renderChips();
  updateMarkers(list);
}

/* ---------- Carte ---------- */
function initMap() {
  if (!window.maplibregl) { noMap(); return; }
  try {
    const map = new maplibregl.Map({
      container: 'map', style: MAP_STYLE, center: state.city.center, zoom: 12.4,
      attributionControl: false, dragRotate: false, pitchWithRotate: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    map.touchZoomRotate.disableRotation();
    map.on('load', () => { tuneStyle(map); fitToVenues(); });
    map.on('error', (e) => console.warn('Carte :', e && e.error));
    state.map = map;
  } catch (e) {
    console.warn('Carte indisponible', e);
    noMap();
  }
}
function noMap() { $('#map').classList.add('off'); setSheet('full'); }

// Ajuste le style sombre d'OpenFreeMap à la palette de COP.
function tuneStyle(map) {
  try {
    for (const l of map.getStyle().layers) {
      if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#111113');
      else if (l.type === 'fill' && /water/.test(l.id)) map.setPaintProperty(l.id, 'fill-color', '#16202b');
    }
  } catch { /* style par défaut conservé */ }
}

function updateMarkers(list) {
  if (!state.map) return;
  const shown = new Set(list.map((v) => v.id));
  for (const v of state.venues) {
    if (!v.coords) continue;
    let m = state.markers.get(v.id);
    if (!m) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `pin${v.type === 'bar' ? ' bar' : ''}${v.status !== 'confirme' ? ' unverified' : ''}`;
      el.setAttribute('aria-label', v.name);
      el.innerHTML = '<span></span>';
      el.addEventListener('click', (e) => { e.stopPropagation(); openDetail(v.id); });
      m = new maplibregl.Marker({ element: el }).setLngLat(v.coords).addTo(state.map);
      state.markers.set(v.id, m);
    }
    const el = m.getElement();
    el.style.display = shown.has(v.id) ? '' : 'none';
    el.classList.toggle('sel', state.selected === v.id);
  }
}

function fitToVenues() {
  if (!state.map || state.fitted || state.selected || state.user) return;
  const pts = state.venues.filter((v) => v.coords && matches(v)).map((v) => v.coords);
  if (pts.length < 2) return;
  const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
  pts.forEach((p) => b.extend(p));
  const padding = isWide()
    ? { top: 60, bottom: 60, left: 470, right: 60 }
    : { top: 150, bottom: Math.min(sheetPx(state.sheet) + 24, window.innerHeight * 0.6), left: 40, right: 40 };
  try {
    state.map.fitBounds(b, { padding, maxZoom: 14, duration: 0 });
    state.fitted = true;
  } catch { /* carte trop petite */ }
}

/* ---------- Adresses → coordonnées (Géoplateforme IGN) ---------- */
async function geocode(q) {
  const enc = encodeURIComponent(q);
  const urls = [
    `https://data.geopf.fr/geocodage/search?q=${enc}&limit=1`,
    `https://api-adresse.data.gouv.fr/search/?q=${enc}&limit=1`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const j = await r.json();
      const f = j && j.features && j.features[0];
      if (f && (f.properties?.score ?? 1) >= 0.35) return f.geometry.coordinates.map((n) => Math.round(n * 1e6) / 1e6);
    } catch { /* on tente l'adresse suivante */ }
  }
  return null;
}
async function geocodeAll() {
  const cache = readStore(GEO_CACHE) || {};
  const todo = state.venues.filter((v) => !v.coords && v.geo);
  todo.forEach((v) => { if (cache[v.geo]) v.coords = cache[v.geo]; });
  const rest = todo.filter((v) => !v.coords);
  if (rest.length) {
    let i = 0;
    const worker = async () => {
      while (i < rest.length) {
        const v = rest[i++];
        const c = await geocode(v.geo);
        if (c) { v.coords = c; cache[v.geo] = c; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    writeStore(GEO_CACHE, cache);
  }
  renderList();
  fitToVenues();
  const missing = state.venues.filter((v) => !v.coords).length;
  if (missing) console.info(`${missing} lieu(x) sans position sur la carte`);
}

/* ---------- Panneau du bas ---------- */
const STATES = ['peek', 'half', 'full'];
function sheetPx(s) {
  const vh = window.innerHeight;
  const topBottom = $('.top').getBoundingClientRect().bottom;
  if (s === 'peek') return 150;
  if (s === 'half') return Math.round(vh * 0.46);
  return Math.round(vh - topBottom - 12);
}
function setSheet(s) {
  state.sheet = s;
  document.documentElement.style.setProperty('--sheet-h', `${sheetPx(s)}px`);
  $('#sheet').dataset.state = s;
  document.body.dataset.sheet = s;
}
function bindSheetDrag() {
  const sheet = $('#sheet');
  let startY = 0; let startH = 0; let moved = false; let dragging = false;
  const down = (e) => {
    dragging = true; moved = false; startY = e.clientY; startH = sheet.getBoundingClientRect().height;
    sheet.classList.add('dragging'); e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 6) moved = true;
    const h = Math.max(120, Math.min(sheetPx('full'), startH + dy));
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
  };
  const cycle = () => setSheet(state.sheet === 'full' ? 'half' : state.sheet === 'half' ? 'full' : 'half');
  const up = (e) => {
    if (!dragging) return;
    dragging = false; sheet.classList.remove('dragging');
    if (!moved) { if (e.currentTarget.id === 'handle') cycle(); else setSheet(state.sheet); return; }
    const h = sheet.getBoundingClientRect().height;
    const best = STATES.reduce((a, s) => (Math.abs(sheetPx(s) - h) < Math.abs(sheetPx(a) - h) ? s : a), 'half');
    setSheet(best);
  };
  for (const el of [$('#handle'), $('#sheet-head')]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  // Clavier : Entrée ou Espace sur la poignée.
  $('#handle').addEventListener('click', (e) => { if (e.detail === 0) cycle(); });
}

/* ---------- Fiche lieu ---------- */
function detailHTML(v) {
  const st = STATUS[v.status];
  const proof = v.proof ? `Dernière preuve : ${esc(v.proof)}` : v.status === 'confirme' ? 'Confirmé par COP' : '';
  const dist = state.user && v.coords ? haversine(state.user, v.coords) : null;
  const cells = [
    ['Horaires', v.hours], ['Entrée', v.entry],
    dist != null ? ['Distance', `${fmtDist(dist)} · environ ${walkMin(dist)} min à pied`] : null,
    ['Transport', v.transport], ['Adresse', v.address, true],
  ].filter((c) => c && c[1]);
  const addr = encodeURIComponent(v.address);
  const apple = v.coords
    ? `https://maps.apple.com/?daddr=${v.coords[1]},${v.coords[0]}&q=${encodeURIComponent(v.name)}`
    : `https://maps.apple.com/?daddr=${addr}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${addr}`;
  return `
  <div class="d-bar">
    <button class="round" id="d-close" type="button" data-act="close-detail" aria-label="Fermer la fiche">${ICON.down}</button>
    <button class="round" type="button" data-act="share" aria-label="Partager">${ICON.share}</button>
  </div>
  <p class="d-eyebrow">${esc(TYPES[v.type])}${v.quartier ? ` · ${esc(v.quartier)}` : ''}</p>
  <h2 class="d-name" id="d-name">${esc(v.name)}</h2>
  <div class="d-status"><span class="tag ${st.cls}">${st.label}</span>${proof ? `<span>${proof}</span>` : ''}${v.lgbt ? '<span class="tag plain">LGBTQ+</span>' : ''}</div>
  <div class="d-tags">${v.tags.map((t) => `<span class="tag">${esc(GENRES[t])}</span>`).join('')}</div>
  <div class="d-actions">
    <a class="act primary" href="${esc(apple)}" target="_blank" rel="noopener">${ICON.go}Itinéraire</a>
    <a class="act" href="${esc(google)}" target="_blank" rel="noopener">${ICON.map}Google Maps</a>
    <button class="act" type="button" data-act="share">${ICON.share}Partager</button>
  </div>
  <div class="d-grid">${cells.map(([k, val, wide]) => `<div class="cell${wide ? ' wide' : ''}"><span class="k">${k}</span><span class="v">${esc(val)}</span></div>`).join('')}</div>
  <p class="d-notes"><strong>Styles :</strong> ${esc(v.styles)}${v.notes ? `<br>${esc(v.notes)}` : ''}</p>
  ${v.source ? `<p class="d-source">Source : <a href="${esc(v.source.url)}" target="_blank" rel="noopener">${esc(v.source.label)}</a></p>` : ''}
  <div class="d-soon">Bientôt ici : la note Google, les avis COP, le prix des consos et la programmation de la semaine.</div>`;
}
function openDetail(id) {
  const v = state.venues.find((x) => x.id === id);
  if (!v) return;
  state.selected = id;
  const d = $('#detail');
  d.innerHTML = detailHTML(v);
  d.hidden = false;
  d.scrollTop = 0;
  if (location.hash !== `#lieu-${id}`) history.replaceState(null, '', `#lieu-${id}`);
  if (state.map && v.coords) {
    const offset = isWide() ? [220, 0] : [0, -Math.round(window.innerHeight * 0.28)];
    state.map.easeTo({ center: v.coords, zoom: Math.max(state.map.getZoom(), 14.5), offset, duration: 500 });
  }
  renderList();
  $('#d-close').focus({ preventScroll: true });
}
function closeDetail() {
  if ($('#detail').hidden) return;
  $('#detail').hidden = true;
  const id = state.selected;
  state.selected = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  renderList();
  const card = id && document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) card.focus({ preventScroll: true });
}
async function share() {
  const v = state.venues.find((x) => x.id === state.selected);
  if (!v) return;
  const url = `${location.origin}${location.pathname}#lieu-${v.id}`;
  const data = { title: `${v.name} · COP`, text: `${v.name}, ${TYPES[v.type].toLowerCase()} à ${v.quartier || state.city.city}`, url };
  if (navigator.share) { try { await navigator.share(data); } catch { /* partage annulé */ } return; }
  try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch { toast(url); }
}

/* ---------- Filtres ---------- */
function chipToggle(kind, key, label, on) {
  return `<button class="chip" type="button" aria-pressed="${on}" data-kind="${kind}" data-key="${key}">${esc(label)}</button>`;
}
function renderFilters() {
  const count = state.venues.filter((v) => matches(v)).length;
  $('#filters').innerHTML = `
  <div class="p-head">
    <button class="link" type="button" data-act="close-filters">Fermer</button>
    <h2 id="f-title">Filtres</h2>
    <button class="link" type="button" data-act="reset">Effacer</button>
  </div>
  <div class="p-body">
    <section><h3>Type de lieu</h3><div class="wrap">${Object.entries(TYPES).map(([k, l]) => chipToggle('type', k, l, state.types.has(k))).join('')}</div></section>
    <section><h3>Musique</h3><div class="wrap">${Object.entries(GENRES).map(([k, l]) => chipToggle('genre', k, l, state.genres.has(k))).join('')}</div></section>
    <section class="row">
      <label for="f-unv">Inclure les lieux à vérifier<small>Lieux sans preuve d'activité récente</small></label>
      <input id="f-unv" class="sw" type="checkbox" role="switch"${state.unverified ? ' checked' : ''}>
    </section>
  </div>
  <div class="p-foot"><button class="btn" type="button" data-act="close-filters">Afficher ${plural(count, 'lieu')}</button></div>`;
}
function openFilters() { renderFilters(); $('#filters').hidden = false; $('#scrim').hidden = false; $('#filters .link').focus({ preventScroll: true }); }
function closeFilters() { $('#filters').hidden = true; $('#scrim').hidden = true; }
function toggle(kind, key) {
  const set = kind === 'type' ? state.types : state.genres;
  if (set.has(key)) set.delete(key); else set.add(key);
  afterFilterChange();
}
function afterFilterChange() {
  writeStore('cop.filters.v1', { types: [...state.types], genres: [...state.genres], unverified: state.unverified });
  renderList();
  if (!$('#filters').hidden) renderFilters();
}
function resetFilters() {
  state.types.clear(); state.genres.clear(); state.unverified = false; state.q = ''; $('#q').value = '';
  afterFilterChange();
}

/* ---------- Localisation ---------- */
function locate() {
  if (!navigator.geolocation) { toast('Localisation indisponible sur cet appareil'); return; }
  $('#locate').classList.add('on');
  navigator.geolocation.getCurrentPosition((pos) => {
    state.user = [pos.coords.longitude, pos.coords.latitude];
    const nearest = Math.min(...state.venues.filter((v) => v.coords).map((v) => haversine(state.user, v.coords)));
    if (state.map) {
      if (!state.me) {
        const el = document.createElement('div'); el.className = 'me'; el.setAttribute('aria-label', 'Ma position');
        state.me = new maplibregl.Marker({ element: el }).setLngLat(state.user).addTo(state.map);
      } else state.me.setLngLat(state.user);
      if (nearest < 30000 || !Number.isFinite(nearest)) state.map.easeTo({ center: state.user, zoom: 13.5, duration: 600 });
    }
    if (Number.isFinite(nearest) && nearest >= 30000) toast(`Tu es à ${fmtDist(nearest)} du lieu le plus proche`);
    renderList();
  }, (err) => {
    $('#locate').classList.remove('on');
    toast(err.code === 1 ? 'Autorise la localisation dans les réglages du navigateur' : 'Position introuvable pour le moment');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

/* ---------- Divers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}
function routeFromHash() {
  const m = location.hash.match(/^#lieu-([a-z0-9-]+)$/);
  if (m) openDetail(m[1]);
}

function bind() {
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = norm(e.target.value.trim()); renderList(); }, 120);
  });
  $('#q').addEventListener('focus', () => { if (state.sheet === 'peek') setSheet('half'); });
  $('#city').addEventListener('click', () => toast('Bordeaux d’abord. Paris arrive bientôt.'));
  $('#locate').addEventListener('click', locate);
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'filters') openFilters(); else toggle(b.dataset.kind, b.dataset.key);
  });
  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'reset') resetFilters(); else if (b.dataset.id) openDetail(b.dataset.id);
  });
  $('#detail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'close-detail') closeDetail();
    if (b.dataset.act === 'share') share();
  });
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'close-filters') closeFilters();
    else if (b.dataset.act === 'reset') resetFilters();
    else if (b.dataset.kind) toggle(b.dataset.kind, b.dataset.key);
  });
  $('#filters').addEventListener('change', (e) => {
    if (e.target.id === 'f-unv') { state.unverified = e.target.checked; afterFilterChange(); }
  });
  $('#scrim').addEventListener('click', closeFilters);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#filters').hidden) closeFilters(); else closeDetail();
  });
  window.addEventListener('hashchange', () => { if (location.hash) routeFromHash(); else closeDetail(); });
  window.addEventListener('resize', () => setSheet(state.sheet));
  bindSheetDrag();
}

async function init() {
  const saved = readStore('cop.filters.v1');
  if (saved) {
    (saved.types || []).forEach((t) => TYPES[t] && state.types.add(t));
    (saved.genres || []).forEach((g) => GENRES[g] && state.genres.add(g));
    state.unverified = !!saved.unverified;
  }
  bind();
  renderChips();
  setSheet('half');
  try {
    const r = await fetch('data/bordeaux.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    state.city = await r.json();
  } catch (e) {
    $('#count').textContent = 'Impossible de charger les lieux';
    $('#sub').textContent = 'Vérifie ta connexion puis recharge la page.';
    return;
  }
  state.venues = state.city.venues.map((v) => ({
    ...v, tags: v.tags || [], coords: v.lng != null && v.lat != null ? [v.lng, v.lat] : null,
  }));
  initMap();
  renderList();
  routeFromHash();
  geocodeAll();
}

if (typeof document !== 'undefined' && document.getElementById('map')) init();
