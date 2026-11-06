/* =========================================================
   BOM! — Organizador de PDFs · protótipo funcional
   Linguagem: JavaScript puro (ES2020+), sem framework.
   Persistência simulada no navegador:
     - localStorage: usuários, sessão, log de acesso, pastas e arquivos
     - IndexedDB: bytes dos arquivos importados (PDF, imagens, outros)
   No app real: Firebase Auth + Firestore + armazenamento do aparelho.
   ========================================================= */

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MEM = {};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? (k in MEM ? MEM[k] : d) : JSON.parse(v); } catch (e) { return k in MEM ? MEM[k] : d; } },
  set(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return e && e.name === 'SecurityError'; } },
  del(k) { delete MEM[k]; try { localStorage.removeItem(k); } catch (e) {} }
};
/* ---------- app nativo (Capacitor) e verificação de armazenamento ---------- */
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const CP = () => (window.Capacitor && window.Capacitor.Plugins) || {};
function storageOk() { try { localStorage.setItem('bom_t', '1'); const ok = localStorage.getItem('bom_t') === '1'; localStorage.removeItem('bom_t'); return ok; } catch (e) { return false; } }
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
async function nativeShare(files) {
  const {Filesystem, Share} = CP(); const uris = [];
  for (const f of files) { const w = await Filesystem.writeFile({path: f.name, data: await blobToB64(f), directory: 'CACHE'}); uris.push(w.uri); }
  await Share.share({title: 'BOM!', dialogTitle: 'Enviar com', files: uris});
}
async function nativeSave(files) {
  const {Filesystem} = CP(); let n = 0;
  for (const f of files) { await Filesystem.writeFile({path: 'BOM/' + f.name, data: await blobToB64(f), directory: 'DOCUMENTS', recursive: true}); n++; }
  return n;
}
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toLocaleString('pt-BR', {maximumFractionDigits: 0}) + ' KB' : (b / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' MB';
const fmtD = t => new Date(t).toLocaleDateString('pt-BR');
const fmtT = t => new Date(t).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const ymd = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const baseName = n => n.replace(/\.[^.]+$/, '');
const extOf = n => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
const lighten = (hex, a) => { const n = parseInt(hex.slice(1), 16); const f = c => Math.round(c + (255 - c) * a); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
async function hashPw(p) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bom:' + p)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let h = 7; for (const c of 'bom:' + p) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
}

/* ---------- tipos, etiquetas e cores ---------- */
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);
const TXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log']);
const kindOf = it => it.type === 'folder' ? 'folder' : it.ext === 'pdf' ? 'pdf' : IMG_EXT.has(it.ext) ? 'img' : TXT_EXT.has(it.ext) ? 'txt' : 'other';
const KIND_NAME = {pdf: 'PDF', img: 'Imagem', txt: 'Texto', other: 'Arquivo', folder: 'Pasta'};
const TAGS = [{id: 'red', name: 'Urgente', c: '#ef4444'}, {id: 'amber', name: 'Revisar', c: '#f59e0b'}, {id: 'green', name: 'Concluído', c: '#22c55e'}, {id: 'blue', name: 'Estudo', c: '#3b82f6'}, {id: 'purple', name: 'Pessoal', c: '#a855f7'}];
const tagOf = id => TAGS.find(t => t.id === id);
const FOLDER_COLORS = ['#3b8cf0', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];
const PEN_COLORS = ['#e5322d', '#2f80ed', '#111827', '#16a34a'];
const SORTS = {name: 'Nome', date: 'Data', size: 'Tamanho', type: 'Tipo'};

