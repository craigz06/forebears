// Browser port of generate-archive.js — same algorithm (bake each person's
// data into a standalone copy of view/person.html, copy referenced media),
// but reading/writing through the File System Access API instead of
// Node's fs, so it can run from a button click on index.html with no
// Terminal or Node involved. Keep this in sync with generate-archive.js
// if the data-loading or media-collection logic there changes.

const ARCHIVE_FOLDERS = ['eras', 'jobs', 'stories', 'photos', 'cars', 'art', 'architecture', 'inventions', 'books'];

async function abReadJSON(dirHandle, filename) {
  const fh = await dirHandle.getFileHandle(filename);
  const file = await fh.getFile();
  return JSON.parse(await file.text());
}

async function abTryReadJSON(dirHandle, filename) {
  try { return await abReadJSON(dirHandle, filename); }
  catch (e) { return null; }
}

function abParseStartYear(years) {
  if (!years) return Infinity;
  const m = String(years).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : Infinity;
}

// Mirrors generate-archive.js's findRecordsForPerson().
async function abFindRecordsForPerson(rootHandle, folder, personId, person) {
  let folderHandle;
  try { folderHandle = await rootHandle.getDirectoryHandle(folder); }
  catch (e) { return []; }
  const idx = await abTryReadJSON(folderHandle, 'index.json');
  if (!idx || !Array.isArray(idx.files)) return [];
  const matches = [];
  for (const filename of idx.files) {
    if (!filename || filename === '.gitkeep') continue;
    if (filename.endsWith('.json')) {
      const record = await abTryReadJSON(folderHandle, filename);
      if (!record) continue;
      const belongs = record.person_id === personId ||
        (Array.isArray(record.people) && record.people.includes(personId));
      if (belongs) matches.push(record);
    } else if (folder === 'photos' && person && Array.isArray(person.photos) && person.photos.includes(filename)) {
      matches.push({ id: filename, file: filename });
    }
  }
  if (folder === 'eras' || folder === 'jobs') {
    matches.sort((a, b) => {
      const ay = abParseStartYear(a.years), by = abParseStartYear(b.years);
      if (ay === by) return (a.id || '').localeCompare(b.id || '');
      return ay - by;
    });
  }
  return matches;
}

// Mirrors generate-archive.js's loadPersonRecord().
async function abLoadPersonRecord(rootHandle, peopleHandle, personId) {
  const person = await abReadJSON(peopleHandle, personId + '.json');
  const sections = {};
  for (const folder of ARCHIVE_FOLDERS) sections[folder] = await abFindRecordsForPerson(rootHandle, folder, personId, person);
  return { person, sections };
}

function abRelatedPeopleIds(person, sections) {
  const ids = new Set([
    ...(person.parents || []),
    ...(person.stepParents || []),
    ...(person.spouses || []),
    ...(person.children || []),
  ]);
  for (const s of (sections.stories || [])) (s.people || []).forEach(id => ids.add(id));
  return [...ids];
}

async function abLoadPeopleById(peopleHandle, ids) {
  const map = {};
  for (const id of ids) {
    const p = await abTryReadJSON(peopleHandle, id + '.json');
    if (p) map[id] = p;
  }
  return map;
}

// Mirrors generate-archive.js's collectReferencedMedia(). The Creations
// section (Craig-only) renders every image in architecture/art/cars/
// books/inventions, not just a thumbnail per record — so all of them need
// to be copied, not just the first per record.
function abCollectReferencedMedia(person, sections, peopleById) {
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

// Generic version of abBuildPersonHTML for the record-detail templates
// (art.html, architecture.html, cars.html, era.html, automobiles.html),
// which don't load person-data.js but all load Vue the same way.
function abBakeRecordHTML(templateSrc, data) {
  const dataScript = `<script>window.__ARCHIVE_DATA__ = ${abSafeJSONForScript(data)};</script>`;
  return templateSrc.replace(
    '<script src="../assets/vendor/vue.global.prod.js"></script>',
    '<script src="../assets/vendor/vue.global.prod.js"></script>\n' + dataScript
  );
}

// Reads every record (skipping index.json itself) out of a top-level
// content folder handle, e.g. abLoadFolderRecords(rootHandle, 'cars').
async function abLoadFolderRecords(rootHandle, folder) {
  let folderHandle;
  try { folderHandle = await rootHandle.getDirectoryHandle(folder); }
  catch (e) { return []; }
  const idx = await abTryReadJSON(folderHandle, 'index.json');
  if (!idx || !Array.isArray(idx.files)) return [];
  const records = [];
  for (const filename of idx.files) {
    if (!filename || !filename.endsWith('.json')) continue;
    const record = await abTryReadJSON(folderHandle, filename);
    if (record) records.push(record);
  }
  return records;
}

// Reads photos/<basename>.json (the Photo object type view/cars.html's
// "+ Add note" writes to) for each filename and returns a map of
// filename -> notes[]. Missing/note-less files just contribute an empty
// array, same as the live pages' fetch-based fallback.
async function abLoadPhotoNotesFor(photosHandle, filenames) {
  const map = {};
  for (const filename of filenames) {
    const base = filename.replace(/\.[^.]+$/, '');
    const record = await abTryReadJSON(photosHandle, base + '.json');
    map[filename] = (record && Array.isArray(record.notes)) ? record.notes : [];
  }
  return map;
}

async function abPersonSlugs(peopleHandle) {
  const idx = await abTryReadJSON(peopleHandle, 'index.json');
  if (idx && Array.isArray(idx.files)) {
    return idx.files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  }
  const slugs = [];
  for await (const [name, handle] of peopleHandle.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) slugs.push(name.replace(/\.json$/, ''));
  }
  return slugs;
}

