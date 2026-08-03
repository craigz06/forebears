#!/usr/bin/env node
'use strict';

// Static-site generator for Forebears.
//
// Reads the same JSON data view/person-data.js fetches at runtime, bakes
// it into a copy of view/person.html per person (window.__ARCHIVE_DATA__
// instead of fetch()), and copies only the photos/videos those pages
// actually reference. Output lands in archive/ — zip it or copy it to an
// SD card, open archive/index.html, no server required.
//
// Run: node generate-archive.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'archive');
const FOLDERS = ['eras', 'stories', 'photos', 'cars', 'art', 'architecture', 'inventions', 'books'];

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function tryReadJSON(p) { try { return readJSON(p); } catch (e) { return null; } }

function parseStartYear(years) {
  if (!years) return Infinity;
  const m = String(years).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : Infinity;
}

// Mirrors view/person-data.js's findRecordsForPerson() — keep in sync if
// that file's matching/sorting logic changes.
function findRecordsForPerson(folder, personId, person) {
  const idx = tryReadJSON(path.join(ROOT, folder, 'index.json'));
  if (!idx || !Array.isArray(idx.files)) return [];
  const matches = [];
  for (const filename of idx.files) {
    if (!filename || filename === '.gitkeep') continue;
    if (filename.endsWith('.json')) {
      const record = tryReadJSON(path.join(ROOT, folder, filename));
      if (!record) continue;
      const belongs = record.person_id === personId ||
        (Array.isArray(record.people) && record.people.includes(personId));
      if (belongs) matches.push(record);
    } else if (folder === 'photos' && person && Array.isArray(person.photos) && person.photos.includes(filename)) {
      matches.push({ id: filename, file: filename });
    }
  }
  if (folder === 'eras') {
    matches.sort((a, b) => {
      const ay = parseStartYear(a.years), by = parseStartYear(b.years);
      if (ay === by) return (a.id || '').localeCompare(b.id || '');
      return ay - by;
    });
  }
  return matches;
}

// Mirrors view/person-data.js's loadPersonRecord().
function loadPersonRecord(personId) {
  const person = readJSON(path.join(ROOT, 'people', personId + '.json'));
  const sections = {};
  for (const folder of FOLDERS) sections[folder] = findRecordsForPerson(folder, personId, person);
  return { person, sections };
}

// Mirrors the related-people fetch loop in view/person.html's loadAll().
function relatedPeopleIds(person, sections) {
  const ids = new Set([
    ...(person.parents || []),
    ...(person.stepParents || []),
    ...(person.spouses || []),
    ...(person.children || []),
  ]);
  for (const s of (sections.stories || [])) (s.people || []).forEach(id => ids.add(id));
  return [...ids];
}

function loadPeopleById(ids) {
  const map = {};
  for (const id of ids) {
    const p = tryReadJSON(path.join(ROOT, 'people', id + '.json'));
    if (p) map[id] = p;
  }
  return map;
}

// Mirrors every place person.html's template actually renders a <img>/
// <video> src, so we copy exactly what a generated page needs and nothing
// more (full record galleries live on art.html/cars.html/etc., which this
// generator does not produce yet — see README).
function collectReferencedMedia(person, sections, peopleById) {
  const files = new Set();

  if (person.photos && person.photos.length) files.add(person.photos[0]);
  else if (sections.photos && sections.photos.length && sections.photos[0].file) files.add(sections.photos[0].file);

  Object.values(peopleById).forEach(p => {
    if (p.photos && p.photos.length) files.add(p.photos[0]);
  });

  (sections.eras || []).forEach(e => {
    if (e.photos && e.photos.length) files.add(e.photos[0]);
  });

  ['art', 'architecture', 'inventions', 'books'].forEach(key => {
    (sections[key] || []).forEach(r => {
      const img = (r.images && r.images.length) ? r.images[0] : (r.photos && r.photos.length ? r.photos[0] : null);
      if (img) files.add(img);
    });
  });

  const carWithPhoto = (sections.cars || []).find(r => r.images && r.images.length);
  if (carWithPhoto) files.add(carWithPhoto.images[0]);

  return [...files];
}

function personSlugs() {
  const idx = tryReadJSON(path.join(ROOT, 'people', 'index.json'));
  if (idx && Array.isArray(idx.files)) {
    return idx.files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  }
  return fs.readdirSync(path.join(ROOT, 'people')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Prevents a stray "</script>" inside any baked string (e.g. a biography)
// from prematurely closing the injected <script> tag.
function safeJSONForScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function buildPersonHTML(templateSrc, baked) {
  const dataScript = `<script>window.__ARCHIVE_DATA__ = ${safeJSONForScript(baked)};</script>`;
  return templateSrc.replace(
    '<script src="person-data.js"></script>',
    '<script src="person-data.js"></script>\n' + dataScript
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildIndexHTML(entries) {
  const rows = entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(e => `    <li><a href="view/${e.slug}.html">${escapeHtml(e.name)}</a></li>`)
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Forebears Archive</title>
<style>
  body{font-family:Georgia,serif;max-width:640px;margin:60px auto;padding:0 20px;color:#2B2118;background:#F2E8D5}
  h1{font-style:italic}
  ul{line-height:1.9;padding-left:20px}
  a{color:#9C7A2E}
</style></head>
<body>
<h1>Forebears Archive</h1>
<ul>
${rows}
</ul>
</body></html>
`;
}

function main() {
  ensureDir(OUT);
  const templateSrc = fs.readFileSync(path.join(ROOT, 'view', 'person.html'), 'utf8');

  const slugs = personSlugs();
  const allMedia = new Set();
  const indexEntries = [];
  const failed = [];

  for (const slug of slugs) {
    try {
      const { person, sections } = loadPersonRecord(slug);
      const relatedIds = relatedPeopleIds(person, sections);
      const peopleById = loadPeopleById(relatedIds);

      collectReferencedMedia(person, sections, peopleById).forEach(f => allMedia.add(f));

      const html = buildPersonHTML(templateSrc, { person, sections, peopleById });
      const outPath = path.join(OUT, 'view', slug + '.html');
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, html);

      indexEntries.push({ slug, name: person.name || slug });
    } catch (e) {
      failed.push({ slug, error: e.message });
    }
  }

  copyDirRecursive(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));

  let copied = 0;
  for (const filename of allMedia) {
    const src = path.join(ROOT, 'photos', filename);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(OUT, 'photos', filename));
      copied++;
    } else {
      console.warn('  ! referenced media not found, skipping:', filename);
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), buildIndexHTML(indexEntries));

  console.log(`Generated ${indexEntries.length}/${slugs.length} person pages -> ${path.relative(ROOT, OUT)}/view/`);
  console.log(`Copied ${copied}/${allMedia.size} referenced media files -> ${path.relative(ROOT, OUT)}/photos/`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach(f => console.log('  -', f.slug + ':', f.error));
    process.exitCode = 1;
  }
}

main();