/* ---------- ícones ---------- */
const IC = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>', arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>', chevDown: '<path d="M6 9l6 6 6-6"/>', chevUp: '<path d="M18 15l-6-6-6 6"/>',
  more: '<circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>',
  dots: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  move: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13 10l3 3-3 3"/>',
  newfolder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  send: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M4 5v14" opacity=".5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  annotate: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 20h6"/>',
  convert: '<circle cx="12" cy="12" r="8"/><path d="M8.5 10.5h7l-2-2M15.5 13.5h-7l2 2"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  openDoc: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="16" cy="8.5" r="1.5"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>', split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  cols: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>', rows: '<rect x="3" y="3" width="18" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="18" height="7.5" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.5L3.8 13a1.5 1.5 0 0 1 2.4-1.7L8 13"/>',
  note: '<path d="M4 5h16v11H9l-5 4z"/>', hl: '<path d="M15 4l5 5-9 9H6v-5z"/><path d="M3 21h18"/>', text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen: '<path d="M3 21c3-1 5-3 6-5M14 4l6 6-9 9-5 1 1-5z"/>', eraser: '<path d="M8 20h12M5 15l9-9 5 5-7 7H8z"/><path d="M10 10l5 5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  sign: '<path d="M3 17c3-6 5-9 6-8s-2 6 0 7 3-5 5-4-1 4 1 4 3-2 5-2M3 21h18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', max: '<path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  newdoc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3 2.3 3.5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  starF: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  sort: '<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>', layers: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/>',
  thumbs: '<rect x="4" y="3" width="7" height="9" rx="1"/><rect x="13" y="3" width="7" height="9" rx="1"/><rect x="4" y="14" width="7" height="7" rx="1"/><rect x="13" y="14" width="7" height="7" rx="1"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', page: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="M14 11v6M11 14h6"/>',
  resize: '<path d="M20 12v8h-8M20 20l-8-8M14 20h6v-6" /><path d="M8 20H4v-4M20 8V4h-4"/>'
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;
const folderSvg = (c = '#3b8cf0', s = 46) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 48 48"><path d="M4 12a4 4 0 0 1 4-4h10.5l4 4H40a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="${c}"/><path d="M4 18.5A3.5 3.5 0 0 1 7.5 15h33a3.5 3.5 0 0 1 3.5 3.5V36a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="${lighten(c, .22)}"/></svg>`;
function fileIcon(it, s = 46) {
  const k = kindOf(it), col = {pdf: '#e5322d', img: '#16a34a', txt: '#2f80ed', other: '#64748b'}[k] || '#64748b';
  const lab = esc((it.ext || '?').toUpperCase().slice(0, 4));
  const glyph = k === 'img' ? '<path d="M14 33l6-8 5 6 3-4 6 6z" fill="#fff"/><circle cx="18.5" cy="20" r="3" fill="#fff"/>'
    : k === 'pdf' ? '<path d="M24 14c-1.6 0-1.8 2.2-.8 4.6 1.3 3.2 4.3 6.9 7.6 8 2.2.7 3.4.1 3.1-.9-.4-1.3-3.6-1.4-7.6-.4-3.7.9-7.8 3-8.8 5.1-.7 1.4.4 2.2 1.6 1.4 2.3-1.5 4.8-6.4 6-10.6.8-2.9.5-7.2-1.1-7.2z" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>'
    : '<path d="M15 20h18M15 24.5h18M15 29h12" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>';
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 48 48"><path d="M12 4h17l11 11v26a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="${col}"/><path d="M29 4v8a3 3 0 0 0 3 3h8z" fill="#fff" opacity=".35"/>${glyph}${k === 'pdf' ? '' : `<text x="24.5" y="40.5" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="800" font-size="7.5" fill="#fff">${lab}</text>`}</svg>`;
}
const iconOf = (it, s) => it.type === 'folder' ? folderSvg(it.color, s) : fileIcon(it, s);
/* Logo oficial do BOM! (img/logo-bom.png, fundo transparente, 950×552) */
const logo = (w = 220) => `<img class="logo" src="img/logo-bom.png" width="${w}" height="${Math.round(w * 552 / 950)}" alt="BOM!" draggable="false">`;

/* ---------- IndexedDB (bytes dos arquivos importados) ---------- */
const IDB = {
  db: null,
  open() { return new Promise((res, rej) => { if (this.db) return res(this.db); let r; try { r = indexedDB.open('bom_pdfs', 1); } catch (e) { return rej(e); } r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async put(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { MEM['bin:' + k] = v; } },
  async get(k) { if (MEM['bin:' + k]) return MEM['bin:' + k]; try { const db = await this.open(); return await new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return null; } },
  async del(k) { delete MEM['bin:' + k]; try { const db = await this.open(); db.transaction('files', 'readwrite').objectStore('files').delete(k); } catch (e) {} }
};
const pdfCache = {}, URLS = {};
function getPdf(id) {
  if (!window.pdfjsLib) return Promise.reject(new Error('pdf.js indisponível'));
  if (!pdfCache[id]) {
    pdfCache[id] = (async () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = window.BOM_LIBS_LOCAL ? 'libs/pdf.worker.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await IDB.get(id); if (!buf) throw new Error('sem dados');
      return pdfjsLib.getDocument({data: new Uint8Array(buf).slice()}).promise;
    })();
    pdfCache[id].catch(() => delete pdfCache[id]);
  }
  return pdfCache[id];
}
async function objURL(id) { if (URLS[id]) return URLS[id]; const b = await IDB.get(id); if (!b) return null; const it = item(id); return URLS[id] = URL.createObjectURL(new Blob([b], {type: (it && it.mime) || ''})); }
function imgDims(buf, type) { return new Promise(res => { const u = URL.createObjectURL(new Blob([buf], {type})); const im = new Image(); im.onload = () => { res({w: im.naturalWidth, h: im.naturalHeight}); URL.revokeObjectURL(u); }; im.onerror = () => res({w: 3, h: 4}); im.src = u; }); }

/* ---------- estado ---------- */
const S = {
  screen: 'login', user: null, fs: null, section: 'files', cwd: null, select: false, sel: new Set(), filter: '', searchOpen: false,
  tf: 'all', view: 'grid', sort: 'name', dir: 1, openPanel: true,
  open: [], active: null, layout: 'tabs', split: [], splitDir: 'cols', focusDoc: null, vmode: 'main', tool: 'hand', penColor: PEN_COLORS[0],
  zoom: 1, night: false, find: null, pos: {}, hist: {}, floats: [], z: 10, flash: [],
  adminIntent: false, loginErr: '', adminTab: 'log', af: {uid: '', de: '', ate: '', sit: ''}, _dlg: null
};
const getUsers = () => LS.get('bom_usuarios', []);
const setUsers = u => LS.set('bom_usuarios', u);
const getLogs = () => LS.get('bom_logs', []);
const setLogs = l => LS.set('bom_logs', l);
const prefsKey = () => 'bom_prefs_' + S.user.uid;
function loadPrefs() { const p = LS.get(prefsKey(), {}); Object.assign(S, {view: p.view || 'grid', sort: p.sort || 'name', dir: p.dir || 1}); }
function savePrefs() { LS.set(prefsKey(), {view: S.view, sort: S.sort, dir: S.dir}); }

/* ---------- dados de exemplo ---------- */
async function seed() {
  if (LS.get('bom_seed_v1', false)) return;
  const now = Date.now(), D = 864e5;
  const mk = async (nome, email, senha, perfil, ativo, dias) => ({uid: 'u-' + uid(), nome, email, senhaHash: await hashPw(senha), perfil, ativo, dataCadastro: new Date(now - dias * D).toISOString(), dispositivos: []});
  const admin = await mk('Administrador BOM!', 'admin@bom.app', 'admin123', 'admin', true, 30);
  const ana = await mk('Ana Souza', 'ana@bom.app', '123456', 'usuario', true, 20);
  const bruno = await mk('Bruno Lima', 'bruno@bom.app', '123456', 'usuario', false, 15);
  const dv = [{idDispositivo: 'dev-demo-a', nomeDispositivo: 'Celular Android · Chrome', plataforma: 'Android'}, {idDispositivo: 'dev-demo-b', nomeDispositivo: 'Celular iOS · Safari', plataforma: 'iOS'}, {idDispositivo: 'dev-demo-c', nomeDispositivo: 'Computador Windows · Edge', plataforma: 'Windows'}];
  ana.dispositivos = [{...dv[0], ultimoAcesso: new Date(now - D).toISOString()}, {...dv[2], ultimoAcesso: new Date(now - 4 * D).toISOString()}];
  bruno.dispositivos = [{...dv[1], ultimoAcesso: new Date(now - 6 * D).toISOString()}];
  admin.dispositivos = [{...dv[2], ultimoAcesso: new Date(now - 2 * D).toISOString()}];
  const logs = [];
  const L = (u, d, dias, h, dur) => { const t = new Date(now - dias * D); t.setHours(h, (h * 7) % 60, 0, 0); logs.push({idLog: 'log-' + uid(), uid: u.uid, nomeUsuario: u.nome, idDispositivo: d.idDispositivo, nomeDispositivo: d.nomeDispositivo, dataLogin: t.toISOString(), horaLogout: new Date(t.getTime() + dur * 60000).toISOString(), situacao: 'encerrada'}); };
  L(ana, dv[0], 1, 9, 42); L(ana, dv[2], 4, 14, 95); L(ana, dv[0], 6, 20, 18); L(bruno, dv[1], 6, 11, 30); L(bruno, dv[1], 9, 16, 12); L(admin, dv[2], 2, 10, 25);
  setUsers([admin, ana, bruno]); setLogs(logs); LS.set('bom_seed_v1', true);
}
function seedFS() {
  const items = [], now = Date.now(), D = 864e5; let k = 0;
  const F = (name, parent, color = FOLDER_COLORS[0], extra = {}) => { const it = {id: uid(), type: 'folder', name, parent, color, created: now - (30 - k++) * D, ...extra}; it.modified = it.created; items.push(it); return it.id; };
  const P = (name, parent, size, pages, extra = {}) => { const it = {id: uid(), type: 'file', ext: 'pdf', name, parent, size, pages, source: 'sample', created: now - (40 - k++) * D, ann: [], ...extra}; it.modified = it.created + D; items.push(it); return it.id; };
  const tr = F('Trabalho', null), fa = F('Faculdade', null), pr = F('Projetos', null, FOLDER_COLORS[0], {fav: true}), pe = F('Pessoal', null), di = F('Diversos', null, FOLDER_COLORS[6]);
  P('Relatório.pdf', null, 2516582, 12, {fav: true, tag: 'amber', opened: now - 3600e3}); P('Resumo.pdf', null, 1153434, 5, {opened: now - 7200e3}); P('Artigo.pdf', null, 3984588, 18, {tag: 'blue'});
  P('Manual.pdf', null, 4404019, 4); P('Apresentação.pdf', null, 1677722, 8);
  ['Relatórios', 'Imagens', 'Modelos', 'Reuniões', 'Tarefas'].forEach(n => F(n, pr));
  P('Design.pdf', pr, 2202010, 6); P('Código.pdf', pr, 1782579, 9); P('Documentação.pdf', pr, 3040870, 14, {tag: 'green'});
  P('Contrato_Prestacao.pdf', tr, 845000, 4, {tag: 'red'}); P('Planilha_Custos.pdf', F('Financeiro', tr, FOLDER_COLORS[2]), 512000, 3);
  P('TCC_Capitulo1.pdf', fa, 1380000, 8, {tag: 'blue', fav: true}); P('Artigo_IA_Educacao.pdf', F('Artigos', fa, FOLDER_COLORS[1]), 960000, 5);
  P('Curriculo.pdf', pe, 230000, 2, {tag: 'purple'}); P('Boleto_Outubro.pdf', di, 98000, 1);
  return {v: 2, items};
}

/* ---------- sistema de arquivos local (por usuário) ---------- */
const fsKey = () => 'bom_fs2_' + S.user.uid;
function loadFS() { S.fs = LS.get(fsKey(), null); if (!S.fs) { S.fs = seedFS(); saveFS(); } }
function saveFS() { const ok = LS.set(fsKey(), S.fs); if (!ok) toast('Armazenamento cheio', {sub: 'A última alteração pode não ter sido salva.', err: true}); return ok; }
let _sv; const saveFSDebounced = () => { clearTimeout(_sv); _sv = setTimeout(saveFS, 600); };
const item = id => S.fs && S.fs.items.find(i => i.id === id);
function isTrashed(i) { let c = i, g = 0; while (c && g++ < 50) { if (c.trashed) return true; c = c.parent && item(c.parent); } return false; }
const alive = i => i && !isTrashed(i);
const children = p => S.fs.items.filter(i => (i.parent || null) === (p || null) && !i.trashed);
const countIn = id => children(id).length;
function pathOf(id) { const out = []; let c = id && item(id); while (c) { out.unshift(c); c = c.parent && item(c.parent); } return out; }
const pathStr = id => ['Início', ...pathOf(id).map(p => p.name)].join(' › ');
function descendants(id) { const out = []; for (const c of S.fs.items.filter(i => i.parent === id)) { out.push(c); if (c.type === 'folder') out.push(...descendants(c.id)); } return out; }
function folderTree(parent = null, depth = 0, skip = new Set()) { return children(parent).filter(i => i.type === 'folder' && !skip.has(i.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).flatMap(f => [{f, depth}, ...folderTree(f.id, depth + 1, skip)]); }
const folderName = id => id ? (item(id) || {}).name || 'pasta' : 'Início';
const touch = it => { it.modified = Date.now(); };
function cmp(a, b) {
  if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1;
  let r = 0;
  if (S.sort === 'date') r = (a.modified || a.created) - (b.modified || b.created);
  else if (S.sort === 'size') r = (a.type === 'folder' ? countIn(a.id) : a.size || 0) - (b.type === 'folder' ? countIn(b.id) : b.size || 0);
  else if (S.sort === 'type') r = (a.ext || '').localeCompare(b.ext || '');
  return (r || a.name.localeCompare(b.name, 'pt-BR', {numeric: true})) * S.dir;
}
function listItems() {
  const q = S.filter.trim().toLowerCase(); let L;
  if (S.section === 'trash') L = S.fs.items.filter(i => i.trashed);
  else if (q) L = S.fs.items.filter(i => alive(i) && i.name.toLowerCase().includes(q));
  else if (S.section === 'recent') L = S.fs.items.filter(i => i.type !== 'folder' && i.opened && alive(i)).sort((a, b) => b.opened - a.opened).slice(0, 40);
  else if (S.section === 'fav') L = S.fs.items.filter(i => i.fav && alive(i));
  else L = children(S.cwd);
  const f = S.tf;
  if (S.section !== 'trash' && f !== 'all') {
    const tagF = f.startsWith('tag:') ? f.slice(4) : null;
    L = L.filter(i => {
      if (i.type === 'folder') return f === 'fav' ? !!i.fav : tagF ? false : true;
      const k = kindOf(i);
      return f === 'pdf' ? k === 'pdf' : f === 'img' ? k === 'img' : f === 'other' ? k !== 'pdf' && k !== 'img' : f === 'fav' ? !!i.fav : i.tag === tagF;
    });
  }
  if (S.section !== 'recent') L.sort(cmp);
  return L;
}

/* ---------- conteúdo dos PDFs de exemplo ---------- */
const WORDS = 'o documento apresenta a análise dos resultados do período com foco em produtividade organização e acesso rápido aos arquivos a equipe definiu metas indicadores e prazos para cada etapa do projeto considerando requisitos funcionais prioridades e viabilidade técnica os dados foram coletados revisados e consolidados em relatórios mensais para apoiar a tomada de decisão das áreas envolvidas além disso foram registradas observações sobre melhorias de processo comunicação entre setores e uso de ferramentas digitais no dia a dia'.split(' ');
const SECS = ['Objetivos', 'Metodologia', 'Resultados', 'Discussão', 'Cronograma', 'Requisitos', 'Análise de dados', 'Recomendações', 'Anexos'];
const hashStr = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = seed => { let s = seed % 233280 || 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function sentence(r, n) { const w = []; for (let j = 0; j < n; j++) w.push(pick(r, WORDS)); const s = w.join(' '); return s[0].toUpperCase() + s.slice(1) + '.'; }
function para(r, ns = 3) { const out = []; for (let i = 0; i < ns + Math.floor(r() * 2); i++) out.push(sentence(r, 9 + Math.floor(r() * 7))); return out.join(' '); }
const titleOf = it => baseName(it.name).replace(/[_-]+/g, ' ');
function createdChunks(it) { const t = (it.content || '').trim() || ' '; const out = []; let rest = t; while (rest.length) { if (rest.length <= 1300) { out.push(rest); break; } let cut = rest.lastIndexOf(' ', 1300); if (cut < 600) cut = 1300; out.push(rest.slice(0, cut)); rest = rest.slice(cut).trim(); } return out; }
function blocksFor(it, p) {
  const b = [];
  if (it.source === 'created') {
    if (p === 1) { b.push({t: 'title', x: titleOf(it)}); b.push({t: 'sub', x: 'Criado no BOM! em ' + fmtD(it.created)}); }
    (createdChunks(it)[p - 1] || '').split(/\n+/).forEach(x => x.trim() && b.push({t: 'p', x}));
    return b;
  }
  const r = rng(hashStr(it.name) + p * 97), N = it.pages || 1;
  const bars = () => Array.from({length: 6}, (_, i) => clamp(.25 + i * .12 + (r() - .5) * .2, .15, 1));
  if (p === 1) {
    b.push({t: 'title', x: titleOf(it)});
    b.push({t: 'sub', x: `${pick(r, ['Relatório técnico', 'Documento de trabalho', 'Material de estudo', 'Versão final'])} · ${N} página${N > 1 ? 's' : ''}`});
    b.push({t: 'h', x: '1. Introdução'}); b.push({t: 'p', x: para(r)});
    b.push({t: 'pc', x: para(r, 2), chart: {k: 'bar', v: bars()}, cap: 'Figura 1 — Evolução no período'});
    b.push({t: 'p', x: para(r)});
    return b;
  }
  if (p === N && N > 2) {
    b.push({t: 'h', x: `${p}. Conclusão`}); b.push({t: 'p', x: para(r)});
    b.push({t: 'ul', items: [sentence(r, 7), sentence(r, 8), sentence(r, 6)]}); b.push({t: 'p', x: para(r)});
    return b;
  }
  b.push({t: 'h', x: `${p}. ${p === 2 ? 'Desenvolvimento' : pick(r, SECS)}`}); b.push({t: 'p', x: para(r)});
  const m = p % 3;
  if (m === 0) b.push({t: 'pc', x: para(r, 2), chart: {k: 'pie', v: [.42, .27, .19, .12].map(v => v + (r() - .5) * .06)}, cap: `Figura ${p} — Distribuição`});
  else if (m === 1) b.push({t: 'tbl', rows: [['Indicador', 'Meta', 'Resultado'], ...['Entregas', 'Prazo médio', 'Satisfação', 'Retrabalho'].map(n => [n, Math.round(60 + r() * 40) + '%', Math.round(50 + r() * 50) + '%'])]});
  else b.push({t: 'pc', x: para(r, 2), chart: {k: 'bar', v: bars()}, cap: `Figura ${p} — Comparativo`});
  b.push({t: 'p', x: para(r)}); b.push({t: 'p', x: para(r, 2)});
  return b;
}
function barSVG(v) { const w = 200, h = 110, n = v.length, bw = w / n * .62; return `<svg viewBox="0 0 ${w} ${h}" class="chart"><path d="M0 ${h - 1}H${w}" stroke="#d5dceb" stroke-width="1.2"/>${[.25, .5, .75].map(y => `<path d="M0 ${h * y}H${w}" stroke="#eef2f8" stroke-width="1"/>`).join('')}${v.map((x, i) => { const bh = x * (h - 12); return `<rect x="${(i * (w / n) + (w / n - bw) / 2).toFixed(1)}" y="${(h - 1 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${i === n - 1 ? '#1f6fe0' : i > n - 3 ? '#3b8cf0' : '#7fb5ff'}"/>`; }).join('')}</svg>`; }
function pieSVG(v) { const t = v.reduce((a, b) => a + b, 0), cols = ['#1f6fe0', '#5aa2ff', '#9cc6ff', '#d3e5ff']; let a0 = -Math.PI / 2, out = ''; v.forEach((x, i) => { const a1 = a0 + x / t * Math.PI * 2, L = a1 - a0 > Math.PI ? 1 : 0; out += `<path d="M60 60L${(60 + 50 * Math.cos(a0)).toFixed(2)} ${(60 + 50 * Math.sin(a0)).toFixed(2)}A50 50 0 ${L} 1 ${(60 + 50 * Math.cos(a1)).toFixed(2)} ${(60 + 50 * Math.sin(a1)).toFixed(2)}Z" fill="${cols[i % 4]}" stroke="#fff" stroke-width="1.5"/>`; a0 = a1; }); return `<svg viewBox="0 0 120 120" class="chart" style="max-width:78%;margin:0 auto">${out}</svg>`; }
function hlText(escaped, term) { if (!term) return escaped; const t = esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return escaped.replace(new RegExp(t, 'gi'), m => `<mark>${m}</mark>`); }
function pageHTML(it, p, term) {
  const T = s => hlText(esc(s), term);
  return blocksFor(it, p).map(b => b.t === 'title' ? `<h1>${T(b.x)}</h1>` : b.t === 'sub' ? `<p class="sub">${T(b.x)}</p>` : b.t === 'h' ? `<h3>${T(b.x)}</h3>`
    : b.t === 'pc' ? `<div class="pcrow"><p>${T(b.x)}</p><figure>${b.chart.k === 'pie' ? pieSVG(b.chart.v) : barSVG(b.chart.v)}<figcaption>${T(b.cap)}</figcaption></figure></div>`
    : b.t === 'tbl' ? `<table class="ptbl">${b.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${T(c)}</td>` : `<th>${T(c)}</th>`).join('')}</tr>`).join('')}</table>`
    : b.t === 'ul' ? `<ul>${b.items.map(x => `<li>${T(x)}</li>`).join('')}</ul>` : `<p>${T(b.x)}</p>`).join('');
}
const blockText = b => b.x ? b.x + (b.cap ? ' ' + b.cap : '') : b.rows ? b.rows.flat().join(' ') : (b.items || []).join(' ');

/* ---------- autenticação, dispositivo e log de acesso ---------- */
function deviceInfo() {
  let id = LS.get('bom_device', null); if (!id) { id = 'dev-' + uid(); LS.set('bom_device', id); }
  const ua = navigator.userAgent;
  const plat = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Outro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return {idDispositivo: id, nomeDispositivo: `${/Mobi|Android|iPhone|iPad/i.test(ua) ? 'Celular' : 'Computador'} ${plat} · ${nav}`, plataforma: plat};
}
async function doLogin(fd) {
  const email = String(fd.get('email') || '').trim().toLowerCase(), senha = String(fd.get('senha') || '');
  const u = getUsers().find(x => x.email === email);
  const fail = m => { S.loginErr = m; const e = $('#login-err'); if (e) e.textContent = m; };
  if (!u || u.senhaHash !== await hashPw(senha)) return fail('E-mail ou senha incorretos.');
  if (!u.ativo) return fail('Esta conta está desativada. Fale com o administrador.');
  if (S.adminIntent && u.perfil !== 'admin') return fail('Esta conta não tem perfil de administrador.');
  if (fd.get('lembrar')) { LS.set('bom_lembrar', {email, senha}); LS.del('bom_lembrar_off'); } else { LS.del('bom_lembrar'); LS.set('bom_lembrar_off', true); }
  startSession(u, S.adminIntent ? 'admin' : 'app');
}
async function doCadastro(fd) {
  const nome = String(fd.get('nome') || '').trim(), email = String(fd.get('email') || '').trim().toLowerCase(), senha = String(fd.get('senha') || ''), conf = String(fd.get('conf') || '');
  const fail = m => { $('#cad-err').textContent = m; };
  if (nome.length < 3) return fail('Informe seu nome completo.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Informe um e-mail válido.');
  if (senha.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.');
  if (senha !== conf) return fail('As senhas não conferem.');
  const users = getUsers();
  if (users.some(x => x.email === email)) return fail('Já existe uma conta com este e-mail.');
  const u = {uid: 'u-' + uid(), nome, email, senhaHash: await hashPw(senha), perfil: 'usuario', ativo: true, dataCadastro: new Date().toISOString(), dispositivos: []};
  users.push(u); setUsers(users); LS.set('bom_lembrar', {email, senha}); LS.del('bom_lembrar_off');
  startSession(u, 'app');
}
function startSession(u, area) {
  const d = deviceInfo(), now = new Date().toISOString(), users = getUsers(), uu = users.find(x => x.uid === u.uid);
  uu.dispositivos = uu.dispositivos || [];
  let dv = uu.dispositivos.find(x => x.idDispositivo === d.idDispositivo); if (!dv) { dv = {...d}; uu.dispositivos.push(dv); }
  dv.nomeDispositivo = d.nomeDispositivo; dv.ultimoAcesso = now; setUsers(users);
  const log = {idLog: 'log-' + uid(), uid: uu.uid, nomeUsuario: uu.nome, idDispositivo: d.idDispositivo, nomeDispositivo: d.nomeDispositivo, dataLogin: now, horaLogout: null, situacao: 'ativa'};
  const logs = getLogs(); logs.push(log); setLogs(logs);
  LS.set('bom_session', {uid: uu.uid, logId: log.idLog, area});
  S.user = uu; S.loginErr = ''; loadFS(); loadPrefs(); Object.assign(S, {cwd: null, section: 'files', screen: area === 'admin' ? 'admin' : 'home'});
  render(); toast(`Olá, ${esc(uu.nome.split(' ')[0])}!`, {sub: 'Sessão salva neste aparelho'});
}
function closeLog(logId) { const logs = getLogs(), l = logs.find(x => x.idLog === logId); if (l && !l.horaLogout) { l.horaLogout = new Date().toISOString(); l.situacao = 'encerrada'; setLogs(logs); } }
function logout() {
  const s = LS.get('bom_session', null); if (s) closeLog(s.logId);
  LS.del('bom_session');
  Object.assign(S, {user: null, fs: null, open: [], floats: [], split: [], select: false, filter: '', searchOpen: false, screen: 'login', adminIntent: false, hist: {}, find: null});
  S.sel.clear(); closeSheet(); render(); toast('Você saiu', {sub: 'A hora de logout foi gravada no log'});
}

/* ---------- interface: toast, folhas, menus ---------- */
let _tt;
function toast(msg, o = {}) {
  const t = $('#toast');
  t.innerHTML = `<span class="okc" style="${o.err ? 'background:var(--danger)' : ''}">${ic(o.err ? 'info' : 'check', 16)}</span><div class="tt"><span>${msg}</span>${o.sub ? `<small>${o.sub}</small>` : ''}</div>${o.label ? `<button class="tact">${esc(o.label)}</button>` : ''}<button class="tx" aria-label="Fechar">${ic('close', 16)}</button>`;
  if (o.label) t.querySelector('.tact').onclick = () => { t.classList.remove('show'); o.fn(); };
  t.querySelector('.tx').onclick = () => t.classList.remove('show');
  t.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), o.label ? 4500 : 2800);
}
function openSheet(html, onMount) {
  closeSheet(); const o = $('#overlay');
  o.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="sheet">${html}</div>`;
  o.classList.add('show'); onMount && onMount(o.querySelector('.sheet'));
}
function openPop(anchor, html, w = 236) {
  closeSheet(); const o = $('#overlay'), ph = $('.phone').getBoundingClientRect(), a = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  o.innerHTML = `<div class="backdrop clear" data-act="closeSheet"></div><div class="pop" style="width:${w}px">${html}</div>`; o.classList.add('show');
  const p = o.querySelector('.pop'), H = p.offsetHeight;
  let left = a.right - ph.left - 18; if (left + w > ph.width - 8) left = a.left - ph.left - w + 18; left = clamp(left, 8, ph.width - w - 8);
  let top = a.top - ph.top + 14; top = clamp(top, 8, Math.max(8, ph.height - H - 10));
  p.style.left = left + 'px'; p.style.top = top + 'px';
}
function openDrawer() {
  closeSheet(); const o = $('#overlay'); o.innerHTML = `<div class="backdrop" data-act="closeSheet"></div>${drawerHTML()}`; o.classList.add('show');
  fillStorage();
}
function fillStorage() {
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const m = $('.drawer .meter i') || $('.side .meter i'), l = $('#stq'); if (m && e.quota) { m.style.width = clamp(e.usage / e.quota * 100, 2, 100) + '%'; if (l) l.textContent = `${fmtSize(e.usage || 0)} de ${fmtSize(e.quota)} disponíveis no navegador`; } }).catch(() => {});
}
function closeSheet() { const f = S._dlg; S._dlg = null; const o = $('#overlay'); o.classList.remove('show'); o.innerHTML = ''; f && f(null); }
function resolveDlg(v) { const f = S._dlg; S._dlg = null; closeSheet(); f && f(v); }
const dialog = (html, onMount) => new Promise(res => { openSheet(html, onMount); S._dlg = res; });
function askText(title, {value = '', placeholder = '', ok = 'Salvar', multi = false, type = 'text'} = {}) {
  return dialog(`<h3>${esc(title)}</h3>${multi ? `<textarea id="dlg-in" rows="4" placeholder="${esc(placeholder)}"></textarea>` : `<input type="${type}" id="dlg-in" placeholder="${esc(placeholder)}">`}
    <div class="row-btns"><button class="btn ghost" data-act="closeSheet">Cancelar</button><button class="btn" data-act="dlgResolve" data-val="__input">${esc(ok)}</button></div>`,
    s => { const i = s.querySelector('#dlg-in'); i.value = value; setTimeout(() => { i.focus(); if (!multi && type === 'text') { const e = value.lastIndexOf('.'); try { i.setSelectionRange(0, e > 0 ? e : value.length); } catch (_) {} } }, 60); if (!multi) i.onkeydown = e => { if (e.key === 'Enter') resolveDlg(i.value); }; });
}
const askConfirm = (title, msg, ok = 'Confirmar', danger = true) => dialog(`<h3>${esc(title)}</h3><p class="muted" style="line-height:1.5">${msg}</p><div class="row-btns"><button class="btn ghost" data-act="closeSheet">Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-act="dlgResolve" data-val="1">${esc(ok)}</button></div>`);
const pickFolder = (title, skip = new Set()) => dialog(`<h3>${esc(title)}</h3><div class="plist"><button class="prow" data-act="dlgResolve" data-val="root">${ic('folder')} Início (raiz)</button>${folderTree(null, 0, skip).map(({f, depth}) => `<button class="prow" style="padding-left:${14 + depth * 20}px" data-act="dlgResolve" data-val="${f.id}">${folderSvg(f.color, 26)} ${esc(f.name)}</button>`).join('')}</div><button class="btn ghost block" data-act="closeSheet">Cancelar</button>`);
const pi = (icn, label, act, attrs = '', cls = '', chev = false) => `<button class="pi ${cls}" data-act="${act}" ${attrs}>${typeof icn === 'string' && icn.startsWith('<') ? icn : ic(icn, 20)}<span>${label}</span>${chev ? `<span class="chev">${ic('chevR', 16)}</span>` : ''}</button>`;
const mi = (icn, l, act, attrs = '', cls = '') => `<button class="mi ${cls}" data-act="${act}" ${attrs}>${ic(icn)}<span>${l}</span></button>`;

/* ---------- telas: acesso ---------- */
function vLogin() {
  const rem = LS.get('bom_lembrar', null), adm = S.adminIntent, chk = rem || !LS.get('bom_lembrar_off', false);
  const feats = [['folder', 'Pastas, favoritos, etiquetas e lixeira'], ['move', 'Arraste e solte para organizar'], ['annotate', 'Anote, realce e assine seus PDFs'], ['layers', 'Abas, tela dividida e janelas flutuantes']];
  return `<div class="screen"><div class="scroll"><div class="auth">
    <section class="auth-hero">${logo(isDesk() ? 360 : 250)}<p class="tag">${adm ? 'Área do administrador · acesso via desktop' : 'Seus PDFs organizados, em qualquer lugar.'}</p>
      <ul class="feats">${feats.map(([i, t]) => `<li>${ic(i, 20)}<span>${t}</span></li>`).join('')}</ul></section>
    <section class="auth-card"><h2 class="auth-h">${adm ? 'Entrar no painel' : 'Entrar'}</h2>
    ${rem ? `<div class="remember">${ic('shield', 20)}<span>Dados de acesso salvos para <b>${esc(rem.email)}</b></span></div>` : ''}
    <form class="form" data-form="login" autocomplete="on">
      <label>E-mail<input name="email" type="email" autocomplete="username" required value="${esc(rem?.email || '')}" placeholder="voce@email.com"></label>
      <label>Senha<div class="pw"><input name="senha" type="password" autocomplete="current-password" required value="${esc(rem?.senha || '')}" placeholder="••••••"><button type="button" class="eye" data-act="togglePw">${ic('eye', 20)}</button></div></label>
      <label class="chk-l"><input type="checkbox" name="lembrar" ${chk ? 'checked' : ''}> Lembrar e-mail e senha neste aparelho</label>
      <div class="err" id="login-err">${esc(S.loginErr)}</div>
      <button class="btn block" type="submit">${adm ? 'Entrar no painel' : 'Entrar'}</button>
    </form>
    ${adm ? `<button class="link center" data-act="toApp">← Voltar ao login do app</button>`
      : `<p class="muted center" style="margin:0">Não tem conta? <button class="link" data-act="go" data-to="cadastro">Cadastre-se</button></p><button class="link small center" data-act="toAdmin">Área do administrador</button>`}
    <details class="demo"><summary>Contas de teste</summary><p>Usuário: <code>ana@bom.app</code> / <code>123456</code><br>Admin: <code>admin@bom.app</code> / <code>admin123</code><br>Desativada: <code>bruno@bom.app</code> / <code>123456</code></p></details>
  </section></div></div></div>`;
}
function vCadastro() {
  return `<div class="screen"><div class="scroll"><div class="auth">
    <section class="auth-hero hero-sm">${logo(isDesk() ? 300 : 170)}<p class="tag">Crie sua conta para organizar seus PDFs.</p></section>
    <section class="auth-card"><div class="auth-back"><button class="ib" data-act="go" data-to="login" aria-label="Voltar">${ic('arrowL')}</button><h2 class="auth-h" style="margin:0">Criar conta</h2></div>
    <form class="form" data-form="cadastro">
    <label>Nome completo<input name="nome" type="text" autocomplete="name" required></label>
    <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
    <label>Senha<div class="pw"><input name="senha" type="password" autocomplete="new-password" required minlength="6"><button type="button" class="eye" data-act="togglePw">${ic('eye', 20)}</button></div></label>
    <label>Confirmar senha<input name="conf" type="password" autocomplete="new-password" required></label>
    <div class="err" id="cad-err"></div>
    <button class="btn block" type="submit">Cadastrar e entrar</button>
    <p class="muted small center">Sem cadastro não há acesso ao app. Seu e-mail e senha ficam salvos neste aparelho para o próximo acesso.</p>
  </form></section></div></div></div>`;
}

