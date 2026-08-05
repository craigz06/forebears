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
// <video> src. The Creations section (Craig-only) renders every image in
// architecture/art/cars/books/inventions, not just a thumbnail per record
// like the tile sections above it — so all of them need to be copied, not
// just the first per record. (Full record galleries on art.html/cars.html
// etc. still aren't baked into the archive themselves — see README.)
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

  ['architecture', 'art', 'cars', 'books', 'inventions'].forEach(key => {
    (sections[key] || []).forEach(r => {
      const imgs = r.images || r.photos || [];
      imgs.forEach(img => files.add(img));
    });
  });

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

// Generic version of buildPersonHTML for the record-detail templates
// (art.html, architecture.html, cars.html, era.html, automobiles.html),
// which don't load person-data.js but all load Vue the same way.
function bakeRecordHTML(templateSrc, data) {
  const dataScript = `<script>window.__ARCHIVE_DATA__ = ${safeJSONForScript(data)};</script>`;
  return templateSrc.replace(
    '<script src="../assets/vendor/vue.global.prod.js"></script>',
    '<script src="../assets/vendor/vue.global.prod.js"></script>\n' + dataScript
  );
}

// Reads every record (skipping index.json itself) out of a top-level
// content folder, e.g. loadFolderRecords('cars') -> all cars/*.json.
function loadFolderRecords(folder) {
  const idx = tryReadJSON(path.join(ROOT, folder, 'index.json'));
  if (!idx || !Array.isArray(idx.files)) return [];
  const records = [];
  for (const filename of idx.files) {
    if (!filename || !filename.endsWith('.json')) continue;
    const record = tryReadJSON(path.join(ROOT, folder, filename));
    if (record) records.push(record);
  }
  return records;
}

// Reads photos/<basename>.json (the Photo object type view/cars.html's
// "+ Add note" writes to) for each filename and returns a map of
// filename -> notes[]. Missing/note-less files just contribute an empty
// array, same as the live pages' fetch-based fallback.
function loadPhotoNotesFor(filenames) {
  const map = {};
  for (const filename of filenames) {
    const base = filename.replace(/\.[^.]+$/, '');
    const record = tryReadJSON(path.join(ROOT, 'photos', base + '.json'));
    map[filename] = (record && Array.isArray(record.notes)) ? record.notes : [];
  }
  return map;
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

      const media = collectReferencedMedia(person, sections, peopleById);
      media.forEach(f => allMedia.add(f));
      const photoNotes = loadPhotoNotesFor(media);

      const html = buildPersonHTML(templateSrc, { person, sections, peopleById, photoNotes });
      const outPath = path.join(OUT, 'view', slug + '.html');
      ensureDir(path.dirname(outPath));
      fs.writeFileSync(outPath, html);

      indexEntries.push({ slug, name: person.name || slug });
    } catch (e) {
      failed.push({ slug, error: e.message });
    }
  }

  // Bake art/architecture/cars record-detail pages so tiles that link to
  // them (art.html?record=..., etc., or their archive-mode equivalents)
  // actually resolve inside the archive. Their images are already in
  // allMedia via collectReferencedMedia's Creations-section walk (every
  // image in these 3 folders), so no extra media collection needed here.
  const recordPageTypes = [
    { folder: 'art', template: 'art.html' },
    { folder: 'architecture', template: 'architecture.html' },
    { folder: 'cars', template: 'cars.html' },
  ];
  let recordPagesGenerated = 0;
  for (const { folder, template } of recordPageTypes) {
    const recordTemplateSrc = fs.readFileSync(path.join(ROOT, 'view', template), 'utf8');
    for (const record of loadFolderRecords(folder)) {
      if (!record.id) continue;
      try {
        const imgs = record.images || record.photos || [];
        const photoNotes = loadPhotoNotesFor(imgs);
        const html = bakeRecordHTML(recordTemplateSrc, Object.assign({}, record, { photoNotes }));
        fs.writeFileSync(path.join(OUT, 'view', record.id + '.html'), html);
        recordPagesGenerated++;
      } catch (e) {
        failed.push({ slug: folder + '/' + record.id, error: e.message });
      }
    }
  }

  // Bake the Automobiles listing page — a fixed array of every car record,
  // not parameterized by id, so it's just one file (same name live and
  // archived, since person.html's link to it is a plain "automobiles.html").
  const automobilesTemplateSrc = fs.readFileSync(path.join(ROOT, 'view', 'automobiles.html'), 'utf8');
  const allCars = loadFolderRecords('cars');
  fs.writeFileSync(path.join(OUT, 'view', 'automobiles.html'), bakeRecordHTML(automobilesTemplateSrc, allCars));

  // Bake era pages. Creations doesn't cover eras, and era.html shows every
  // photo (not just a thumbnail), so collect their full photo/video sets
  // here rather than relying on collectReferencedMedia.
  const eraTemplateSrc = fs.readFileSync(path.join(ROOT, 'view', 'era.html'), 'utf8');
  const allVideos = new Set();
  let eraPagesGenerated = 0;
  for (const era of loadFolderRecords('eras')) {
    if (!era.id) continue;
    try {
      (era.photos || []).forEach(f => allMedia.add(f));
      if (era.hero_video) allVideos.add(era.hero_video);
      const linkedPerson = era.linked_person ? tryReadJSON(path.join(ROOT, 'people', era.linked_person + '.json')) : null;
      const html = bakeRecordHTML(eraTemplateSrc, { era, linkedPerson });
      fs.writeFileSync(path.join(OUT, 'view', era.id + '.html'), html);
      eraPagesGenerated++;
    } catch (e) {
      failed.push({ slug: 'eras/' + era.id, error: e.message });
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

  let videosCopied = 0;
  for (const filename of allVideos) {
    const src = path.join(ROOT, 'videos', filename);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(OUT, 'videos', filename));
      videosCopied++;
    } else {
      console.warn('  ! referenced video not found, skipping:', filename);
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), buildIndexHTML(indexEntries));

  console.log(`Generated ${indexEntries.length}/${slugs.length} person pages -> ${path.relative(ROOT, OUT)}/view/`);
  console.log(`Generated ${recordPagesGenerated} art/architecture/cars record pages, ${eraPagesGenerated} era pages, and automobiles.html`);
  console.log(`Copied ${copied}/${allMedia.size} referenced media files -> ${path.relative(ROOT, OUT)}/photos/`);
  console.log(`Copied ${videosCopied}/${allVideos.size} referenced videos -> ${path.relative(ROOT, OUT)}/videos/`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach(f => console.log('  -', f.slug + ':', f.error));
    process.exitCode = 1;
  }
}

main();
