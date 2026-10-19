'use strict';
const $ = id => document.getElementById(id);
const KEY = 'prompterpro.document.v1';
const LIMIT = 200000;
const defaults = {speed: 1, fontSize: 32, lineHeight: 1.7, mirrorH: false, mirrorV: false, guide: true, accent: '#00d4aa'};
const colors = [...document.querySelectorAll('.color-btn')].map(b => b.dataset.color);
let settings = {...defaults}, playing = false, frame = null, previousTime = null;
let scrollTarget = 0;
let loaded = false, knownStored = null, protectedStored = false, dirty = false, editRevision = 0;
const editor = $('scriptEditor'), rendered = $('renderedContent'), scroller = $('prompterContent');

function status(message, error = false) {
  $('saveStatus').textContent = message;
  $('saveStatus').classList.toggle('error', error);
}
function snapshot() { return {format: 'prompterpro', version: 1, script: editor.value, settings: {...settings}}; }
function validate(value) {
  if (!value || value.format !== 'prompterpro' || value.version !== 1 || typeof value.script !== 'string' || value.script.length > LIMIT || !value.settings) throw Error('Unsupported backup');
  const s = value.settings;
  for (const [key, min, max] of [['speed', .2, 4], ['fontSize', 18, 72], ['lineHeight', 1.2, 2.5]]) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max) throw Error('Invalid setting');
  }
  for (const key of ['mirrorH', 'mirrorV', 'guide']) if (typeof s[key] !== 'boolean') throw Error('Invalid toggle');
  if (!colors.includes(s.accent)) throw Error('Invalid color');
  return {format: 'prompterpro', version: 1, script: value.script, settings: Object.fromEntries(Object.keys(defaults).map(k => [k, s[k]]))};
}
function save(explicit = false) {
  try {
    if (editor.value.length > LIMIT) throw Error('Script too large');
    const current = localStorage.getItem(KEY);
    if (protectedStored || current !== knownStored) {
      if (!explicit || !confirm('A different or unreadable save exists. Export this draft first if needed. Replace the browser save with this draft?')) {
        status('Not saved: another or unreadable save exists. Export this draft, or choose Save here to replace it.', true);
        return false;
      }
    }
    const serialized = JSON.stringify(snapshot());
    localStorage.setItem(KEY, serialized);
    knownStored = serialized; protectedStored = false; dirty = false;
    status('Saved in this browser. Export a backup for safekeeping.');
    return true;
  } catch {
    status('Not saved: browser storage is unavailable or full. Export a backup before closing.', true);
    return false;
  }
}
function changed() { editRevision++; dirty = true; save(); }