/* ---------- gaveta lateral ---------- */
function drawerHTML(cls = 'drawer') {
  const u = S.user, items = S.fs.items, used = items.filter(i => !i.trashed && i.type !== 'folder').reduce((a, b) => a + (b.size || 0), 0);
  const nOpen = openDocList().length, nTrash = items.filter(i => i.trashed).length, nFav = items.filter(i => i.fav && alive(i)).length;
  const d = (icn, l, act, attrs, on, badge) => `<button class="di ${on ? 'on' : ''}" data-act="${act}" ${attrs}>${ic(icn)}<span>${l}</span>${badge ? `<em>${badge}</em>` : ''}</button>`;
  const home = S.screen === 'home';
  return `<aside class="${cls}"><div class="dlogo">${logo(cls === 'side' ? 132 : 118)}</div>${cls === 'side' ? `<button class="btn newbtn" data-act="fab">${ic('plus', 20)} Novo</button>` : ''}<div class="dprof"><div class="avatar">${esc(u.nome.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase())}</div><div><b class="ell">${esc(u.nome)}</b><small class="ell">${esc(u.email)}</small></div></div>
    ${d('folder', 'Meus Arquivos', 'sec', 'data-sec="files"', home && S.section === 'files')}${d('clock', 'Recentes', 'sec', 'data-sec="recent"', home && S.section === 'recent')}
    ${d('star', 'Favoritos', 'sec', 'data-sec="fav"', home && S.section === 'fav', nFav)}${d('layers', 'Arquivos abertos', 'go', 'data-to="abertos"', S.screen === 'abertos', nOpen)}
    ${d('trash', 'Lixeira', 'sec', 'data-sec="trash"', home && S.section === 'trash', nTrash)}<div class="dsep"></div>
    ${d('shield', 'Meus acessos', 'go', 'data-to="acessos"', S.screen === 'acessos')}${d('user', 'Conta', 'go', 'data-to="conta"', S.screen === 'conta')}
    ${u.perfil === 'admin' ? d('users', 'Painel do administrador', 'go', 'data-to="admin"') : ''}${d('logout', 'Sair', 'logout', '')}
    <div class="storage"><span>${fmtSize(used)} em arquivos neste aparelho</span><div class="meter"><i style="width:4%"></i></div><small id="stq"></small></div></aside>`;
}

/* ---------- tela principal: Meus Arquivos ---------- */
function tileHTML(i) {
  const sel = S.sel.has(i.id), fl = S.flash.includes(i.id), tg = tagOf(i.tag), folder = i.type === 'folder';
  const sub = S.section === 'trash' ? `Excluído ${fmtD(i.trashedAt || Date.now())}` : folder ? `${countIn(i.id)} ${countIn(i.id) === 1 ? 'item' : 'itens'}` : fmtSize(i.size || 0);
  const showPath = !!(S.filter.trim() || S.section === 'recent' || S.section === 'fav');
  const drop = folder && S.section !== 'trash' ? `data-drop="${i.id}"` : '';
  const chk = S.select ? `<span class="chk">${sel ? ic('check', 13) : ''}</span>` : '';
  if (S.view === 'list') return `<div class="row ${sel ? 'sel' : ''} ${fl ? 'flash' : ''}" data-tile="${i.id}" ${drop}>${chk}${iconOf(i, 38)}<div class="rmeta"><div class="rname">${esc(i.name)}</div><div class="rsub">${sub}${folder ? '' : ' · ' + fmtD(i.modified || i.created)}${showPath ? ' · ' + esc(pathStr(i.parent)) : ''}</div></div>${tg ? `<i class="tdot" style="background:${tg.c}" title="${tg.name}"></i>` : ''}${i.fav ? `<span class="fav">${ic('starF', 16)}</span>` : ''}${S.select ? '' : `<button class="ib sm" data-act="itemMenu" data-id="${i.id}" aria-label="Opções">${ic('more', 20)}</button>`}</div>`;
  return `<div class="tile ${sel ? 'sel' : ''} ${fl ? 'flash' : ''}" data-tile="${i.id}" ${drop} title="${esc(showPath ? pathStr(i.parent) : i.name)}">${i.fav ? `<span class="fav">${ic('starF', 14)}</span>` : ''}${chk}<div class="ticon">${iconOf(i, 46)}</div><div class="tname">${esc(i.name)}</div><div class="tsub">${tg ? `<i class="tdot" style="background:${tg.c}"></i>` : ''}${sub}</div></div>`;
}
function openDocList() { return [...new Set([...S.open, ...S.floats.map(f => f.doc)])].filter(id => alive(item(id))); }
function openPanelHTML() {
  const docs = openDocList(); if (!docs.length || S.section === 'trash' || S.select) return '';
  return `<div class="opanel"><button class="ophead" data-act="togglePanel"><span>Arquivos abertos (${docs.length})</span>${ic(S.openPanel ? 'chevUp' : 'chevDown', 20)}</button>
    ${S.openPanel ? docs.map(id => { const it = item(id), w = S.floats.some(f => f.doc === id); return `<div class="oprow" data-act="resume" data-id="${id}">${fileIcon(it, 24)}<span class="ell">${esc(it.name)}</span><small>${w ? 'janela' : 'aba'} · pág. ${S.pos[id] || it.lastPage || 1}</small><button class="ib sm" data-act="closeDoc" data-id="${id}" aria-label="Fechar">${ic('close', 18)}</button></div>`; }).join('') : ''}</div>`;
}
function vHome() {
  const sec = S.section, q = S.filter.trim(), cur = sec === 'files' && S.cwd && !q ? item(S.cwd) : null;
  if (sec === 'files' && S.cwd && !alive(item(S.cwd))) S.cwd = null;
  const L = listItems(), folders = L.filter(i => i.type === 'folder'), files = L.filter(i => i.type !== 'folder');
  const secTitle = {files: 'Meus Arquivos', recent: 'Recentes', fav: 'Favoritos', trash: 'Lixeira'}[sec];
  let bar;
  if (S.select) bar = `<header class="appbar sel"><button class="ib" data-act="toggleSelect" aria-label="Cancelar seleção">${ic('close')}</button><div class="ttl"><b>${S.sel.size} selecionado${S.sel.size === 1 ? '' : 's'}</b></div><button class="ib" data-act="selMove" ${S.sel.size ? '' : 'disabled'} aria-label="Mover">${ic('move')}</button><button class="ib" data-act="selMore" aria-label="Mais">${ic('more')}</button></header>`;
  else bar = `<header class="appbar">${cur ? `<button class="ib" data-act="up" data-drop="${cur.parent || 'root'}" data-spring="1" aria-label="Voltar">${ic('arrowL')}</button>` : `<button class="ib drawer-btn" data-act="drawer" aria-label="Menu">${ic('menu')}</button>`}
    <div class="ttl">${cur ? `<b>${esc(cur.name)}</b>` : q ? '<b>Busca</b>' : sec !== 'files' ? `<b>${secTitle}</b>` : ''}</div>
    <button class="ib mob-only ${S.searchOpen ? 'on' : ''}" data-act="toggleSearch" aria-label="Buscar">${ic('search')}</button>${sec === 'files' ? `<button class="chip desk-only" data-act="newFolder">${ic('newfolder', 16)} Nova pasta</button><button class="chip desk-only" data-act="importFile">${ic('upload', 16)} Importar</button>` : ''}<button class="ib" data-act="homeMore" aria-label="Mais opções">${ic('more')}</button></header>`;
  const search = (S.searchOpen || isDesk()) && !S.select ? `<div class="searchrow">${ic('search', 18)}<input id="q" placeholder="Buscar em todas as pastas…" value="${esc(S.filter)}" autocomplete="off">${S.filter ? `<button class="ib sm" data-act="closeSearch">${ic('close', 18)}</button>` : ''}</div>` : '';
  const big = !cur && !q && !S.select && !S.searchOpen && sec === 'files' ? `<h1 class="bigtitle">Meus Arquivos</h1>` : '';
  const chip = (v, l, dot) => `<button class="chip ${S.tf === v ? 'on' : ''}" data-act="tf" data-v="${v}">${dot ? `<i class="tdot" style="background:${dot}"></i>` : ''}${l}</button>`;
  const chips = sec === 'trash' || S.select ? '' : `<div class="chips"><button class="chip" data-act="sortMenu">${ic('sort', 15)} ${SORTS[S.sort]} ${S.dir > 0 ? '↑' : '↓'}</button><button class="chip" data-act="toggleView" aria-label="Alternar grade/lista">${ic(S.view === 'grid' ? 'list' : 'grid', 15)}</button>${chip('all', 'Todos')}${chip('pdf', 'PDFs')}${chip('img', 'Imagens')}${chip('other', 'Outros')}${chip('fav', '★ Favoritos')}${TAGS.map(t => chip('tag:' + t.id, t.name, t.c)).join('')}</div>`;
  const crumbs = cur ? `<nav class="crumbs">${[{id: 'root', name: 'Início'}, ...pathOf(S.cwd)].map((c, i, a) => `<button class="crumb ${i === a.length - 1 ? 'cur' : ''}" data-act="goFolder" data-id="${c.id}" ${i < a.length - 1 ? `data-drop="${c.id}"` : ''}>${esc(c.name)}</button>`).join('<span>›</span>')}</nav>` : '';
  const wrap = arr => S.view === 'list' ? `<div class="list">${arr.map(tileHTML).join('')}</div>` : `<div class="grid">${arr.map(tileHTML).join('')}</div>`;
  const emptyMsg = {files: q ? 'Nada encontrado para essa busca.' : S.tf !== 'all' ? 'Nenhum item com esse filtro aqui.' : 'Esta pasta está vazia.<br>Toque em <b>+</b> para importar ou criar arquivos, ou arraste arquivos para cá.', recent: 'Os arquivos que você abrir aparecem aqui.', fav: 'Marque arquivos e pastas com ★ para encontrá-los aqui.', trash: 'A lixeira está vazia.'}[sec];
  const body = L.length ? (S.view === 'list' ? wrap(L) : wrap(L)) : `<div class="empty">${emptyMsg}</div>`;
  const trashNote = sec === 'trash' && L.length ? `<div class="chips"><span class="muted small" style="align-self:center">Toque em um item para restaurar.</span><button class="chip danger" data-act="emptyTrash">${ic('trash', 15)} Esvaziar lixeira</button></div>` : '';
  const bottom = S.select ? `<div class="actbar"><button data-act="selOpen" ${S.sel.size ? '' : 'disabled'}>${ic('openDoc')}<span>Abrir</span></button><button data-act="selShare" ${S.sel.size ? '' : 'disabled'}>${ic('share')}<span>Compartilhar</span></button><button data-act="selMove" ${S.sel.size ? '' : 'disabled'}>${ic('move')}<span>Mover</span></button><button data-act="selDelete" ${S.sel.size ? '' : 'disabled'}>${ic('trash')}<span>Excluir</span></button></div>`
    : sec === 'files' ? `<button class="fab" data-act="fab" aria-label="Adicionar">${ic('plus', 28)}</button>` : '';
  return `<div class="screen home">${bar}${search}${big}${chips}${trashNote}${crumbs}<div class="scroll" id="home-scroll">${body}${openPanelHTML()}<div style="height:${S.select ? 100 : 96}px"></div></div>${bottom}</div>`;
}