async function abWriteText(dirHandle, filename, text) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function abCopyFile(srcDirHandle, filename, destDirHandle) {
  const srcFh = await srcDirHandle.getFileHandle(filename);
  const file = await srcFh.getFile();
  const destFh = await destDirHandle.getFileHandle(filename, { create: true });
  const w = await destFh.createWritable();
  await w.write(file);
  await w.close();
}

async function abCopyDirRecursive(srcDirHandle, destParentHandle, name) {
  const destDirHandle = await destParentHandle.getDirectoryHandle(name, { create: true });
  for await (const [entryName, handle] of srcDirHandle.entries()) {
    if (handle.kind === 'directory') {
      const subSrc = await srcDirHandle.getDirectoryHandle(entryName);
      await abCopyDirRecursive(subSrc, destDirHandle, entryName);
    } else {
      await abCopyFile(srcDirHandle, entryName, destDirHandle);
    }
  }
}

// Guards against a stray "</script>" inside baked string data (e.g. a
// biography) prematurely closing the injected <script> tag.
function abSafeJSONForScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function abBuildPersonHTML(templateSrc, baked) {
  const dataScript = `<script>window.__ARCHIVE_DATA__ = ${abSafeJSONForScript(baked)};</script>`;
  return templateSrc.replace(
    '<script src="person-data.js"></script>',
    '<script src="person-data.js"></script>\n' + dataScript
  );
}

function abEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function abBuildIndexHTML(entries) {
  const rows = entries.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(e => `    <li><a href="view/${e.slug}.html">${abEscapeHtml(e.name)}</a></li>`).join('\n');
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

// rootHandle: a directory handle for the Forebears repo root (the folder
// containing people/, photos/, view/, etc). onProgress(message) is called
// as generation moves through each step/person. Returns a summary object;
// throws if a step outside the per-person try/catch fails outright (e.g.
// the folder isn't actually a Forebears root).
async function generateArchiveInBrowser(rootHandle, onProgress) {
  const notify = onProgress || function(){};

  const viewHandle = await rootHandle.getDirectoryHandle('view');
  const templateFh = await viewHandle.getFileHandle('person.html');
  const templateSrc = await (await templateFh.getFile()).text();
  const peopleHandle = await rootHandle.getDirectoryHandle('people');
  const photosHandle = await rootHandle.getDirectoryHandle('photos', { create: true });

  const slugs = await abPersonSlugs(peopleHandle);
  const archiveHandle = await rootHandle.getDirectoryHandle('archive', { create: true });
  const archiveViewHandle = await archiveHandle.getDirectoryHandle('view', { create: true });

  const allMedia = new Set();
  const indexEntries = [];
  const failed = [];

  for (const slug of slugs) {
    notify('Generating ' + slug + '…');
    try {
      const { person, sections } = await abLoadPersonRecord(rootHandle, peopleHandle, slug);
      const relatedIds = abRelatedPeopleIds(person, sections);
      const peopleById = await abLoadPeopleById(peopleHandle, relatedIds);

      const media = abCollectReferencedMedia(person, sections, peopleById);
      media.forEach(f => allMedia.add(f));
      const photoNotes = await abLoadPhotoNotesFor(photosHandle, media);

      const html = abBuildPersonHTML(templateSrc, { person, sections, peopleById, photoNotes });
      await abWriteText(archiveViewHandle, slug + '.html', html);

      indexEntries.push({ slug, name: person.name || slug });
    } catch (e) {
      console.error('Failed to generate', slug, e);
      failed.push({ slug, error: e.message });
    }
  }

  // Bake art/architecture/cars record-detail pages so tiles that link to
  // them resolve inside the archive too. Their images are already in
  // allMedia via abCollectReferencedMedia's Creations-section walk (every
  // image in these 3 folders), so no extra media collection needed here.
  notify('Generating art/architecture/cars record pages…');
  const recordPageTypes = [
    { folder: 'art', template: 'art.html' },
    { folder: 'architecture', template: 'architecture.html' },
    { folder: 'cars', template: 'cars.html' },
  ];
  let recordPagesGenerated = 0;
  for (const { folder, template } of recordPageTypes) {
    const recordTemplateFh = await viewHandle.getFileHandle(template);
    const recordTemplateSrc = await (await recordTemplateFh.getFile()).text();
    for (const record of await abLoadFolderRecords(rootHandle, folder)) {
      if (!record.id) continue;
      try {
        const imgs = record.images || record.photos || [];
        const photoNotes = await abLoadPhotoNotesFor(photosHandle, imgs);
        const html = abBakeRecordHTML(recordTemplateSrc, Object.assign({}, record, { photoNotes }));
        await abWriteText(archiveViewHandle, record.id + '.html', html);
        recordPagesGenerated++;
      } catch (e) {
        console.error('Failed to generate', folder + '/' + record.id, e);
        failed.push({ slug: folder + '/' + record.id, error: e.message });
      }
    }
  }

  // Bake the Automobiles listing page — a fixed array of every car record,
  // not parameterized by id, so it's just one file (same name live and
  // archived, since person.html's link to it is a plain "automobiles.html").
  notify('Generating automobiles.html…');
  const automobilesTemplateFh = await viewHandle.getFileHandle('automobiles.html');
  const automobilesTemplateSrc = await (await automobilesTemplateFh.getFile()).text();
  const allCars = await abLoadFolderRecords(rootHandle, 'cars');
  await abWriteText(archiveViewHandle, 'automobiles.html', abBakeRecordHTML(automobilesTemplateSrc, allCars));

  // Bake era pages. Creations doesn't cover eras, and era.html shows every
  // photo (not just a thumbnail), so collect their full photo/video sets
  // here rather than relying on abCollectReferencedMedia.
  notify('Generating era pages…');
  const eraTemplateFh = await viewHandle.getFileHandle('era.html');
  const eraTemplateSrc = await (await eraTemplateFh.getFile()).text();
  const allVideos = new Set();
  let eraPagesGenerated = 0;
  for (const era of await abLoadFolderRecords(rootHandle, 'eras')) {
    if (!era.id) continue;
    try {
      (era.photos || []).forEach(f => allMedia.add(f));
      if (era.hero_video) allVideos.add(era.hero_video);
      const linkedPerson = era.linked_person ? await abTryReadJSON(peopleHandle, era.linked_person + '.json') : null;
      const html = abBakeRecordHTML(eraTemplateSrc, { era, linkedPerson });
      await abWriteText(archiveViewHandle, era.id + '.html', html);
      eraPagesGenerated++;
    } catch (e) {
      console.error('Failed to generate era', era.id, e);
      failed.push({ slug: 'eras/' + era.id, error: e.message });
    }
  }

  // Bake job pages — same reasoning/shape as era pages above (job.html is
  // a copy of era.html reading jobs/ instead of eras/).
  notify('Generating job pages…');
  const jobTemplateFh = await viewHandle.getFileHandle('job.html');
  const jobTemplateSrc = await (await jobTemplateFh.getFile()).text();
  let jobPagesGenerated = 0;
  for (const job of await abLoadFolderRecords(rootHandle, 'jobs')) {
    if (!job.id) continue;
    try {
      (job.photos || []).forEach(f => allMedia.add(f));
      if (job.logo) allMedia.add(job.logo);
      if (job.hero_video) allVideos.add(job.hero_video);
      const linkedPerson = job.linked_person ? await abTryReadJSON(peopleHandle, job.linked_person + '.json') : null;
      const html = abBakeRecordHTML(jobTemplateSrc, { job, linkedPerson });
      await abWriteText(archiveViewHandle, job.id + '.html', html);
      jobPagesGenerated++;
    } catch (e) {
      console.error('Failed to generate job', job.id, e);
      failed.push({ slug: 'jobs/' + job.id, error: e.message });
    }
  }

  notify('Copying site assets (fonts, Vue)…');
  const assetsHandle = await rootHandle.getDirectoryHandle('assets');
  await abCopyDirRecursive(assetsHandle, archiveHandle, 'assets');

  notify('Copying referenced photos…');
  const archivePhotosHandle = await archiveHandle.getDirectoryHandle('photos', { create: true });
  let copied = 0;
  for (const filename of allMedia) {
    try {
      await abCopyFile(photosHandle, filename, archivePhotosHandle);
      copied++;
    } catch (e) {
      console.warn('Referenced media not found, skipping:', filename);
    }
  }

  notify('Copying referenced videos…');
  let videosCopied = 0;
  if (allVideos.size) {
    const videosHandle = await rootHandle.getDirectoryHandle('videos');
    const archiveVideosHandle = await archiveHandle.getDirectoryHandle('videos', { create: true });
    for (const filename of allVideos) {
      try {
        await abCopyFile(videosHandle, filename, archiveVideosHandle);
        videosCopied++;
      } catch (e) {
        console.warn('Referenced video not found, skipping:', filename);
      }
    }
  }

  notify('Writing archive/index.html…');
  await abWriteText(archiveHandle, 'index.html', abBuildIndexHTML(indexEntries));

  return {
    generated: indexEntries.length,
    total: slugs.length,
    recordPagesGenerated,
    eraPagesGenerated,
    jobPagesGenerated,
    mediaCopied: copied,
    mediaTotal: allMedia.size,
    videosCopied,
    videosTotal: allVideos.size,
    failed
  };
}