// Only build fixed, known DOM elements. Never parse script content as HTML.
// Raw HTML, URLs and images remain inert text. Marked supplies tokens, not markup.
function tokensToDOM(tokens, parent) {
  for (const token of tokens || []) {
    const append = (tag, children = token.tokens) => {
      const el = document.createElement(tag);
      if (children) tokensToDOM(children, el); else el.textContent = token.text || '';
      parent.append(el); return el;
    };
    switch (token.type) {
      case 'space': break;
      case 'heading': append('h' + Math.min(6, Math.max(1, token.depth))); break;
      case 'paragraph': append('p'); break;
      case 'text': if (token.tokens) tokensToDOM(token.tokens, parent); else parent.append(document.createTextNode(token.text || '')); break;
      case 'strong': append('strong'); break;
      case 'em': append('em'); break;
      case 'del': append('del'); break;
      case 'codespan': append('code', null); break;
      case 'code': { const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = token.text; pre.append(code); parent.append(pre); break; }
      case 'blockquote': append('blockquote'); break;
      case 'br': append('br', []); break;
      case 'hr': append('hr', []); break;
      case 'list': {
        const list = document.createElement(token.ordered ? 'ol' : 'ul');
        if (token.ordered && Number.isSafeInteger(token.start)) list.start = token.start;
        for (const item of token.items) { const li = document.createElement('li'); if (item.task) li.append(document.createTextNode(item.checked ? '☑ ' : '☐ ')); tokensToDOM(item.tokens, li); list.append(li); }
        parent.append(list); break;
      }
      case 'link': tokensToDOM(token.tokens, parent); break;
      case 'image': parent.append(document.createTextNode('[Image: ' + (token.text || '') + ']')); break;
      case 'table': {
        const table = document.createElement('table');
        for (const [index, row] of [token.header, ...token.rows].entries()) {
          const tr = document.createElement('tr');
          for (const cell of row) { const td = document.createElement(index === 0 ? 'th' : 'td'); tokensToDOM(cell.tokens, td); tr.append(td); }
          table.append(tr);
        }
        parent.append(table); break;
      }
      default: parent.append(document.createTextNode(token.raw || token.text || ''));
    }
  }
}
function renderScript() {
  pause();
  try {
    if (editor.value.length > LIMIT) throw Error('Script too large');
    const fragment = document.createDocumentFragment();
    tokensToDOM(marked.lexer(editor.value), fragment);
    rendered.replaceChildren(fragment); loaded = Boolean(editor.value.trim());
    scroller.scrollTop = 0; applySettings(); updatePosition();
    return true;
  } catch {
    status('Could not load this script. Your editor text is still here; export it before retrying.', true);
    return false;
  }
}
function updatePosition() {
  const max = scroller.scrollHeight - scroller.clientHeight;
  $('scrollPosition').textContent = (max > 0 ? Math.min(100, Math.round(scroller.scrollTop / max * 100)) : 0) + '%';
}
function playState() {
  $('playIcon').style.display = playing ? 'none' : 'block';
  $('pauseIcon').style.display = playing ? 'block' : 'none';
  $('playPauseText').textContent = playing ? 'Pause' : 'Play';
  $('statusText').textContent = playing ? 'Playing' : 'Paused';
  $('statusDot').classList.toggle('playing', playing);
}
function pause() { playing = false; cancelAnimationFrame(frame); frame = null; previousTime = null; playState(); }
function tick(time) {
  if (!playing) return;
  if (Math.abs(scroller.scrollTop - scrollTarget) > 2) scrollTarget = scroller.scrollTop;
  if (previousTime !== null) { scrollTarget += settings.speed * 31.25 * Math.min(time - previousTime, 100) / 1000; scroller.scrollTop = scrollTarget; }
  previousTime = time; updatePosition();
  if (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1) { pause(); return; }
  frame = requestAnimationFrame(tick);
}
function togglePlay() {
  if (playing) { pause(); return; }
  if (!loaded) { status('Load a script before playing.'); return; }
  scrollTarget = scroller.scrollTop; playing = true; playState(); frame = requestAnimationFrame(tick);
}
function reset() { pause(); scroller.scrollTop = 0; updatePosition(); }
function applySettings() {
  for (const [key, id, display] of [['speed', 'speed', settings.speed.toFixed(1) + 'x'], ['fontSize', 'fontSize', settings.fontSize + 'px'], ['lineHeight', 'lineHeight', settings.lineHeight.toFixed(1)]]) {
    $(id + 'Slider').value = settings[key]; $(id + 'Value').textContent = display;
  }
  rendered.style.fontSize = settings.fontSize + 'px'; rendered.style.lineHeight = settings.lineHeight;
  for (const [key, css] of [['mirrorH', 'mirror-h'], ['mirrorV', 'mirror-v']]) {
    rendered.classList.toggle(css, settings[key]); $(key).classList.toggle('active', settings[key]); $(key).setAttribute('aria-pressed', settings[key]);
  }
  $('showGuide').classList.toggle('active', settings.guide); $('showGuide').setAttribute('aria-pressed', settings.guide);
  $('centerLine').style.display = settings.guide ? 'block' : 'none';
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.setProperty('--accent-glow', settings.accent + '40');
  document.querySelectorAll('.color-btn').forEach(b => { b.classList.toggle('active', b.dataset.color === settings.accent); b.setAttribute('aria-label', 'Accent ' + b.dataset.color); });
}
function controls(open) {
  if (matchMedia('(max-width: 900px)').matches) { $('app').classList.remove('fullscreen'); $('sidebar').classList.toggle('open', open); }
  else $('app').classList.toggle('fullscreen', !open);
  $('fullscreenBtn').setAttribute('aria-expanded', open);
  if (open) $('closeControls').focus(); else $('fullscreenBtn').focus();
}
function toggleControls() { const mobile = matchMedia('(max-width: 900px)').matches; controls(mobile ? !$('sidebar').classList.contains('open') : $('app').classList.contains('fullscreen')); }
$('fullscreenBtn').addEventListener('click', toggleControls);
$('closeControls').addEventListener('click', () => controls(false));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.tab + '-panel'));
}));
$('loadScript').addEventListener('click', () => { if (renderScript()) { save(); if (matchMedia('(max-width: 900px)').matches) controls(false); } });
$('playPauseBtn').addEventListener('click', togglePlay);
$('resetBtn').addEventListener('click', reset);
for (const key of ['speed', 'fontSize', 'lineHeight']) {
  $(key + 'Slider').setAttribute('aria-label', {speed: 'Scroll speed', fontSize: 'Font size', lineHeight: 'Line height'}[key]);
  $(key + 'Slider').addEventListener('input', e => { settings[key] = Number(e.target.value); applySettings(); changed(); });
}
for (const [id, key] of [['mirrorH', 'mirrorH'], ['mirrorV', 'mirrorV'], ['showGuide', 'guide']]) $(id).addEventListener('click', () => { settings[key] = !settings[key]; applySettings(); changed(); });
document.querySelectorAll('.color-btn').forEach(b => b.addEventListener('click', () => { settings.accent = b.dataset.color; applySettings(); changed(); }));
editor.addEventListener('input', changed);
$('saveScript').addEventListener('click', () => save(true));
$('exportScript').addEventListener('click', () => {
  let url;
  try {
    url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'prompterpro-backup.json'; document.body.append(a); a.click(); a.remove();
    status('Backup download requested. Check Downloads before closing; cancelled downloads do not create a backup.');
  } catch { status('Export could not start. Copy your script to a text file before closing.', true); }
  finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 60000); }
});
$('importScript').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const revision = editRevision;
  try {
    if (file.size > 2000000) throw Error('Too large');
    const value = validate(JSON.parse(await file.text()));
    if (editRevision !== revision) { status('Import cancelled because you edited while the file was being read. Try again.', true); return; }
    if (!confirm('Replace the current script and settings with this backup? Export your current draft first if you need to keep it.')) return;
    pause(); editor.value = value.script; settings = value.settings; editRevision++; dirty = true;
    if (renderScript()) save();
  } catch { status('Import rejected: use a valid PrompterPro version 1 backup. Your current script and settings were kept.', true); }
});
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('textarea,input,button,select,[contenteditable="true"]')) return;
  const key = e.code;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','KeyF','KeyH','KeyV','KeyR','Escape'].includes(key)) e.preventDefault();
  if (key === 'Space') togglePlay();
  else if (key === 'KeyR') reset();
  else if (key === 'KeyF') toggleControls();
  else if (key === 'Escape') controls(false);
  else if (key === 'Home') scroller.scrollTop = 0;
  else if (key === 'End') scroller.scrollTop = scroller.scrollHeight;
  else if (key === 'ArrowLeft') scroller.scrollTop -= 50;
  else if (key === 'ArrowRight') scroller.scrollTop += 50;
  else if (key === 'ArrowUp' || key === 'ArrowDown') { settings.speed = Math.round(Math.min(4, Math.max(.2, settings.speed + (key === 'ArrowUp' ? .2 : -.2))) * 10) / 10; applySettings(); changed(); }
  else if (key === 'KeyH' || key === 'KeyV') { const name = key === 'KeyH' ? 'mirrorH' : 'mirrorV'; settings[name] = !settings[name]; applySettings(); changed(); }
  updatePosition();
});
scroller.addEventListener('scroll', updatePosition);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { protectedStored = true; status('Browser save changed in another tab. Export this draft before saving over it.', true); } });
try {
  knownStored = localStorage.getItem(KEY);
  if (knownStored !== null) {
    const restored = validate(JSON.parse(knownStored)); editor.value = restored.script; settings = restored.settings;
    renderScript(); status('Restored from this browser. Export a backup for safekeeping.');
  }
} catch { protectedStored = true; status('Browser save could not be restored. It has not been overwritten. Import a backup or export new work.', true); }
applySettings(); updatePosition();
$('fullscreenBtn').setAttribute('aria-expanded', !matchMedia('(max-width: 900px)').matches);