/* ---------- leitor ---------- */
function splitIds() { let a = (S.split || []).filter(id => S.open.includes(id)); for (const id of S.open) { if (a.length >= 2) break; if (!a.includes(id)) a.push(id); } S.split = a; return a.length < 2 ? [a[0], null] : a.slice(0, 2); }
function curDoc() { if (S.screen !== 'viewer') return null; return item(S.layout === 'split' ? S.focusDoc : S.active); }
const HINTS = {hl: 'Arraste o dedo sobre o texto para realçar.', note: 'Toque onde quer deixar um comentário.', text: 'Toque onde quer inserir o texto.', pen: 'Desenhe livremente sobre a página.', erase: 'Toque em uma anotação para apagá-la.'};
function toolbarHTML(it) {
  const k = kindOf(it), b = (act, attrs, icn, l, on, cls = '') => `<button class="${on ? 'on' : ''} ${cls}" data-act="${act}" ${attrs}>${icn.startsWith('<') ? icn : ic(icn)}<span>${l}</span></button>`;
  if (k === 'txt') return `<div class="vtools">${b('findOpen', '', 'search', 'Buscar')}${b('shareCur', '', 'share', 'Compartilhar')}${b('viewerMenu', '', 'dots', 'Mais')}</div>`;
  if (S.vmode === 'annot') return `<div class="vtools">${b('tool', 'data-t="hand"', 'hand', 'Mover', S.tool === 'hand')}${b('tool', 'data-t="note"', 'note', 'Nota', S.tool === 'note')}${b('tool', 'data-t="hl"', 'hl', 'Realçar', S.tool === 'hl')}${b('tool', 'data-t="pen"', 'pen', 'Caneta', S.tool === 'pen')}${b('tool', 'data-t="erase"', 'eraser', 'Borracha', S.tool === 'erase')}${b('penColor', '', `<i class="cdot" style="background:${S.penColor}"></i>`, 'Cor')}${b('vmode', 'data-m="main"', 'check', 'Concluir', false, 'done')}</div>`;
  if (S.vmode === 'edit') return `<div class="vtools">${b('tool', 'data-t="hand"', 'hand', 'Mover', S.tool === 'hand')}${b('tool', 'data-t="text"', 'text', 'Texto', S.tool === 'text')}${b('addImg', '', 'image', 'Imagem')}${b('addSign', '', 'sign', 'Assinatura')}${b('vmode', 'data-m="main"', 'check', 'Concluir', false, 'done')}</div>`;
  return `<div class="vtools">${b('vmode', 'data-m="annot"', 'annotate', 'Anotar')}${b('vmode', 'data-m="edit"', 'edit', 'Editar')}${b('shareCur', '', 'share', 'Compartilhar')}${b('viewerMenu', '', 'dots', 'Mais')}</div>`;
}
function vViewer() {
  S.open = S.open.filter(id => alive(item(id)));
  if (!S.open.length) { S.screen = 'home'; return vHome(); }
  if (!S.open.includes(S.active)) S.active = S.open[0];
  const split = S.layout === 'split', ids = split ? splitIds() : null;
  if (split) { if (!ids.includes(S.focusDoc)) S.focusDoc = ids[0]; } else S.focusDoc = S.active;
  const it = item(S.active), fd = item(S.focusDoc) || it, h = S.hist[fd.id];
  const bar = `<header class="appbar vbar"><button class="ib" data-act="go" data-to="home" aria-label="Voltar">${ic('arrowL')}</button><div class="ttl"><b>${split ? 'Tela dividida' : esc(it.name)}</b><small id="vsub">${split ? 'Toque em um painel para editá-lo' : ''}</small></div>
    ${split ? `<button class="ib" data-act="splitDir" aria-label="Orientação">${ic(S.splitDir === 'cols' ? 'rows' : 'cols')}</button><button class="ib on" data-act="toggleSplit" aria-label="Sair da tela dividida">${ic('split')}</button>` : ''}
    <button class="ib" data-act="undo" ${h && h.u.length ? '' : 'disabled'} aria-label="Desfazer">${ic('undo')}</button><button class="ib" data-act="redo" ${h && h.r.length ? '' : 'disabled'} aria-label="Refazer">${ic('redo')}</button><button class="ib" data-act="viewerMenu" aria-label="Mais">${ic('more')}</button></header>`;
  const tabs = `<div class="tabs">${S.open.map(id => `<div class="tab ${id === S.active && !split ? 'on' : ''}" data-act="tab" data-id="${id}">${fileIcon(item(id), 18)}<span class="ell">${esc(item(id).name)}</span><button data-act="closeTab" data-id="${id}" aria-label="Fechar aba">${ic('close', 14)}</button></div>`).join('')}<button class="tab add" data-act="addTab" aria-label="Abrir outro">${ic('plus', 16)}</button></div>`;
  const hint = HINTS[S.tool] && S.vmode !== 'main' ? `<div class="hint">${ic(S.tool === 'erase' ? 'eraser' : S.tool === 'pen' ? 'pen' : S.tool, 16)}<span>${HINTS[S.tool]}</span></div>` : S.find && (split ? ids.includes(S.find.doc) : S.find.doc === it.id) ? `<div class="hint">${ic('search', 16)}<span>Buscando “${esc(S.find.term)}”</span><button data-act="findClear">Limpar</button></div>` : '';
  if (split) {
    return `<div class="screen viewer">${bar}${tabs}<div class="vwrap ${S.night ? 'night' : ''}">${hint}<div class="split ${S.splitDir}">${ids.map((id, k) => id ? `<section class="pane ${id === S.focusDoc ? 'focus' : ''}" data-pane="${k}"><div class="pane-h"><div class="pn">${fileIcon(item(id), 18)}<span class="ell">${esc(item(id).name)}</span>${ic('chevDown', 14)}<select data-pane-sel="${k}" aria-label="Trocar documento">${S.open.map(o => `<option value="${o}" ${o === id ? 'selected' : ''}>${esc(item(o).name)}</option>`).join('')}</select></div><button class="ib xs" data-act="closePane" data-k="${k}" aria-label="Fechar painel">${ic('close', 14)}</button></div>
      <div class="doc-scroll tool-${S.tool}" data-doc="${id}" data-edit="1" data-pane-i="${k}"><div class="pages"></div></div><div class="pane-f"><button data-act="pgp" data-k="${k}" data-d="-1">${ic('arrowL', 16)}</button><span id="pc${k}">–</span><button data-act="pgp" data-k="${k}" data-d="1">${ic('arrowR', 16)}</button></div></section>`
      : `<section class="pane empty-pane"><p>Abra outro arquivo para comparar</p><button class="btn sm" data-act="addTab">Abrir arquivo</button></section>`).join('')}</div></div>${toolbarHTML(fd)}</div>`;
  }
  const rail = isDesk() && kindOf(it) === 'pdf' && (it.pages || 1) > 1 ? `<nav class="rail" id="rail">${Array.from({length: it.pages || 1}, (_, i) => `<button class="rp" data-act="railGo" data-p="${i + 1}"><div class="page" data-rp="${i + 1}"><div class="pc ${it.source === 'idb' ? 'cv' : ''}">${it.source === 'idb' ? '' : pageHTML(it, i + 1)}</div></div><span>${i + 1}</span></button>`).join('')}</nav>` : '';
  return `<div class="screen viewer">${bar}${tabs}<div class="vbody">${rail}<div class="vwrap ${S.night ? 'night' : ''}">${hint}<div class="doc-scroll tool-${S.tool}" data-doc="${it.id}" data-edit="1" data-main="1"><div class="pages"></div></div>
    ${kindOf(it) !== 'txt' ? `<div class="zoomctl"><button data-act="zoom" data-d="1" aria-label="Aproximar">+</button><button id="zl" data-act="zoomFit">${Math.round(S.zoom * 100)}%</button><button data-act="zoom" data-d="-1" aria-label="Afastar">−</button></div>` : ''}</div></div>
    <div class="pagerbar"><button data-act="pg" data-d="-1" aria-label="Página anterior">${ic('arrowL', 20)}</button><button class="pgl" id="pgl" data-act="gotoPage">– / –</button><button data-act="pg" data-d="1" aria-label="Próxima página">${ic('arrowR', 20)}</button></div>
    ${toolbarHTML(it)}</div>`;
}
function railMark(p) { const r = $('#rail'); if (!r) return; $$('.rp', r).forEach(b => { const on = +b.dataset.p === p; if (on && !b.classList.contains('on')) b.scrollIntoView({block: 'nearest'}); b.classList.toggle('on', on); }); }
async function mountRail(it) {
  const r = $('#rail'); if (!r || it.source !== 'idb') return;
  try { const pdf = await getPdf(it.id); for (const pg of $$('.page', r)) { if (!pg.isConnected) break; await renderPdfPage(pdf, +pg.dataset.rp, pg); } } catch (e) {}
}
function mountViewer() {
  const ri = item(S.active); if ($('#rail') && ri) mountRail(ri);
  $$('#app .doc-scroll[data-doc]').forEach(sc => {
    const k = sc.dataset.paneI, main = !!sc.dataset.main;
    mountDoc(sc, sc.dataset.doc, {zoom: main ? S.zoom : 1, zoomable: main, onPage: (p, n) => {
      if (k != null) { const e = $('#pc' + k); if (e) e.textContent = `${p} / ${n}`; }
      else { const a = $('#pgl'), b = $('#vsub'); if (a) a.textContent = `${p} / ${n}`; if (b) b.textContent = `Página ${p} de ${n}`; railMark(p); }
    }});
  });
}
async function mountDoc(sc, id, opt = {}) {
  const it = item(id); if (!it) return;
  const k = kindOf(it), pagesEl = sc.querySelector('.pages'), term = S.find && S.find.doc === id ? S.find.term : '';
  sc.style.setProperty('--z', opt.zoom || 1); sc._n = 1;
  if (k === 'txt') { pagesEl.innerHTML = `<div class="page txtpage"><pre>${hlText(esc(it.content || ''), term)}</pre></div>`; opt.onPage && opt.onPage(1, 1); sc._goto = () => {}; return; }
  let n = it.pages || 1, pdf = null;
  if (k === 'img') {
    n = 1;
    pagesEl.innerHTML = `<div class="page" data-page="1" data-doc="${id}" style="aspect-ratio:${it.w || 3}/${it.h || 4}"><div class="pc cv"><img alt="" draggable="false"></div><div class="ann"></div></div>`;
    objURL(id).then(u => { const im = pagesEl.querySelector('img'); if (im && u) im.src = u; });
  } else {
    if (it.source === 'idb') {
      pagesEl.innerHTML = `<div class="page"><div class="pc"><div class="ld">Carregando PDF…</div></div></div>`;
      try { pdf = await getPdf(id); n = pdf.numPages; if (it.pages !== n) { it.pages = n; saveFS(); } }
      catch (e) { pagesEl.innerHTML = `<div class="page"><div class="pc warn">Não foi possível exibir este PDF aqui (o leitor de PDF precisa de internet para carregar, ou o arquivo está protegido). O arquivo continua salvo e pode ser enviado normalmente.</div></div>`; opt.onPage && opt.onPage(1, 1); return; }
    }
    pagesEl.innerHTML = Array.from({length: n}, (_, i) => `<div class="page" data-page="${i + 1}" data-doc="${id}"><div class="pc ${pdf ? 'cv' : ''}">${pdf ? '<div class="ld">Carregando…</div>' : pageHTML(it, i + 1, term)}</div><div class="ann"></div>${pdf ? '' : `<div class="pnum">${i + 1}</div>`}</div>`).join('');
  }
  drawAnn(id, pagesEl);
  if (pdf) {
    try { const p1 = await pdf.getPage(1), v = p1.getViewport({scale: 1}); $$('.page', pagesEl).forEach(p => p.style.aspectRatio = `${v.width}/${v.height}`); } catch (e) {}
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); en.target._r = 1; renderPdfPage(pdf, +en.target.dataset.page, en.target).catch(() => {}); } }), {root: sc, rootMargin: '600px'});
    $$('.page', pagesEl).forEach(p => io.observe(p));
    sc._rerender = () => $$('.page', pagesEl).forEach(p => { if (p._r) renderPdfPage(pdf, +p.dataset.page, p).catch(() => {}); });
  }
  const pages = $$('.page', pagesEl);
  sc._n = n;
  const calc = () => {
    const mid = sc.scrollTop + sc.clientHeight * .35; let cur = 1;
    for (const p of pages) { if (p.offsetTop <= mid) cur = +p.dataset.page; else break; }
    sc._cur = cur; S.pos[id] = cur; if (it.lastPage !== cur) { it.lastPage = cur; saveFSDebounced(); }
    opt.onPage && opt.onPage(cur, n);
  };
  sc._goto = p => { const el = pages[clamp(p, 1, n) - 1]; if (el) sc.scrollTo({top: el.offsetTop - 12, behavior: 'smooth'}); };
  sc.addEventListener('scroll', () => { cancelAnimationFrame(sc._raf); sc._raf = requestAnimationFrame(calc); }, {passive: true});
  if (opt.zoomable) attachPinch(sc);
  const start = clamp(opt.page || S.pos[id] || it.lastPage || 1, 1, n);
  requestAnimationFrame(() => { const el = pages[start - 1]; if (el && start > 1) sc.scrollTop = el.offsetTop - 12; calc(); });
}
async function renderPdfPage(pdf, num, pageEl) {
  const page = await pdf.getPage(num), v1 = page.getViewport({scale: 1});
  pageEl.style.aspectRatio = `${v1.width}/${v1.height}`;
  const w = Math.max(pageEl.clientWidth, 120), scale = Math.min(4, (w * Math.min(window.devicePixelRatio || 1, 2)) / v1.width), vp = page.getViewport({scale});
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
  const pc = pageEl.querySelector('.pc'); pc.innerHTML = ''; pc.appendChild(c);
}
function setZoom(sc, z, fx = .5, fy = .5) {
  const old = parseFloat(getComputedStyle(sc).getPropertyValue('--z')) || 1; z = clamp(z, .5, 3);
  const cx = sc.scrollLeft + sc.clientWidth * fx, cy = sc.scrollTop + sc.clientHeight * fy, r = z / old;
  sc.style.setProperty('--z', z); S.zoom = z;
  sc.scrollLeft = cx * r - sc.clientWidth * fx; sc.scrollTop = cy * r - sc.clientHeight * fy;
  const l = $('#zl'); if (l) l.textContent = Math.round(z * 100) + '%';
}
let _zr; const zoomDone = sc => { clearTimeout(_zr); _zr = setTimeout(() => sc._rerender && sc._rerender(), 250); };
function attachPinch(sc) {
  let p = null; const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  sc.addEventListener('touchstart', e => { if (e.touches.length === 2) { const r = sc.getBoundingClientRect(); p = {d: dist(e.touches), z: S.zoom, fx: ((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left) / r.width, fy: ((e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top) / r.height}; } }, {passive: true});
  sc.addEventListener('touchmove', e => { if (p && e.touches.length === 2) { e.preventDefault(); setZoom(sc, p.z * dist(e.touches) / p.d, p.fx, p.fy); } }, {passive: false});
  sc.addEventListener('touchend', e => { if (p && e.touches.length < 2) { p = null; zoomDone(sc); } });
  sc.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setZoom(sc, S.zoom * (e.deltaY < 0 ? 1.1 : .9)); zoomDone(sc); } }, {passive: false});
}

/* ---------- anotações ---------- */
function annHTML(a) {
  const pos = `left:${a.x}%;top:${a.y}%;`;
  if (a.type === 'hl') return `<div class="a hl" data-ann="${a.id}" style="${pos}width:${a.w}%;height:${a.h}%"></div>`;
  if (a.type === 'note') return `<div class="a note" data-ann="${a.id}" style="${pos}" title="${esc(a.text)}">${ic('note', 14)}</div>`;
  if (a.type === 'text') return `<div class="a txt" data-ann="${a.id}" style="${pos}">${esc(a.text)}</div>`;
  if (a.type === 'ink') { const d = 'M' + a.pts.map(p => p.join(' ')).join('L'); return `<svg class="a ink" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}" stroke="${a.c}" stroke-width="${a.w || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path class="hit" data-ann="${a.id}" d="${d}" stroke="transparent" stroke-width="18" fill="none" vector-effect="non-scaling-stroke"/></svg>`; }
  return `<img class="a im" data-ann="${a.id}" src="${a.src}" style="${pos}width:${a.w}%" draggable="false" alt="">`;
}
function drawAnn(id, root = document) {
  const it = item(id); if (!it) return;
  $$(`.page[data-doc="${id}"]`, root).forEach(pg => { const p = +pg.dataset.page; pg.querySelector('.ann').innerHTML = (it.ann || []).filter(a => a.page === p).map(annHTML).join(''); });
}
function snap(it) { const h = S.hist[it.id] || (S.hist[it.id] = {u: [], r: []}); h.u.push(JSON.stringify(it.ann || [])); if (h.u.length > 60) h.u.shift(); h.r = []; updUndo(); }
function updUndo() { const it = curDoc(); if (!it) return; const h = S.hist[it.id]; const u = $('[data-act="undo"]'), r = $('[data-act="redo"]'); if (u) u.disabled = !(h && h.u.length); if (r) r.disabled = !(h && h.r.length); }
function addAnns(it, list) { snap(it); it.ann = it.ann || []; list.forEach(a => { a.id = uid(); it.ann.push(a); }); touch(it); if (!saveFS()) { list.forEach(() => it.ann.pop()); } drawAnn(it.id); }
const addAnn = (it, a) => addAnns(it, [a]);
function removeAnn(it, annId) { snap(it); it.ann = (it.ann || []).filter(a => a.id !== annId); saveFS(); drawAnn(it.id); }
function pctIn(pg, ev) { const r = pg.getBoundingClientRect(); return {x: clamp((ev.clientX - r.left) / r.width * 100, 0, 100), y: clamp((ev.clientY - r.top) / r.height * 100, 0, 100)}; }
function startAnnDrag(e, el, it) {
  const a = (it.ann || []).find(x => x.id === el.dataset.ann); if (!a) return;
  e.preventDefault();
  const r = el.closest('.page').getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = a.x, oy = a.y; let moved = false;
  const mv = ev => { if (a.type === 'ink') return; if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) { moved = true; snap(it); } if (moved) { a.x = clamp(ox + (ev.clientX - sx) / r.width * 100, 0, 97); a.y = clamp(oy + (ev.clientY - sy) / r.height * 100, 0, 98); el.style.left = a.x + '%'; el.style.top = a.y + '%'; } };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); if (moved) { touch(it); saveFS(); drawAnn(it.id); } else annSheet(it, a); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
function startHighlight(e, pg, it) {
  e.preventDefault();
  const p0 = pctIn(pg, e), box = document.createElement('div'); box.className = 'a hl'; pg.querySelector('.ann').appendChild(box); let p1 = p0;
  const set = () => Object.assign(box.style, {left: Math.min(p0.x, p1.x) + '%', top: Math.min(p0.y, p1.y) + '%', width: Math.abs(p1.x - p0.x) + '%', height: Math.max(Math.abs(p1.y - p0.y), 2) + '%'});
  const mv = ev => { p1 = pctIn(pg, ev); set(); };
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
    const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y), page = +pg.dataset.page; box.remove();
    if (w < 2 && h < 2) addAnn(it, {type: 'hl', page, x: clamp(p0.x - 15, 0, 70), y: clamp(p0.y - 1.1, 0, 97), w: 30, h: 2.2});
    else addAnn(it, {type: 'hl', page, x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.max(w, 2), h: Math.max(h, 2)});
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
function startInk(e, pg, it) {
  e.preventDefault();
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path'), pts = [];
  svg.setAttribute('class', 'a ink'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
  Object.entries({stroke: S.penColor, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke'}).forEach(([k, v]) => path.setAttribute(k, v));
  svg.appendChild(path); pg.querySelector('.ann').appendChild(svg);
  const add = ev => { const p = pctIn(pg, ev); pts.push([+p.x.toFixed(2), +p.y.toFixed(2)]); path.setAttribute('d', 'M' + pts.map(q => q.join(' ')).join('L')); };
  add(e);
  const mv = ev => add(ev);
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); svg.remove(); if (pts.length > 1) addAnn(it, {type: 'ink', page: +pg.dataset.page, pts, c: S.penColor, w: 3}); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
async function addPointAnn(e, pg, it) {
  const {x, y} = pctIn(pg, e), type = S.tool === 'note' ? 'note' : 'text';
  const txt = await askText(type === 'note' ? 'Novo comentário' : 'Inserir texto', {placeholder: type === 'note' ? 'Escreva seu comentário…' : 'Texto que aparecerá na página', ok: 'Inserir', multi: type === 'note'});
  if (txt && txt.trim()) addAnn(it, {type, page: +pg.dataset.page, x: type === 'note' ? x : clamp(x - 1, 0, 90), y, text: txt.trim()});
}
function annSheet(it, a) {
  const names = {hl: 'Realce', note: 'Comentário', text: 'Texto', img: 'Imagem', sign: 'Assinatura', ink: 'Desenho'};
  const at = `data-id="${it.id}" data-ann="${a.id}"`;
  openSheet(`<h3>${names[a.type]} · página ${a.page}</h3>${a.quote ? `<p class="muted small">Sobre: “${esc(a.quote)}”</p>` : ''}${a.text ? `<p style="white-space:pre-wrap;line-height:1.5">${esc(a.text)}</p>` : a.type !== 'ink' ? '<p class="muted small">Dica: na ferramenta “Mover”, arraste o elemento para reposicionar.</p>' : ''}
    ${a.text ? mi('rename', 'Editar texto', 'annEdit', at) : ''}${['img', 'sign'].includes(a.type) ? mi('max', 'Aumentar', 'annSize', at + ' data-d="1.25"') + mi('max', 'Diminuir', 'annSize', at + ' data-d="0.8"') : ''}${mi('trash', 'Excluir', 'annDel', at, 'danger')}`);
}
function signaturePad() {
  openSheet(`<h3>Assinatura digitalizada</h3><canvas class="sig" id="sig" width="700" height="260"></canvas><p class="muted small">Assine com o dedo ou o mouse no quadro acima.</p>
    <div class="row-btns"><button class="btn ghost" data-act="sigClear">Limpar</button><button class="btn" data-act="sigOk">Inserir na página</button></div>`, s => {
    const c = s.querySelector('#sig'), g = c.getContext('2d'); g.lineWidth = 4.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#13244f';
    c._b = null; let last = null;
    const pt = ev => { const r = c.getBoundingClientRect(); return [(ev.clientX - r.left) * c.width / r.width, (ev.clientY - r.top) * c.height / r.height]; };
    const grow = ([x, y]) => { const b = c._b || (c._b = [x, y, x, y]); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
    c.onpointerdown = ev => { ev.preventDefault(); c.setPointerCapture(ev.pointerId); last = pt(ev); grow(last); };
    c.onpointermove = ev => { if (!last) return; const p = pt(ev); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; grow(p); };
    c.onpointerup = c.onpointercancel = () => { last = null; };
  });
}
function insertImage(file) {
  const it = curDoc(); if (!it || !file) return;
  const fr = new FileReader();
  fr.onload = () => { const img = new Image(); img.onload = () => {
    const k = Math.min(1, 520 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    addAnn(it, {type: 'img', page: S.pos[it.id] || 1, x: 30, y: 30, w: 40, ar: c.height / c.width, src: c.toDataURL('image/jpeg', .8)});
    S.tool = 'hand'; render(); toast('Imagem inserida', {sub: 'Arraste para posicionar'});
  }; img.src = fr.result; };
  fr.readAsDataURL(file);
}

/* ---------- seleção de texto no PDF (Copiar / Colar / Realçar / Comentar) ---------- */
let _selT, _selHide;
function checkSel() {
  const pop = $('#selpop'), s = getSelection();
  const hide = () => { clearTimeout(_selHide); _selHide = setTimeout(() => pop.classList.remove('show'), 350); };
  if (!s || s.isCollapsed || !s.rangeCount || S.screen !== 'viewer') return hide();
  const r = s.getRangeAt(0), n = r.commonAncestorContainer, el = n.nodeType === 1 ? n : n.parentElement;
  const pg = el && el.closest('.page[data-page]'), sc = pg && pg.closest('.doc-scroll[data-edit]');
  if (!sc || !s.toString().trim()) return hide();
  clearTimeout(_selHide);
  S._sel = {pg, doc: sc.dataset.doc, range: r.cloneRange(), text: s.toString().trim()};
  pop.innerHTML = `<button data-act="txtCopy">${ic('copy', 18)}<span>Copiar</span></button><button data-act="txtPaste">${ic('paste', 18)}<span>Colar</span></button><button data-act="txtHl">${ic('hl', 18)}<span>Realçar</span></button><button data-act="txtNote">${ic('note', 18)}<span>Comentar</span></button>`;
  pop.classList.add('show');
  const rect = r.getBoundingClientRect(), ph = $('.phone').getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = clamp(rect.left + rect.width / 2 - ph.left - w / 2, 8, ph.width - w - 8) + 'px';
  let top = rect.bottom - ph.top + 12; if (top + h > ph.height - 150) top = rect.top - ph.top - h - 12; pop.style.top = Math.max(8, top) + 'px';
}
function selRects() {
  const {pg, range} = S._sel, pr = pg.getBoundingClientRect(), lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 2 || r.height < 2) continue;
    const x = (r.left - pr.left) / pr.width * 100, y = (r.top - pr.top) / pr.height * 100, w = r.width / pr.width * 100, h = r.height / pr.height * 100;
    const L = lines.find(l => Math.abs(l.y - y) < h * .5);
    if (L) { const x2 = Math.max(L.x + L.w, x + w); L.x = Math.min(L.x, x); L.w = x2 - L.x; } else lines.push({x, y, w, h});
  }
  return lines;
}
const clearSel = () => { try { getSelection().removeAllRanges(); } catch (e) {} $('#selpop').classList.remove('show'); };

/* ---------- janelas flutuantes ---------- */
function openFloat(id) {
  const ex = S.floats.find(f => f.doc === id); if (ex) { ex.z = ++S.z; renderFloats(); return; }
  const L = $('#float-layer'), W = L.clientWidth || 380, H = L.clientHeight || 700, n = S.floats.length;
  const d = isDesk(), w = d ? Math.min(440, W - 80) : Math.min(300, W - 40), h = d ? Math.min(580, H - 120) : Math.min(410, H - 200);
  S.floats.push({wid: 'w' + uid(), doc: id, x: clamp((d ? W * .35 : 18) + n * 28, 0, W - w), y: clamp((d ? 70 : 64) + n * 34, 0, H - h - 20), w, h, z: ++S.z});
  item(id).opened = Date.now(); saveFSDebounced(); renderFloats();
}
function renderFloats() {
  const L = $('#float-layer'), hide = !S.user || ['login', 'cadastro', 'admin'].includes(S.screen);
  L.style.display = hide ? 'none' : '';
  $$('.fwin', L).forEach(w => { if (!S.floats.find(f => f.wid === w.dataset.win)) w.remove(); });
  S.floats = S.floats.filter(f => alive(item(f.doc)));
  if (hide) return;
  for (const f of S.floats) {
    const it = item(f.doc);
    let w = L.querySelector(`[data-win="${f.wid}"]`);
    if (!w) {
      w = document.createElement('div'); w.className = 'fwin'; w.dataset.win = f.wid;
      w.innerHTML = `<div class="fbar" data-fmove="${f.wid}">${fileIcon(it, 20)}<span class="ell fname"></span><button data-act="fMax" data-win="${f.wid}" aria-label="Abrir no leitor">${ic('max', 16)}</button><button data-act="fClose" data-win="${f.wid}" aria-label="Fechar janela">${ic('close', 17)}</button></div>
        <div class="doc-scroll" data-doc="${f.doc}"><div class="pages"></div></div>
        <div class="fpager"><button data-act="fpg" data-win="${f.wid}" data-d="-1">${ic('arrowL', 16)}</button><span class="fpg">–</span><button data-act="fpg" data-win="${f.wid}" data-d="1">${ic('arrowR', 16)}</button></div>
        <div class="fres" data-fres="${f.wid}">${ic('resize', 16)}</div>`;
      L.appendChild(w);
      mountDoc(w.querySelector('.doc-scroll'), f.doc, {onPage: (p, n) => { w.querySelector('.fpg').textContent = `${p} / ${n}`; }});
    }
    w.querySelector('.fname').textContent = it.name;
    Object.assign(w.style, {left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', zIndex: f.z});
  }
}
function handleFloatPointer(e) {
  const win = e.target.closest('.fwin'); if (!win) return false;
  const f = S.floats.find(x => x.wid === win.dataset.win); if (!f) return false;
  f.z = ++S.z; win.style.zIndex = f.z;
  const bar = e.target.closest('[data-fmove]'), res = e.target.closest('[data-fres]');
  if ((!bar || e.target.closest('button')) && !res) return false;
  e.preventDefault();
  const L = $('#float-layer'), LW = L.clientWidth, LH = L.clientHeight, sx = e.clientX, sy = e.clientY, o = {...f};
  const mv = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (res) { f.w = clamp(o.w + dx, 180, LW - f.x); f.h = clamp(o.h + dy, 170, LH - f.y); } else { f.x = clamp(o.x + dx, 60 - f.w, LW - 60); f.y = clamp(o.y + dy, 0, LH - 40); }
    Object.assign(win.style, {left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px'});
  };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  return true;
}

/* ---------- toque, toque longo e arrastar e soltar (RF01) ---------- */
const P = {active: false};
function pressStart(e, el) {
  Object.assign(P, {id: el.dataset.tile, el, x: e.clientX, y: e.clientY, type: e.pointerType, long: false, drag: null, pid: e.pointerId, active: true});
  clearTimeout(P.t);
  P.t = setTimeout(() => { if (!P.active || P.drag) return; P.long = true; el.classList.add('lift'); try { navigator.vibrate && navigator.vibrate(15); } catch (_) {} }, 430);
}
function cancelPress() { clearTimeout(P.t); P.active = false; P.el && P.el.classList.remove('lift'); }
function tapTile(id) {
  const it = item(id); if (!it) return;
  if (S.section === 'trash') return trashSheet(id);
  if (S.select) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); render(); return; }
  if (it.type === 'folder') { S.cwd = id; S.section = 'files'; S.filter = ''; S.searchOpen = false; render(); return; }
  openFile(id);
}
function longPress(id) {
  if (S.section === 'trash') return trashSheet(id);
  if (!S.select) { S.select = true; S.sel.clear(); }
  S.sel.add(id); render();
  const el = $(`#app [data-tile="${id}"]`); if (el) itemPop(id, el);
}
function startDrag(e) {
  clearTimeout(P.t);
  const id = P.id, ids = S.select && S.sel.has(id) ? [...S.sel] : [id], el = P.el, r = el.getBoundingClientRect();
  const g = el.cloneNode(true); g.classList.add('ghost'); g.classList.remove('lift', 'sel', 'flash'); g.removeAttribute('data-tile'); g.removeAttribute('data-drop');
  Object.assign(g.style, {width: r.width + 'px', height: r.height + 'px'});
  if (ids.length > 1) g.insertAdjacentHTML('beforeend', `<span class="gcount">${ids.length}</span>`);
  document.body.appendChild(g); el.classList.remove('lift'); el.classList.add('dragging'); document.body.classList.add('is-dragging'); closeSheet();
  P.drag = {ids, g, offX: e.clientX - r.left, offY: e.clientY - r.top, target: null, hoverT: null};
  dragMove(e);
}
function canDropInto(fid, ids) { if (!fid || fid === 'root') return true; if (ids.includes(fid)) return false; return !ids.some(i => { const it = item(i); return it && it.type === 'folder' && descendants(i).some(d => d.id === fid); }); }
function dragMove(e) {
  const D = P.drag;
  D.g.style.transform = `translate(${e.clientX - D.offX}px,${e.clientY - D.offY}px) scale(1.06) rotate(-2deg)`;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  let t = under && under.closest('[data-drop]'); if (t && !canDropInto(t.dataset.drop, D.ids)) t = null;
  if (t !== D.target) {
    D.target && D.target.classList.remove('drop-hover'); D.target = t; clearTimeout(D.hoverT);
    if (t) { t.classList.add('drop-hover'); if (t.dataset.tile || t.dataset.spring) D.hoverT = setTimeout(() => springOpen(t.dataset.drop), 950); }
  }
  const sc = $('#home-scroll'); if (sc) { const sr = sc.getBoundingClientRect(); if (e.clientY < sr.top + 46) sc.scrollTop -= 12; else if (e.clientY > sr.bottom - 46) sc.scrollTop += 12; }
}
function springOpen(fid) {
  if (!P.drag) return;
  if (P.el && P.el.isConnected) $('#drag-holder').appendChild(P.el);
  S.cwd = fid === 'root' ? null : fid; S.section = 'files'; S.filter = ''; P.drag.target = null; render();
}
function dragEnd(ok) {
  const D = P.drag; P.drag = null; clearTimeout(D.hoverT); document.body.classList.remove('is-dragging');
  if (P.el) P.el.classList.remove('dragging');
  const t = D.target; t && t.classList.remove('drop-hover');
  if (!ok || !t) { D.g.remove(); if (P.el && !P.el.isConnected) render(); $('#drag-holder').innerHTML = ''; return; }
  const dest = t.dataset.drop === 'root' ? null : t.dataset.drop, tr = t.getBoundingClientRect(), cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
  D.g.style.transition = 'transform .3s ease, opacity .3s ease'; D.g.style.transform = `translate(${cx - D.g.offsetWidth / 2}px,${cy - D.g.offsetHeight / 2}px) scale(.3)`; D.g.style.opacity = '0';
  const ring = document.createElement('div'); ring.className = 'drop-ring'; Object.assign(ring.style, {left: cx + 'px', top: cy + 'px'}); ring.innerHTML = `<span>${ic('check', 16)}</span><b>Soltando…</b>`; document.body.appendChild(ring);
  setTimeout(() => { D.g.remove(); ring.remove(); $('#drag-holder').innerHTML = ''; doMove(D.ids, dest); }, 450);
}
function doMove(ids, dest, verb = 'movido') {
  const moving = ids.map(item).filter(i => i && (i.parent || null) !== (dest || null) && canDropInto(dest, [i.id]));
  if (!moving.length) { if (S.select) { S.select = false; S.sel.clear(); } render(); toast('Nada foi movido', {sub: 'Os itens já estão nesta pasta.', err: true}); return; }
  moving.forEach(i => { i.parent = dest || null; touch(i); }); saveFS();
  S.flash = moving.map(i => i.id); S.select = false; S.sel.clear(); render();
  const one = moving.length === 1, noun = one ? (moving[0].type === 'folder' ? 'Pasta' : 'Arquivo') : `${moving.length} itens`;
  toast(`${noun} ${one ? verb : verb + 's'} para ${esc(folderName(dest))}`, {sub: one ? esc(moving[0].name) : moving.map(i => esc(i.name)).join(', '), ...((S.cwd || null) !== (dest || null) ? {label: 'Ver pasta', fn: () => { S.cwd = dest || null; S.section = 'files'; S.flash = moving.map(i => i.id); render(); }} : {})});
}

/* ---------- ações de arquivo ---------- */
function openFile(id) {
  const it = item(id); if (!it) return;
  if (kindOf(it) === 'other') return otherSheet(id);
  openDocs([id]);
}
function openDocs(ids, mode = 'tabs') {
  ids = ids.filter(id => { const i = item(id); return i && i.type !== 'folder' && kindOf(i) !== 'other'; });
  if (!ids.length) { toast('Nada para abrir', {sub: 'Selecione arquivos que o app consegue exibir.', err: true}); return; }
  ids.forEach(id => { item(id).opened = Date.now(); }); saveFSDebounced();
  S.select = false; S.sel.clear();
  if (mode === 'float') { ids.forEach(openFloat); render(); toast(`${ids.length} arquivo(s) em janelas flutuantes`, {sub: 'Arraste pela barra e redimensione pelo canto'}); return; }
  ids.forEach(id => { if (!S.open.includes(id)) S.open.push(id); });
  S.active = ids[0];
  if (mode === 'split') { S.layout = 'split'; S.split = ids.slice(0, 2); S.focusDoc = ids[0]; } else S.layout = 'tabs';
  S.screen = 'viewer'; S.vmode = 'main'; S.tool = 'hand'; render();
}
function closeDoc(id) { S.open = S.open.filter(x => x !== id); S.floats = S.floats.filter(f => f.doc !== id); if (S.active === id) S.active = S.open[0] || null; }
function uniqueName(name, parent, selfId) {
  const taken = new Set(children(parent).filter(i => i.id !== selfId).map(i => i.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const b = baseName(name), e = extOf(name); let k = 1, n;
  do { n = `${b} (${k === 1 ? 'cópia' : 'cópia ' + k})${e ? '.' + e : ''}`; k++; } while (taken.has(n.toLowerCase()));
  return n;
}
async function cloneItem(it, dest) {
  const c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.parent = dest || null; c.created = c.modified = Date.now(); c.name = uniqueName(it.name, c.parent); c.lastPage = 1; delete c.opened; c.fav = false;
  if (it.source === 'idb') await IDB.put(c.id, await IDB.get(it.id));
  S.fs.items.push(c);
  if (it.type === 'folder') for (const ch of children(it.id)) await cloneItem(ch, c.id);
  return c;
}
async function copyItems(ids, dest) {
  const made = []; for (const id of ids) { const it = item(id); if (it && canDropInto(dest, [id])) made.push((await cloneItem(it, dest)).id); }
  saveFS(); S.flash = made; S.select = false; S.sel.clear(); render();
  toast(`${made.length} cópia(s) em ${esc(folderName(dest))}`, {sub: 'Os originais foram mantidos', ...((S.cwd || null) !== (dest || null) ? {label: 'Ver pasta', fn: () => { S.cwd = dest || null; S.section = 'files'; S.flash = made; render(); }} : {})});
}
function trashItems(ids) {
  const list = ids.map(item).filter(Boolean);
  list.forEach(i => { i.trashed = true; i.trashedAt = Date.now(); [i, ...descendants(i.id)].forEach(d => closeDoc(d.id)); });
  S.sel.clear(); S.select = false; saveFS(); render();
  toast(`${list.length === 1 ? 'Movido' : list.length + ' itens movidos'} para a lixeira`, {sub: list.length === 1 ? esc(list[0].name) : '', label: 'Desfazer', fn: () => { list.forEach(i => { i.trashed = false; }); saveFS(); render(); }});
}
function restoreItem(id) { const i = item(id); i.trashed = false; if (i.parent && !alive(item(i.parent))) i.parent = null; touch(i); saveFS(); }
function purgeItem(id) { const all = [item(id), ...descendants(id)].filter(Boolean); all.forEach(i => { if (i.source === 'idb') IDB.del(i.id); closeDoc(i.id); }); const ids = new Set(all.map(i => i.id)); S.fs.items = S.fs.items.filter(i => !ids.has(i.id)); saveFS(); }

async function buildPdfBlob(it) {
  if (!window.jspdf) return null;
  const {jsPDF} = window.jspdf, doc = new jsPDF({unit: 'mm', format: 'a4'}), W = 210, H = 297, M = 19;
  const txt = (s, x, y, w, size, style = 'normal', rgb = [40, 48, 66], font = 'helvetica') => { doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...rgb); const lines = doc.splitTextToSize(s, w); doc.text(lines, x, y); return y + lines.length * size * .47; };
  for (let p = 1; p <= (it.pages || 1); p++) {
    if (p > 1) doc.addPage();
    let y = M + 4;
    for (const b of blocksFor(it, p)) {
      if (y > H - M) break;
      if (b.t === 'title') y = txt(b.x, M, y, W - 2 * M, 22, 'bold', [17, 24, 39]) + 1;
      else if (b.t === 'sub') { y = txt(b.x, M, y, W - 2 * M, 9.5, 'normal', [138, 147, 166]); doc.setDrawColor(227, 232, 240); doc.line(M, y, W - M, y); y += 7; }
      else if (b.t === 'h') y = txt(b.x, M, y + 3, W - 2 * M, 14, 'bold', [17, 24, 39]) + 2;
      else if (b.t === 'pc') {
        const y0 = y, cw = (W - 2 * M) * .4, cx = W - M - cw; y = txt(b.x, M, y, W - 2 * M - cw - 6, 10.5);
        const v = b.chart.v, bw = cw / v.length * .62, ch = 32; doc.setDrawColor(213, 220, 235); doc.line(cx, y0 + ch, cx + cw, y0 + ch);
        v.forEach((x, i) => { doc.setFillColor(i === v.length - 1 ? 31 : 90, i === v.length - 1 ? 111 : 162, 224); const bh = (b.chart.k === 'pie' ? x * 2 : x) * (ch - 3); doc.rect(cx + i * (cw / v.length) + (cw / v.length - bw) / 2, y0 + ch - bh, bw, bh, 'F'); });
        txt(b.cap, cx, y0 + ch + 5, cw, 7.5, 'normal', [138, 147, 166]); y = Math.max(y, y0 + ch + 10) + 2;
      } else if (b.t === 'tbl') { b.rows.forEach((r, i) => { if (!i) { doc.setFillColor(238, 243, 251); doc.rect(M, y - 4, W - 2 * M, 6.5, 'F'); } r.forEach((c, j) => txt(c, M + 2 + j * (W - 2 * M) / 3, y, 55, 10, i ? 'normal' : 'bold', i ? [40, 48, 66] : [31, 59, 110])); y += 7; }); y += 3; }
      else if (b.t === 'ul') b.items.forEach(x => { y = txt('•  ' + x, M + 3, y, W - 2 * M - 3, 10.5) + 1.5; });
      else y = txt(b.x, M, y, W - 2 * M, 10.5) + 2.5;
    }
    for (const a of (it.ann || []).filter(a => a.page === p)) {
      const x = a.x / 100 * W, yy = a.y / 100 * H;
      if (a.type === 'hl') { try { doc.setGState(new doc.GState({opacity: .35})); } catch (e) {} doc.setFillColor(255, 214, 0); doc.rect(x, yy, a.w / 100 * W, a.h / 100 * H, 'F'); try { doc.setGState(new doc.GState({opacity: 1})); } catch (e) {} }
      else if (a.type === 'text') txt(a.text, x, yy + 1, 120, 12, 'bold', [208, 36, 43]);
      else if (a.type === 'note') txt('[Nota] ' + a.text, x, yy, 70, 8.5, 'normal', [30, 80, 190]);
      else if (a.type === 'ink') { const c = parseInt(a.c.slice(1), 16); doc.setDrawColor(c >> 16, (c >> 8) & 255, c & 255); doc.setLineWidth(.6); for (let i = 1; i < a.pts.length; i++) doc.line(a.pts[i - 1][0] / 100 * W, a.pts[i - 1][1] / 100 * H, a.pts[i][0] / 100 * W, a.pts[i][1] / 100 * H); }
      else if (a.src) { try { const w = a.w / 100 * W; doc.addImage(a.src, a.src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, yy, w, w * (a.ar || .4)); } catch (e) {} }
    }
  }
  return doc.output('blob');
}
async function fileBlob(it) {
  if (it.source === 'idb') { const b = await IDB.get(it.id); return b ? new Blob([b], {type: it.mime || (it.ext === 'pdf' ? 'application/pdf' : 'application/octet-stream')}) : null; }
  if (kindOf(it) === 'txt') return new Blob([it.content || ''], {type: 'text/plain'});
  return buildPdfBlob(it);
}
async function shareOrDownload(ids, forceDownload) {
  const files = [];
  for (const id of ids) { const it = item(id); if (!it || it.type === 'folder') continue; const b = await fileBlob(it); if (b) files.push(new File([b], it.name, {type: b.type})); }
  if (!files.length) { toast('Não foi possível gerar o arquivo', {sub: 'O gerador de PDF precisa de internet para carregar.', err: true}); return; }
  if (NATIVE) {
    try {
      if (forceDownload) { const n = await nativeSave(files); toast(`${n} arquivo(s) salvo(s)`, {sub: 'Em Documentos › BOM no aparelho'}); }
      else await nativeShare(files);
    } catch (e) { if (forceDownload) { try { await nativeShare(files); } catch (_) { toast('Não foi possível salvar', {err: true}); } } else if (!/cancel/i.test(String(e && e.message))) toast('Não foi possível enviar', {err: true}); }
    return;
  }
  if (!forceDownload && navigator.canShare && navigator.canShare({files})) { try { await navigator.share({files, title: 'BOM!'}); toast('Arquivo enviado'); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  toast(forceDownload ? 'Download iniciado' : 'Arquivo enviado para download', {sub: forceDownload ? '' : 'Este navegador não abre o compartilhamento do sistema.'});
}
function shareSheet(ids) {
  ids = ids.filter(id => item(id) && item(id).type !== 'folder');
  if (!ids.length) return toast('Selecione arquivos para enviar', {err: true});
  const apps = [['WhatsApp', '#25d366'], ['E-mail', '#2f80ed'], ['Drive', '#f4b400'], ['Telegram', '#2aa1da'], ['Mais', '#475569']];
  openSheet(`<h3>Enviar ${ids.length > 1 ? ids.length + ' arquivos' : '“' + esc(item(ids[0]).name) + '”'}</h3>
    <div class="apps">${apps.map(([n, c]) => `<button class="app" data-act="doShare" data-ids="${ids.join(',')}"><i style="background:${c}">${n === 'Mais' ? '⋯' : n[0]}</i><span>${n}</span></button>`).join('')}</div>
    ${mi('download', 'Salvar uma cópia no aparelho', 'doDownload', `data-ids="${ids.join(',')}"`)}
    <p class="muted small">Os atalhos abrem o compartilhamento do sistema, onde você escolhe o app de destino.</p>`);
}
async function docText(it) {
  const k = kindOf(it);
  if (k === 'txt') return it.content || '';
  if (it.source === 'idb') { const pdf = await getPdf(it.id); const out = []; for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); out.push(tc.items.map(s => s.str).join(' ')); } return out.join('\n\n'); }
  if (it.source === 'created') return titleOf(it) + '\n\n' + (it.content || '');
  const out = []; for (let p = 1; p <= (it.pages || 1); p++) out.push(blocksFor(it, p).map(blockText).join('\n\n')); return out.join('\n\n— — —\n\n');
}
function addFile(o) { const it = {id: uid(), type: 'file', created: Date.now(), modified: Date.now(), ann: [], ...o}; it.name = uniqueName(it.name, it.parent); S.fs.items.push(it); saveFS(); S.flash = [it.id]; return it; }
async function convert(id, to) {
  const it = item(id), base = baseName(it.name), k = kindOf(it);
  try {
    let out;
    if (to === 'txt') { const content = await docText(it); out = addFile({ext: 'txt', name: base + '.txt', parent: it.parent, size: new Blob([content]).size, source: 'text', content}); }
    else if (to === 'pdf' && k === 'txt') { out = addFile({ext: 'pdf', name: base + '.pdf', parent: it.parent, source: 'created', content: it.content || ''}); out.pages = createdChunks(out).length; out.size = 18000 + (it.content || '').length * 2; saveFS(); }
    else if (to === 'pdf' && k === 'img') {
      if (!window.jspdf) throw new Error('jspdf');
      const u = await objURL(id), im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
      const doc = new window.jspdf.jsPDF({unit: 'pt', format: [c.width, c.height], orientation: c.width > c.height ? 'l' : 'p'}); doc.addImage(c.toDataURL('image/jpeg', .9), 'JPEG', 0, 0, c.width, c.height);
      const buf = await doc.output('blob').arrayBuffer(); out = addFile({ext: 'pdf', name: base + '.pdf', parent: it.parent, size: buf.byteLength, source: 'idb', mime: 'application/pdf', pages: 1}); await IDB.put(out.id, buf);
    } else if (to === 'png') {
      const pdf = await getPdf(id), pg = await pdf.getPage(1), vp = pg.getViewport({scale: 1.6}), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
      const buf = await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer();
      out = addFile({ext: 'png', name: base + ' - página 1.png', parent: it.parent, size: buf.byteLength, source: 'idb', mime: 'image/png', w: c.width, h: c.height}); await IDB.put(out.id, buf);
    }
    if (S.screen === 'home') render();
    toast(`Convertido: ${esc(out.name)}`, {sub: 'Salvo na mesma pasta do original', label: kindOf(out) === 'other' ? '' : 'Abrir', fn: () => openDocs([out.id])});
  } catch (e) { toast('Não foi possível converter', {sub: e && e.message === 'jspdf' ? 'O gerador de PDF precisa de internet.' : 'Formato ou arquivo não suportado aqui.', err: true}); }
}
function convertSheet(id) {
  const it = item(id), k = kindOf(it), idb = it.source === 'idb';
  const opt = (to, icn, l, ok, why) => `<button class="mi" data-act="doConvert" data-id="${id}" data-to="${to}" ${ok ? '' : 'disabled'}>${ic(icn)}<span>${l}${ok ? '' : `<br><small class="muted">${why}</small>`}</span></button>`;
  const opts = k === 'pdf' ? opt('txt', 'text', 'Texto (.txt)', true) + opt('png', 'image', 'Imagem PNG (página 1)', idb, 'Disponível para PDFs importados') + opt('docx', 'newdoc', 'Word (.docx)', false, 'Ainda não disponível')
    : k === 'img' ? opt('pdf', 'page', 'PDF (.pdf)', true) : k === 'txt' ? opt('pdf', 'page', 'PDF (.pdf)', true) : '<p class="muted">Este formato não pode ser convertido no app.</p>';
  openSheet(`<h3>Converter “${esc(it.name)}”</h3>${opts}`);
}
function itemMenuHTML(id) {
  const it = item(id), folder = it.type === 'folder', a = `data-id="${id}"`, ok = kindOf(it) !== 'other';
  return folder
    ? `${pi('folder', 'Abrir pasta', 'openFolder', a)}${pi('newfolder', 'Nova subpasta', 'newSub', a)}${pi('rename', 'Renomear', 'renameItem', a)}${pi('palette', 'Cor da pasta', 'colorSheet', a, '', true)}${pi('move', 'Mover', 'moveItem', a)}${pi('copy', 'Copiar', 'copyItem', a)}${pi(it.fav ? 'starF' : 'star', it.fav ? 'Remover dos favoritos' : 'Favoritar', 'toggleFav', a)}${pi('info', 'Detalhes', 'details', a)}<div class="psep"></div>${pi('trash', 'Excluir', 'deleteItem', a, 'danger')}`
    : `${ok ? pi('openDoc', 'Abrir', 'openItem', a) + pi('window', 'Abrir em janela flutuante', 'floatItem', a) : ''}${pi('send', 'Enviar para', 'shareItem', a, '', true)}${pi('convert', 'Converter arquivo', 'convertItem', a)}${pi('rename', 'Renomear', 'renameItem', a)}${pi('move', 'Mover', 'moveItem', a)}${pi('copy', 'Copiar', 'copyItem', a)}${pi('duplicate', 'Duplicar', 'duplicateItem', a)}<div class="psep"></div>${pi(it.fav ? 'starF' : 'star', it.fav ? 'Remover dos favoritos' : 'Favoritar', 'toggleFav', a)}${pi('tag', 'Etiqueta', 'tagSheet', a, '', true)}${pi('info', 'Detalhes', 'details', a)}<div class="psep"></div>${pi('trash', 'Excluir', 'deleteItem', a, 'danger')}`;
}
const itemPop = (id, anchor) => openPop(anchor, itemMenuHTML(id));
function detailsSheet(id) {
  const it = item(id), folder = it.type === 'folder', tg = tagOf(it.tag);
  openSheet(`<div class="sh-head">${iconOf(it, 40)}<div><b>${esc(it.name)}</b><small>${KIND_NAME[kindOf(it)]}</small></div></div><div class="kv">
    <span>Local</span><b>${esc(pathStr(it.parent))}</b>${folder ? `<span>Conteúdo</span><b>${countIn(id)} item(ns), ${descendants(id).filter(d => !d.trashed).length} no total</b>` : `<span>Tamanho</span><b>${fmtSize(it.size || 0)}</b>${kindOf(it) === 'pdf' ? `<span>Páginas</span><b>${it.pages || 1}</b>` : ''}${kindOf(it) === 'img' && it.w ? `<span>Dimensões</span><b>${it.w} × ${it.h} px</b>` : ''}<span>Edições</span><b>${(it.ann || []).length}</b>`}
    <span>Criado em</span><b>${fmtD(it.created)} ${fmtT(it.created)}</b><span>Modificado</span><b>${fmtD(it.modified || it.created)} ${fmtT(it.modified || it.created)}</b>${it.opened ? `<span>Último acesso</span><b>${fmtD(it.opened)} ${fmtT(it.opened)}</b>` : ''}
    <span>Favorito</span><b>${it.fav ? 'Sim' : 'Não'}</b>${folder ? '' : `<span>Etiqueta</span><b>${tg ? `<i class="tdot" style="background:${tg.c}"></i> ${tg.name}` : 'Nenhuma'}</b>`}<span>Armazenado</span><b>Neste aparelho</b></div>`);
}
function trashSheet(id) {
  const it = item(id);
  openSheet(`<div class="sh-head">${iconOf(it, 40)}<div><b class="ell">${esc(it.name)}</b><small>Excluído em ${fmtD(it.trashedAt || Date.now())} · estava em ${esc(pathStr(it.parent))}</small></div></div>${mi('restore', 'Restaurar', 'restore', `data-id="${id}"`)}${mi('trash', 'Excluir definitivamente', 'purge', `data-id="${id}"`, 'danger')}`);
}
function otherSheet(id) {
  const it = item(id);
  openSheet(`<div class="sh-head">${fileIcon(it, 40)}<div><b class="ell">${esc(it.name)}</b><small>${fmtSize(it.size || 0)}</small></div></div><p class="muted" style="line-height:1.5">O BOM! ainda não exibe arquivos .${esc(it.ext)}. O arquivo fica guardado e organizado normalmente, e você pode abri-lo em outro app.</p>${mi('send', 'Enviar para outro app', 'shareItem', `data-id="${id}"`)}${mi('download', 'Salvar uma cópia no aparelho', 'doDownload', `data-ids="${id}"`)}${mi('info', 'Detalhes', 'details', `data-id="${id}"`)}`);
}
async function renameItem(id) {
  const it = item(id); if (!it) return;
  let v = await askText(it.type === 'folder' ? 'Renomear pasta' : 'Renomear arquivo', {value: it.name});
  if (v == null) return; v = v.trim().replace(/[\\/:*?"<>|]/g, '');
  if (!v) return toast('O nome não pode ficar vazio', {err: true});
  if (it.type !== 'folder' && it.ext && extOf(v) !== it.ext) v += '.' + it.ext;
  if (children(it.parent).some(i => i.id !== id && i.name.toLowerCase() === v.toLowerCase())) return toast('Já existe um item com esse nome aqui', {err: true});
  it.name = v; touch(it); saveFS(); render(); renderFloats(); toast('Renomeado', {sub: 'O conteúdo não foi alterado'});
}
async function newFolder(parent) {
  const v = await askText('Nova pasta', {placeholder: 'Ex.: Trabalho, Faculdade…', ok: 'Criar'});
  if (!v || !v.trim()) return;
  const f = {id: uid(), type: 'folder', name: uniqueName(v.trim(), parent), parent: parent || null, color: parent ? item(parent).color : FOLDER_COLORS[0], created: Date.now(), modified: Date.now()};
  S.fs.items.push(f); saveFS(); S.flash = [f.id]; render(); toast(`Pasta “${esc(f.name)}” criada`);
}
function createPdfSheet() {
  openSheet(`<h3>Criar novo PDF</h3><form class="form" data-form="create"><label>Título<input type="text" name="titulo" required placeholder="Ex.: Anotações da aula"></label>
    <label>Conteúdo<textarea name="conteudo" rows="7" placeholder="Digite o texto do documento…"></textarea></label>
    <div class="row-btns"><button type="button" class="btn ghost" data-act="closeSheet">Cancelar</button><button class="btn" type="submit">Criar PDF</button></div></form>`, s => setTimeout(() => s.querySelector('input').focus(), 60));
}
async function importFiles(list) {
  let n = 0;
  for (const f of list) {
    const ext = extOf(f.name) || 'bin';
    const base = {ext, name: f.name, parent: S.cwd || null, size: f.size, mime: f.type};
    if (TXT_EXT.has(ext) && f.size < 1.5e6) { addFile({...base, source: 'text', content: await f.text()}); n++; continue; }
    const buf = await f.arrayBuffer(), extra = {source: 'idb'};
    if (ext === 'pdf') extra.pages = 1;
    if (IMG_EXT.has(ext)) Object.assign(extra, await imgDims(buf, f.type));
    const it = addFile({...base, ...extra}); await IDB.put(it.id, buf); n++;
    if (ext === 'pdf') getPdf(it.id).then(p => { it.pages = p.numPages; saveFS(); if (S.screen === 'home') render(); }).catch(() => {});
  }
  S.section = 'files'; render(); toast(n ? `${n} arquivo(s) importado(s)` : 'Nenhum arquivo importado', {sub: n ? `Em ${esc(folderName(S.cwd))}` : ''});
}
async function openThumbs() {
  const it = curDoc(); if (!it) return; const k = kindOf(it), n = it.pages || 1, cur = S.pos[it.id] || 1;
  if (k !== 'pdf' || n < 2) return toast('Este arquivo tem só uma página');
  openSheet(`<h3>Páginas (${n})</h3><div class="thumbs">${Array.from({length: n}, (_, i) => `<button class="thumbp ${i + 1 === cur ? 'on' : ''}" data-act="thumbGo" data-p="${i + 1}"><div class="page" data-tp="${i + 1}"><div class="pc ${it.source === 'idb' ? 'cv' : ''}">${it.source === 'idb' ? '' : pageHTML(it, i + 1)}</div><div class="ann"></div></div><span>${i + 1}</span></button>`).join('')}</div>`);
  const sh = $('.sheet');
  $$('.thumbs .page', sh).forEach(pg => { const p = +pg.dataset.tp; pg.querySelector('.ann').innerHTML = (it.ann || []).filter(a => a.page === p).map(annHTML).join(''); });
  if (it.source === 'idb') try { const pdf = await getPdf(it.id); for (const pg of $$('.thumbs .page', sh)) { if (!pg.isConnected) break; await renderPdfPage(pdf, +pg.dataset.tp, pg); } } catch (e) {}
}
function findSheet() {
  const it = curDoc(); if (!it) return;
  openSheet(`<h3>Buscar no documento</h3><input type="text" id="find-in" placeholder="Digite uma palavra…" value="${esc(S.find && S.find.doc === it.id ? S.find.term : '')}"><div class="findres" id="find-res"></div>`, s => {
    const i = s.querySelector('#find-in'); let t; setTimeout(() => i.focus(), 60);
    const run = async () => {
      const term = i.value.trim(), box = s.querySelector('#find-res'); if (term.length < 2) { box.innerHTML = ''; return; }
      const res = [], rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), n = it.pages || 1;
      const scan = (p, text) => { const m = text.search(rx); if (m >= 0) res.push({p, snip: text.slice(Math.max(0, m - 40), m + term.length + 50)}); };
      if (kindOf(it) === 'txt') scan(1, it.content || '');
      else if (it.source === 'idb') { try { const pdf = await getPdf(it.id); for (let p = 1; p <= pdf.numPages; p++) scan(p, (await (await pdf.getPage(p)).getTextContent()).items.map(x => x.str).join(' ')); } catch (e) {} }
      else for (let p = 1; p <= n; p++) scan(p, blocksFor(it, p).map(blockText).join(' '));
      box.innerHTML = res.length ? res.map(r => `<button data-act="findGo" data-p="${r.p}" data-term="${esc(term)}"><b>Página ${r.p}</b><br>…${hlText(esc(r.snip), term)}…</button>`).join('') : '<p class="muted small">Nenhum resultado.</p>';
    };
    i.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); }; if (i.value) run();
  });
}

/* ---------- abertos, acessos, conta, admin ---------- */
const menuBar = (title, sub = '', right = '') => `<header class="appbar"><button class="ib drawer-btn" data-act="drawer" aria-label="Menu">${ic('menu')}</button><div class="ttl"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${right}</header>`;
function vAbertos() {
  const docs = openDocList();
  return `<div class="screen">${menuBar('Arquivos abertos', `${docs.length} documento(s) nesta sessão`, docs.length ? `<button class="chip danger" data-act="closeAll" style="margin-right:8px">Fechar todos</button>` : '')}
  <div class="scroll pad">${docs.length ? docs.map(id => { const it = item(id), inTab = S.open.includes(id), inWin = S.floats.some(f => f.doc === id), p = S.pos[id] || it.lastPage || 1;
    return `<div class="orow">${fileIcon(it, 40)}<div class="ometa"><b class="ell">${esc(it.name)}</b><small>Parou na página ${p} de ${it.pages || 1} · ${[inTab && 'aba', inWin && 'janela flutuante'].filter(Boolean).join(' + ')}</small>
      <div class="obtns"><button class="chip" data-act="resume" data-id="${id}">${ic('openDoc', 15)} Retomar</button><button class="chip" data-act="toWin" data-id="${id}">${ic('window', 15)} ${inWin ? 'Fechar janela' : 'Janela'}</button><button class="chip danger" data-act="closeDoc" data-id="${id}">${ic('close', 15)} Fechar</button></div></div></div>`; }).join('')
    : `<div class="empty">Nenhum arquivo aberto.<br>Abra arquivos em <b>Meus Arquivos</b>. Eles aparecem aqui como abas e janelas.</div>`}
  <div class="box"><h4>Multitarefa</h4><div class="muted small" style="line-height:1.7">• Selecione vários arquivos e toque em <b>Abrir</b> para escolher abas, janelas flutuantes ou tela dividida.<br>• Cada aba guarda a página onde você parou.<br>• Janelas flutuantes podem ser movidas pela barra e redimensionadas pelo canto.</div></div></div></div>`;
}
function vAcessos() {
  const s = LS.get('bom_session', null), logs = getLogs().filter(l => l.uid === S.user.uid).sort((a, b) => b.dataLogin.localeCompare(a.dataLogin)), u = getUsers().find(x => x.uid === S.user.uid) || S.user;
  return `<div class="screen">${menuBar('Meus acessos', `${logs.length} registro(s) no histórico`)}<div class="scroll pad">
    ${logs.map(l => { const me = s && l.idLog === s.logId; return `<div class="lrow"><div class="ldate"><b>${fmtD(l.dataLogin)}</b><small class="ell">${esc(l.nomeDispositivo)}</small></div><div class="ltimes"><span>Login <b>${fmtT(l.dataLogin)}</b></span><span>Logout <b>${l.horaLogout ? fmtT(l.horaLogout) : '—'}</b></span></div><span class="pill ${l.situacao}">${me ? 'Esta sessão' : l.situacao === 'ativa' ? 'Ativa' : 'Encerrada'}</span></div>`; }).join('') || '<div class="empty">Sem registros.</div>'}
    <div class="box" style="margin-top:6px"><h4>Dispositivos usados</h4>${(u.dispositivos || []).map(d => `<div class="drow"><div><b style="font-weight:500">${esc(d.nomeDispositivo)}</b><br><small>${esc(d.plataforma)}${d.idDispositivo === deviceInfo().idDispositivo ? ' · este aparelho' : ''}</small></div><small>Último acesso<br>${fmtD(d.ultimoAcesso)} ${fmtT(d.ultimoAcesso)}</small></div>`).join('')}</div></div></div>`;
}
function vConta() {
  const u = S.user, rem = LS.get('bom_lembrar', null), files = S.fs.items.filter(i => i.type !== 'folder' && !i.trashed);
  return `<div class="screen">${menuBar('Conta')}<div class="scroll pad">
    <div class="box prof"><div class="avatar" style="width:56px;height:56px">${esc(u.nome.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase())}</div><div class="ometa"><b style="font-size:17px;font-weight:500">${esc(u.nome)}</b><small>${esc(u.email)}</small><small>${u.perfil === 'admin' ? 'Administrador' : 'Usuário'} · desde ${fmtD(u.dataCadastro)}</small></div></div>
    <div class="box"><h4>Neste aparelho</h4><div class="drow"><span>Sessão</span><small>Salva: o app abre direto, sem novo login</small></div><div class="drow"><span>E-mail e senha</span><small>${rem ? 'Salvos para o próximo login' : 'Não salvos'}</small></div><div class="drow"><span>Arquivos locais</span><small>${files.length} arquivo(s) · ${fmtSize(files.reduce((a, b) => a + (b.size || 0), 0))}</small></div>
      ${rem ? `<button class="chip" style="margin-top:8px" data-act="forgetCreds">Esquecer e-mail e senha salvos</button>` : ''}</div>
    <div class="box"><h4>Preferências</h4><div class="drow"><span>Exibição dos arquivos</span><button class="chip" data-act="toggleView">${S.view === 'grid' ? 'Grade' : 'Lista'}</button></div><div class="drow"><span>Leitura noturna</span><button class="chip ${S.night ? 'on' : ''}" data-act="toggleNight">${S.night ? 'Ligada' : 'Desligada'}</button></div></div>
    ${u.perfil === 'admin' ? `<button class="btn ghost block" style="margin-bottom:10px" data-act="go" data-to="admin">${ic('shield')} Painel do administrador</button>` : ''}
    <button class="btn block danger" data-act="logout">${ic('logout')} Sair</button><p class="muted small center">Ao sair, a hora de logout é gravada no seu histórico de acessos.</p></div></div>`;
}
function vAdmin() {
  const users = getUsers(), logs = getLogs(), f = S.af;
  const side = `<aside><div class="abrand">${logo(120)}<small>ADMIN</small></div>
    <button class="anav ${S.adminTab === 'log' ? 'on' : ''}" data-act="adminTab" data-tab="log">${ic('list', 20)} Log de acessos</button><button class="anav ${S.adminTab === 'users' ? 'on' : ''}" data-act="adminTab" data-tab="users">${ic('users', 20)} Usuários</button>
    <div class="aspace"></div><button class="anav" data-act="go" data-to="home">${ic('folder', 20)} Abrir o app</button><button class="anav" data-act="logout">${ic('logout', 20)} Sair</button></aside>`;
  let main;
  if (S.adminTab === 'log') {
    const L = logs.filter(l => (!f.uid || l.uid === f.uid) && (!f.sit || l.situacao === f.sit) && (!f.de || ymd(l.dataLogin) >= f.de) && (!f.ate || ymd(l.dataLogin) <= f.ate)).sort((a, b) => b.dataLogin.localeCompare(a.dataLogin));
    main = `<h1>Log de acessos</h1><p class="lead">Histórico de login e logout de todos os usuários.</p>
      <div class="stats"><div class="stat"><small>Registros no filtro</small><b>${L.length}</b></div><div class="stat"><small>Sessões ativas</small><b>${logs.filter(l => l.situacao === 'ativa').length}</b></div><div class="stat"><small>Usuários ativos</small><b>${users.filter(u => u.ativo).length} / ${users.length}</b></div><div class="stat"><small>Acessos hoje</small><b>${logs.filter(l => ymd(l.dataLogin) === ymd(Date.now())).length}</b></div></div>
      <div class="filters"><label>Usuário<select data-af="uid"><option value="">Todos</option>${users.map(u => `<option value="${u.uid}" ${f.uid === u.uid ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label><label>De<input type="date" data-af="de" value="${f.de}"></label><label>Até<input type="date" data-af="ate" value="${f.ate}"></label>
        <label>Situação<select data-af="sit"><option value="">Todas</option><option value="ativa" ${f.sit === 'ativa' ? 'selected' : ''}>Ativa</option><option value="encerrada" ${f.sit === 'encerrada' ? 'selected' : ''}>Encerrada</option></select></label><button class="chip" data-act="clearAF">Limpar filtros</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Usuário</th><th>Data</th><th>Hora login</th><th>Hora logout</th><th>Dispositivo</th><th>Situação</th></tr></thead><tbody>
      ${L.map(l => `<tr><td>${esc(l.nomeUsuario)}</td><td>${fmtD(l.dataLogin)}</td><td>${fmtT(l.dataLogin)}</td><td>${l.horaLogout ? fmtT(l.horaLogout) : '—'}</td><td>${esc(l.nomeDispositivo)}</td><td><span class="pill ${l.situacao}">${l.situacao === 'ativa' ? 'Ativa' : 'Encerrada'}</span></td></tr>`).join('') || `<tr><td colspan="6" class="muted">Nenhum registro para este filtro.</td></tr>`}</tbody></table></div>`;
  } else {
    main = `<h1>Usuários</h1><p class="lead">Ative ou desative contas. Contas desativadas não conseguem entrar no app.</p>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Cadastro</th><th>Dispositivos</th><th>Acessos</th><th>Situação</th></tr></thead><tbody>
      ${users.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${u.perfil === 'admin' ? 'Administrador' : 'Usuário'}</td><td>${fmtD(u.dataCadastro)}</td><td>${(u.dispositivos || []).length}</td><td>${logs.filter(l => l.uid === u.uid).length}</td>
        <td><button class="tgl ${u.ativo ? 'on' : ''}" data-act="toggleUser" data-id="${u.uid}" ${u.uid === S.user.uid ? 'disabled title="Você não pode desativar a própria conta"' : ''} aria-label="Ativar ou desativar"></button> <span class="pill ${u.ativo ? 'ativa' : 'inativo'}">${u.ativo ? 'Ativa' : 'Inativa'}</span></td></tr>`).join('')}</tbody></table></div>`;
  }
  return `<div class="screen"><div class="adm">${side}<main>${main}</main></div></div>`;
}

/* ---------- render ---------- */
function render() {
  if (S.screen === 'admin' && (!S.user || S.user.perfil !== 'admin')) S.screen = S.user ? 'home' : 'login';
  if (!S.user && !['login', 'cadastro'].includes(S.screen)) S.screen = 'login';
  document.body.classList.toggle('admin-mode', S.screen === 'admin');
  const v = {login: vLogin, cadastro: vCadastro, home: vHome, viewer: vViewer, abertos: vAbertos, acessos: vAcessos, conta: vConta, admin: vAdmin}[S.screen] || vLogin;
  const desk = isDesk(); document.body.classList.toggle('desk', desk);
  let html = v();
  if (desk && S.user && !['login', 'cadastro', 'admin'].includes(S.screen)) html = `<div class="dshell">${drawerHTML('side')}<div class="dmain">${html}</div></div>`;
  $('#app').innerHTML = html;
  if (desk && $('.side')) fillStorage();
  $('#selpop').classList.remove('show');
  if (S.screen === 'viewer') mountViewer();
  if (S.flash.length) setTimeout(() => { S.flash = []; }, 1900);
  renderFloats();
}

/* ---------- mapa de ações (data-act) ---------- */
const sel = () => [...S.sel];
const A = {
  noop() {}, closeSheet() { closeSheet(); },
  dlgResolve(el) { let v = el.dataset.val; if (v === '__input') v = $('#dlg-in').value; resolveDlg(v); },
  togglePw(el) { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; },
  go(el) {
    const to = el.dataset.to, s = LS.get('bom_session', null);
    if (s && to === 'admin') LS.set('bom_session', {...s, area: 'admin'}); if (s && to === 'home' && S.screen === 'admin') LS.set('bom_session', {...s, area: 'app'});
    closeSheet(); S.select = false; S.sel.clear(); S.loginErr = ''; S.screen = to; render();
  },
  sec(el) { closeSheet(); Object.assign(S, {screen: 'home', section: el.dataset.sec, cwd: null, filter: '', searchOpen: false, tf: 'all', select: false}); S.sel.clear(); render(); },
  drawer() { openDrawer(); },
  toAdmin() { S.adminIntent = true; S.loginErr = ''; try { history.replaceState(null, '', '#admin'); } catch (e) {} render(); },
  toApp() { S.adminIntent = false; S.loginErr = ''; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} render(); },
  logout() { logout(); },
  forgetCreds() { LS.del('bom_lembrar'); LS.set('bom_lembrar_off', true); render(); toast('E-mail e senha removidos deste aparelho'); },
  toggleSearch() { S.searchOpen = !S.searchOpen; if (!S.searchOpen) S.filter = ''; render(); if (S.searchOpen) setTimeout(() => $('#q') && $('#q').focus(), 30); },
  closeSearch() { S.searchOpen = false; S.filter = ''; render(); },
  up() { const c = item(S.cwd); S.cwd = c ? c.parent || null : null; render(); },
  goFolder(el) { S.cwd = el.dataset.id === 'root' ? null : el.dataset.id; S.filter = ''; render(); },
  openFolder(el) { Object.assign(S, {cwd: el.dataset.id, section: 'files', filter: '', searchOpen: false}); render(); },
  tf(el) { S.tf = el.dataset.v; render(); },
  toggleView() { S.view = S.view === 'grid' ? 'list' : 'grid'; savePrefs(); render(); },
  toggleNight() { S.night = !S.night; render(); },
  togglePanel() { S.openPanel = !S.openPanel; render(); },
  sortMenu(el) {
    const o = (k) => pi(S.sort === k ? 'check' : '<span style="width:20px"></span>', SORTS[k] === 'Data' ? 'Data de modificação' : SORTS[k], 'setSort', `data-k="${k}"`, S.sort === k ? 'on' : '');
    openPop(el, `<div class="plabel">Ordenar por</div>${Object.keys(SORTS).map(o).join('')}<div class="psep"></div>${pi(S.dir > 0 ? 'check' : '<span style="width:20px"></span>', 'Crescente (A→Z, antigo→novo)', 'setDir', 'data-d="1"', S.dir > 0 ? 'on' : '')}${pi(S.dir < 0 ? 'check' : '<span style="width:20px"></span>', 'Decrescente', 'setDir', 'data-d="-1"', S.dir < 0 ? 'on' : '')}<div class="psep"></div>${pi(S.view === 'grid' ? 'list' : 'grid', S.view === 'grid' ? 'Exibir em lista' : 'Exibir em grade', 'toggleView')}`, 250);
  },
  setSort(el) { S.sort = el.dataset.k; savePrefs(); render(); },
  setDir(el) { S.dir = +el.dataset.d; savePrefs(); render(); },
  homeMore(el) {
    if (S.section === 'trash') return openPop(el, pi('trash', 'Esvaziar lixeira', 'emptyTrash', '', 'danger'));
    openPop(el, `${S.section === 'files' ? pi('newfolder', 'Nova pasta', 'newFolder') + pi('upload', 'Importar arquivos', 'importFile') + pi('newdoc', 'Criar PDF', 'createPdf') + '<div class="psep"></div>' : ''}${pi('select', 'Selecionar', 'toggleSelect')}${pi('sort', 'Ordenar…', 'sortMenuFromMore')}${pi(S.view === 'grid' ? 'list' : 'grid', S.view === 'grid' ? 'Exibir em lista' : 'Exibir em grade', 'toggleView')}<div class="psep"></div>${pi('layers', 'Arquivos abertos', 'go', 'data-to="abertos"')}${pi('trash', 'Lixeira', 'sec', 'data-sec="trash"')}`);
  },
  sortMenuFromMore() { setTimeout(() => A.sortMenu($('[data-act="sortMenu"]') || $('[data-act="homeMore"]')), 0); },
  toggleSelect() { S.select = !S.select; S.sel.clear(); render(); },
  selAll() { listItems().forEach(i => S.sel.add(i.id)); render(); },
  selOpen() {
    const ids = sel().filter(id => item(id).type !== 'folder');
    if (ids.length < 2) return openDocs(ids);
    openSheet(`<h3>Abrir ${ids.length} arquivos</h3>${mi('layers', 'Em abas', 'openMode', `data-m="tabs" data-ids="${ids.join(',')}"`)}${mi('window', 'Em janelas flutuantes', 'openMode', `data-m="float" data-ids="${ids.join(',')}"`)}${mi('split', 'Lado a lado (tela dividida)', 'openMode', `data-m="split" data-ids="${ids.join(',')}"`)}`);
  },
  openMode(el) { closeSheet(); openDocs(el.dataset.ids.split(','), el.dataset.m); },
  selShare() { shareSheet(sel()); },
  async selMove() { const ids = sel(); if (!ids.length) return; const d = await pickFolder(`Mover ${ids.length} item(ns) para…`, new Set(ids)); if (d) doMove(ids, d === 'root' ? null : d); },
  async selCopy() { const ids = sel(); const d = await pickFolder(`Copiar ${ids.length} item(ns) para…`); if (d) copyItems(ids, d === 'root' ? null : d); },
  async selDelete() { const ids = sel(); if (await askConfirm('Mover para a lixeira', `Mover ${ids.length} item(ns) selecionado(s) para a lixeira? Você pode restaurá-los depois.`, 'Excluir')) trashItems(ids); },
  selFav() { const ids = sel(), all = ids.every(id => item(id).fav); ids.forEach(id => item(id).fav = !all); saveFS(); S.select = false; S.sel.clear(); render(); toast(all ? 'Removido dos favoritos' : 'Adicionado aos favoritos'); },
  selMore(el) { openPop(el, `${pi('check', 'Selecionar todos', 'selAll')}${pi('copy', 'Copiar para…', 'selCopy')}${pi('star', 'Favoritar / desfavoritar', 'selFav')}${pi('tag', 'Etiqueta…', 'tagSheet', `data-id="${sel().join(',')}"`)}${pi('window', 'Abrir em janelas flutuantes', 'openMode', `data-m="float" data-ids="${sel().join(',')}"`)}`); },
  fab(el) { openSheet(`<h3>Adicionar</h3>${mi('newfolder', 'Nova pasta', 'newFolder')}${mi('upload', 'Importar arquivos do aparelho', 'importFile')}${mi('newdoc', 'Criar novo PDF', 'createPdf')}<p class="muted small">Importe PDFs, imagens, textos ou qualquer outro arquivo. Os outros formatos ficam organizados nas pastas e podem ser enviados para outros apps.</p>`); },
  newFolder() { closeSheet(); newFolder(S.cwd); },
  newSub(el) { const id = el.dataset.id; closeSheet(); S.cwd = id; S.section = 'files'; render(); newFolder(id); },
  importFile() { closeSheet(); $('#file-in').click(); },
  createPdf() { createPdfSheet(); },
  itemMenu(el) { itemPop(el.dataset.id, el); },
  openItem(el) { openFile(el.dataset.id); },
  floatItem(el) { openDocs([el.dataset.id], 'float'); },
  shareItem(el) { shareSheet([el.dataset.id]); },
  convertItem(el) { convertSheet(el.dataset.id); },
  doConvert(el) { closeSheet(); if (el.dataset.to !== 'docx') convert(el.dataset.id, el.dataset.to); },
  doShare(el) { closeSheet(); shareOrDownload(el.dataset.ids.split(',')); },
  doDownload(el) { closeSheet(); shareOrDownload(el.dataset.ids.split(','), true); },
  renameItem(el) { renameItem(el.dataset.id); },
  async moveItem(el) { const id = el.dataset.id, d = await pickFolder(`Mover “${item(id).name}” para…`, new Set([id])); if (d) doMove([id], d === 'root' ? null : d); },
  async copyItem(el) { const id = el.dataset.id, d = await pickFolder(`Copiar “${item(id).name}” para…`); if (d) copyItems([id], d === 'root' ? null : d); },
  duplicateItem(el) { const it = item(el.dataset.id); copyItems([it.id], it.parent || null); },
  toggleFav(el) { const it = item(el.dataset.id); it.fav = !it.fav; saveFS(); S.select = false; S.sel.clear(); render(); toast(it.fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', {sub: esc(it.name)}); },
  tagSheet(el) { const ids = el.dataset.id.split(','), cur = ids.length === 1 ? item(ids[0]).tag : null; openSheet(`<h3>Etiqueta</h3>${TAGS.map(t => `<button class="mi" data-act="setTag" data-ids="${ids.join(',')}" data-tag="${t.id}"><i class="tdot" style="background:${t.c};width:14px;height:14px"></i><span>${t.name}</span>${cur === t.id ? `<span style="margin-left:auto;color:var(--accent2)">${ic('check', 18)}</span>` : ''}</button>`).join('')}<button class="mi" data-act="setTag" data-ids="${ids.join(',')}" data-tag="">${ic('close')}<span>Sem etiqueta</span></button>`); },
  setTag(el) { closeSheet(); const t = el.dataset.tag || null; el.dataset.ids.split(',').forEach(id => { const it = item(id); if (it && it.type !== 'folder') it.tag = t; }); saveFS(); S.select = false; S.sel.clear(); render(); toast(t ? `Etiqueta “${tagOf(t).name}” aplicada` : 'Etiqueta removida'); },
  colorSheet(el) { const it = item(el.dataset.id); openSheet(`<div class="sh-head">${folderSvg(it.color, 36)}<div><b>${esc(it.name)}</b><small>Cor da pasta</small></div></div><div class="swatches">${FOLDER_COLORS.map(c => `<button class="sw ${it.color === c ? 'on' : ''}" style="background:${c}" data-act="setColor" data-id="${it.id}" data-c="${c}">${it.color === c ? ic('check', 18) : ''}</button>`).join('')}</div>`); },
  setColor(el) { const it = item(el.dataset.id); it.color = el.dataset.c; saveFS(); closeSheet(); render(); },
  details(el) { detailsSheet(el.dataset.id); },
  async deleteItem(el) { const it = item(el.dataset.id), n = it.type === 'folder' ? descendants(it.id).filter(d => !d.trashed).length : 0; if (await askConfirm('Mover para a lixeira', `Mover “${esc(it.name)}”${n ? ` e os ${n} item(ns) dentro dela` : ''} para a lixeira?`, 'Excluir')) trashItems([it.id]); },
  restore(el) { closeSheet(); restoreItem(el.dataset.id); render(); toast('Item restaurado', {sub: `Em ${esc(folderName(item(el.dataset.id).parent))}`}); },
  async purge(el) { const id = el.dataset.id, name = item(id).name; if (await askConfirm('Excluir definitivamente', `“${esc(name)}” será apagado do aparelho. Não dá para desfazer.`, 'Excluir')) { purgeItem(id); render(); toast('Excluído definitivamente'); } },
  async emptyTrash() { const L = S.fs.items.filter(i => i.trashed); if (!L.length) return; if (await askConfirm('Esvaziar lixeira', `Apagar definitivamente ${L.length} item(ns)?`, 'Esvaziar')) { L.forEach(i => item(i.id) && purgeItem(i.id)); render(); toast('Lixeira esvaziada'); } },
  // leitor
  tab(el) { S.active = el.dataset.id; S.layout = 'tabs'; render(); },
  closeTab(el, e) { e.stopPropagation(); closeDoc(el.dataset.id); render(); },
  addTab() { const files = S.fs.items.filter(i => i.type !== 'folder' && alive(i) && kindOf(i) !== 'other' && !S.open.includes(i.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); openSheet(`<h3>Abrir outro arquivo</h3><div class="plist">${files.map(f => `<button class="prow" data-act="addTabPick" data-id="${f.id}">${fileIcon(f, 30)}<span class="ell">${esc(f.name)}</span></button>`).join('') || '<p class="muted">Todos os arquivos já estão abertos.</p>'}</div>`); },
  addTabPick(el) { const id = el.dataset.id; closeSheet(); S.open.push(id); item(id).opened = Date.now(); if (S.layout === 'split') { const a = splitIds().filter(Boolean); S.split = [a[0], id]; S.focusDoc = id; } else S.active = id; render(); },
  toggleSplit() { closeSheet(); S.layout = S.layout === 'split' ? 'tabs' : 'split'; if (S.layout === 'split') { S.split = [S.active, ...(S.split || []).filter(x => x !== S.active)]; S.focusDoc = S.active; } render(); },
  splitDir() { S.splitDir = S.splitDir === 'cols' ? 'rows' : 'cols'; render(); },
  closePane(el) { const ids = splitIds(), gone = ids[+el.dataset.k]; S.split = ids.filter(x => x && x !== gone); if (S.split.length < 1) { S.layout = 'tabs'; } else if (!S.open.some(o => !S.split.includes(o))) { S.layout = 'tabs'; S.active = S.split[0]; } render(); },
  pg(el) { const sc = $('#app .doc-scroll[data-main]'); if (sc && sc._goto) sc._goto((sc._cur || 1) + +el.dataset.d); },
  pgp(el) { const sc = $(`#app .doc-scroll[data-pane-i="${el.dataset.k}"]`); if (sc && sc._goto) sc._goto((sc._cur || 1) + +el.dataset.d); },
  fpg(el) { const sc = $(`[data-win="${el.dataset.win}"] .doc-scroll`); if (sc && sc._goto) sc._goto((sc._cur || 1) + +el.dataset.d); },
  async gotoPage() { const sc = $('#app .doc-scroll[data-main]'); if (!sc || sc._n < 2) return; const v = await askText(`Ir para a página (1 a ${sc._n})`, {type: 'number', ok: 'Ir', value: String(sc._cur || 1)}); const n = parseInt(v, 10); if (n) sc._goto(n); },
  zoom(el) { const sc = $('#app .doc-scroll[data-main]'); if (!sc) return; setZoom(sc, S.zoom * (+el.dataset.d > 0 ? 1.25 : .8)); zoomDone(sc); },
  zoomFit() { const sc = $('#app .doc-scroll[data-main]'); if (!sc) return; setZoom(sc, 1); zoomDone(sc); },
  vmode(el) { S.vmode = el.dataset.m; S.tool = S.vmode === 'annot' ? 'hl' : S.vmode === 'edit' ? 'text' : 'hand'; clearSel(); render(); },
  tool(el) { S.tool = el.dataset.t; render(); },
  penColor() { S.penColor = PEN_COLORS[(PEN_COLORS.indexOf(S.penColor) + 1) % PEN_COLORS.length]; if (S.tool !== 'pen') S.tool = 'pen'; render(); },
  addImg() { $('#img-in').click(); },
  addSign() { signaturePad(); },
  sigClear() { const c = $('#sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); c._b = null; },
  sigOk() {
    const c = $('#sig'), b = c._b, it = curDoc(); if (!b || !it) return toast('Desenhe sua assinatura no quadro', {err: true});
    const p = 8, x = Math.max(0, b[0] - p), y = Math.max(0, b[1] - p), w = Math.min(c.width, b[2] + p) - x, h = Math.min(c.height, b[3] + p) - y;
    const o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
    closeSheet(); addAnn(it, {type: 'sign', page: S.pos[it.id] || 1, x: 52, y: 78, w: 34, ar: h / w, src: o.toDataURL('image/png')});
    S.tool = 'hand'; render(); toast('Assinatura inserida', {sub: 'Arraste para posicionar'});
  },
  undo() { const it = curDoc(), h = it && S.hist[it.id]; if (!h || !h.u.length) return; h.r.push(JSON.stringify(it.ann || [])); it.ann = JSON.parse(h.u.pop()); saveFS(); drawAnn(it.id); updUndo(); },
  redo() { const it = curDoc(), h = it && S.hist[it.id]; if (!h || !h.r.length) return; h.u.push(JSON.stringify(it.ann || [])); it.ann = JSON.parse(h.r.pop()); saveFS(); drawAnn(it.id); updUndo(); },
  annDel(el) { closeSheet(); removeAnn(item(el.dataset.id), el.dataset.ann); },
  async annEdit(el) { const it = item(el.dataset.id), a = it.ann.find(x => x.id === el.dataset.ann); const v = await askText('Editar', {value: a.text, multi: a.type === 'note'}); if (v != null && v.trim()) { snap(it); a.text = v.trim(); saveFS(); drawAnn(it.id); } },
  annSize(el) { const it = item(el.dataset.id), a = it.ann.find(x => x.id === el.dataset.ann); snap(it); a.w = clamp(a.w * +el.dataset.d, 8, 95); saveFS(); drawAnn(it.id); },
  shareCur() { const it = curDoc(); if (it) shareSheet([it.id]); },
  viewerMenu(el) {
    const it = curDoc() || item(S.active), split = S.layout === 'split', a = `data-id="${it.id}"`;
    openPop(el, `${kindOf(it) === 'pdf' && (it.pages || 1) > 1 ? pi('thumbs', 'Miniaturas das páginas', 'thumbs') + pi('page', 'Ir para a página…', 'gotoPage') : ''}${pi('search', 'Buscar no documento', 'findOpen')}${pi('moon', S.night ? 'Desligar leitura noturna' : 'Leitura noturna', 'toggleNight')}<div class="psep"></div>
      ${pi(split ? 'layers' : 'split', split ? 'Voltar para abas' : 'Tela dividida', 'toggleSplit')}${pi('window', 'Abrir em janela flutuante', 'vFloat', a)}${pi('layers', 'Arquivos abertos', 'go', 'data-to="abertos"')}<div class="psep"></div>
      ${pi('send', 'Enviar para', 'shareItem', a)}${pi('convert', 'Converter arquivo', 'convertItem', a)}${pi('rename', 'Renomear', 'renameItem', a)}${pi(it.fav ? 'starF' : 'star', it.fav ? 'Remover dos favoritos' : 'Favoritar', 'vFav', a)}${pi('info', 'Detalhes', 'details', a)}<div class="psep"></div>${pi('close', 'Fechar documento', 'vClose', a, 'danger')}`, 250);
  },
  thumbs() { openThumbs(); },
  railGo(el) { const sc = $('#app .doc-scroll[data-main]'); if (sc && sc._goto) sc._goto(+el.dataset.p); },
  thumbGo(el) { closeSheet(); const it = curDoc(); const sc = $(`#app .doc-scroll[data-doc="${it.id}"]`); if (sc && sc._goto) sc._goto(+el.dataset.p); },
  findOpen() { findSheet(); },
  findGo(el) { const it = curDoc(); S.find = {doc: it.id, term: el.dataset.term}; S.pos[it.id] = +el.dataset.p; closeSheet(); render(); },
  findClear() { S.find = null; render(); },
  vFloat(el) { const id = el.dataset.id; openFloat(id); S.open = S.open.filter(x => x !== id); if (S.active === id) S.active = S.open[0] || null; if (!S.open.length) S.screen = 'home'; render(); },
  vFav(el) { const it = item(el.dataset.id); it.fav = !it.fav; saveFS(); toast(it.fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); },
  vClose(el) { closeDoc(el.dataset.id); render(); },
  // seleção de texto
  async txtCopy() { const t = S._sel && S._sel.text; try { await navigator.clipboard.writeText(t); toast('Texto copiado'); } catch (e) { toast('Não foi possível copiar aqui', {err: true}); } clearSel(); },
  async txtPaste() { const s = S._sel; if (!s) return; let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) {} if (!t) { clearSel(); return toast('Área de transferência vazia ou bloqueada', {err: true}); } const r = selRects(), last = r[r.length - 1] || {x: 10, y: 10, w: 0, h: 2}; addAnn(item(s.doc), {type: 'text', page: +s.pg.dataset.page, x: clamp(last.x + last.w + 1, 0, 85), y: last.y + last.h / 2, text: t.slice(0, 300)}); clearSel(); },
  txtHl() { const s = S._sel; if (!s) return; const it = item(s.doc), page = +s.pg.dataset.page, r = selRects(); if (r.length) addAnns(it, r.map(q => ({type: 'hl', page, x: q.x, y: q.y, w: q.w, h: q.h}))); clearSel(); toast('Trecho realçado'); },
  async txtNote() { const s = S._sel; if (!s) return; const r = selRects(), last = r[r.length - 1], quote = s.text.slice(0, 120), doc = s.doc, page = +s.pg.dataset.page; clearSel(); const v = await askText('Comentar trecho', {multi: true, ok: 'Comentar', placeholder: `Sobre “${quote.slice(0, 40)}…”`}); if (v && v.trim() && last) addAnn(item(doc), {type: 'note', page, x: clamp(last.x + last.w + 2, 2, 97), y: last.y + last.h / 2, text: v.trim(), quote}); },
  // janelas e abertos
  fClose(el) { S.floats = S.floats.filter(f => f.wid !== el.dataset.win); renderFloats(); if (['abertos', 'home'].includes(S.screen)) render(); },
  fMax(el) { const f = S.floats.find(x => x.wid === el.dataset.win); if (!f) return; S.floats = S.floats.filter(x => x !== f); if (!S.open.includes(f.doc)) S.open.push(f.doc); S.active = f.doc; S.layout = 'tabs'; S.screen = 'viewer'; render(); },
  resume(el) { const id = el.dataset.id, f = S.floats.find(x => x.doc === id); if (S.open.includes(id) || !f) { if (!S.open.includes(id)) S.open.push(id); S.active = id; S.layout = 'tabs'; S.screen = 'viewer'; render(); } else { f.z = ++S.z; renderFloats(); } },
  toWin(el) { const id = el.dataset.id; if (S.floats.some(f => f.doc === id)) S.floats = S.floats.filter(f => f.doc !== id); else openFloat(id); render(); },
  closeDoc(el, e) { e && e.stopPropagation(); closeDoc(el.dataset.id); render(); },
  closeAll() { S.open = []; S.floats = []; render(); toast('Todos os arquivos foram fechados'); },
  // admin
  adminTab(el) { S.adminTab = el.dataset.tab; render(); },
  clearAF() { S.af = {uid: '', de: '', ate: '', sit: ''}; render(); },
  toggleUser(el) {
    if (el.disabled) return;
    const users = getUsers(), u = users.find(x => x.uid === el.dataset.id); if (!u) return;
    u.ativo = !u.ativo; setUsers(users);
    if (!u.ativo) { const logs = getLogs(); logs.filter(l => l.uid === u.uid && l.situacao === 'ativa').forEach(l => { l.situacao = 'encerrada'; l.horaLogout = new Date().toISOString(); }); setLogs(logs); }
    render(); toast(`Conta de ${esc(u.nome)} ${u.ativo ? 'ativada' : 'desativada'}`);
  }
};
IC.select = '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>';

/* ---------- eventos globais ---------- */
document.addEventListener('click', e => {
  if (P.sup && Date.now() - P.sup < 600 && Math.hypot(e.clientX - P.ux, e.clientY - P.uy) < 12) { P.sup = 0; return; } // ignora o clique gerado pelo toque no item (evita fechar o menu recém-aberto)
  const el = e.target.closest('[data-act]');
  if (el) { if (el.disabled) return; const f = A[el.dataset.act]; if (!f) return; if (el.closest('.pop') && !/Menu$|More$/.test(el.dataset.act)) closeSheet(); f(el, e); return; }
  const sc = e.target.closest('.doc-scroll[data-edit]');
  if (sc && (S.tool === 'note' || S.tool === 'text')) { const pg = e.target.closest('.page[data-page]'); if (pg && !e.target.closest('[data-ann]')) addPointAnn(e, pg, item(sc.dataset.doc)); }
});
document.addEventListener('pointerdown', e => {
  if (handleFloatPointer(e)) return;
  const tileEl = e.target.closest('#app [data-tile]');
  if (tileEl && S.screen === 'home' && !e.target.closest('button') && e.button === 0) { pressStart(e, tileEl); return; }
  const sc = e.target.closest('.doc-scroll[data-edit]'); if (!sc) return;
  const pane = sc.closest('.pane');
  if (pane && S.focusDoc !== sc.dataset.doc) { S.focusDoc = sc.dataset.doc; $$('.pane').forEach(p => p.classList.toggle('focus', p === pane)); updUndo(); }
  const pg = e.target.closest('.page[data-page]'); if (!pg || (e.pointerType === 'touch' && !e.isPrimary)) return;
  const it = item(sc.dataset.doc), a = e.target.closest('[data-ann]');
  if (S.tool === 'erase') { if (a) { e.preventDefault(); removeAnn(it, a.dataset.ann); } return; }
  if (a && S.tool !== 'pen') startAnnDrag(e, a, it);
  else if (S.tool === 'hl' && !a) startHighlight(e, pg, it);
  else if (S.tool === 'pen') startInk(e, pg, it);
});
document.addEventListener('pointermove', e => {
  if (!P.active || e.pointerId !== P.pid) return;
  if (P.drag) { dragMove(e); return; }
  if (Math.hypot(e.clientX - P.x, e.clientY - P.y) > 8) { if (S.section !== 'trash' && (P.long || P.type === 'mouse')) startDrag(e); else cancelPress(); }
});
document.addEventListener('pointerup', e => {
  if (!P.active || e.pointerId !== P.pid) return;
  clearTimeout(P.t); P.active = false; P.el && P.el.classList.remove('lift'); P.sup = Date.now(); P.ux = e.clientX; P.uy = e.clientY;
  if (P.drag) return dragEnd(true);
  if (P.long) return longPress(P.id);
  tapTile(P.id);
});
document.addEventListener('pointercancel', e => { if (!P.active) return; if (P.drag) dragEnd(false); cancelPress(); });
document.addEventListener('touchmove', e => { if (P.active && (P.long || P.drag)) e.preventDefault(); }, {passive: false});
document.addEventListener('contextmenu', e => {
  const t = e.target.closest('#app [data-tile]'); if (!t) return;
  e.preventDefault(); if (!P.active && !P.long && S.section !== 'trash') itemPop(t.dataset.tile, t);
});
document.addEventListener('selectionchange', () => { clearTimeout(_selT); _selT = setTimeout(checkSel, 180); });
$('#selpop').addEventListener('pointerdown', e => e.preventDefault());
$('#selpop').addEventListener('mousedown', e => e.preventDefault());
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  if (f.dataset.form === 'login') doLogin(fd);
  else if (f.dataset.form === 'cadastro') doCadastro(fd);
  else if (f.dataset.form === 'create') {
    const titulo = String(fd.get('titulo') || '').trim().replace(/[\\/:*?"<>|]/g, ''), conteudo = String(fd.get('conteudo') || ''); if (!titulo) return;
    const it = addFile({ext: 'pdf', name: titulo + '.pdf', parent: S.cwd || null, source: 'created', content: conteudo});
    it.pages = createdChunks(it).length; it.size = 18000 + conteudo.length * 2; saveFS(); resolveDlg(null); render();
    toast(`PDF “${esc(it.name)}” criado`, {label: 'Abrir', fn: () => openDocs([it.id])});
  }
});
document.addEventListener('input', e => { if (e.target.id === 'q') { S.filter = e.target.value; const p = e.target.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); try { q.setSelectionRange(p, p); } catch (_) {} } } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'file-in') { importFiles([...t.files]); t.value = ''; }
  else if (t.id === 'img-in') { insertImage(t.files[0]); t.value = ''; }
  else if (t.dataset.af != null) { S.af[t.dataset.af] = t.value; render(); }
  else if (t.dataset.paneSel != null) { const ids = splitIds(); ids[+t.dataset.paneSel] = t.value; S.split = [...new Set(ids.filter(Boolean))]; S.focusDoc = t.value; render(); }
});
document.addEventListener('keydown', e => {
  if (S.screen === 'viewer' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') A.pg({dataset: {d: 1}}); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') A.pg({dataset: {d: -1}});
  }
  if (e.key === 'Escape') { if ($('#overlay').classList.contains('show')) closeSheet(); else if (S.select) A.toggleSelect(); }
});
window.addEventListener('beforeunload', () => { try { if (S.fs && S.user) LS.set(fsKey(), S.fs); } catch (e) {} });
const DESK = window.matchMedia('(min-width: 900px)');
const isDesk = () => DESK.matches;
try { DESK.addEventListener('change', () => { closeSheet(); render(); }); } catch (e) { DESK.addListener(() => render()); }

/* ---------- início ---------- */
(async function init() {
  await seed();
  if (location.hash === '#admin') S.adminIntent = true;
  const s = LS.get('bom_session', null);
  if (s) {
    const u = getUsers().find(x => x.uid === s.uid);
    if (u && u.ativo) { S.user = u; loadFS(); loadPrefs(); S.screen = s.area === 'admin' && u.perfil === 'admin' ? 'admin' : 'home'; } // sessão salva: entra direto, sem novo registro no log
    else { closeLog(s.logId); LS.del('bom_session'); if (u) S.loginErr = 'Sua conta foi desativada pelo administrador.'; }
  }
  render();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if (!storageOk()) setTimeout(() => toast('Este navegador não está salvando os dados', {sub: 'Modo anônimo ou visualização do arquivo. Abra no Chrome/Edge ou use o app.', err: true}), 600);
  if (NATIVE && CP().App) CP().App.addListener('backButton', () => {
    if ($('#overlay').classList.contains('show')) return closeSheet();
    if (S.select) return A.toggleSelect();
    if (S.screen === 'viewer') { S.screen = 'home'; return render(); }
    if (S.screen === 'home' && S.cwd) return A.up();
    if (S.screen === 'home' && S.section !== 'files') return A.sec({dataset: {sec: 'files'}});
    if (['abertos', 'acessos', 'conta', 'admin', 'cadastro'].includes(S.screen)) { S.screen = S.user ? 'home' : 'login'; return render(); }
    CP().App.exitApp();
  });
})();
