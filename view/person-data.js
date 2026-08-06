async function loadPersonRecord(personId) {
  const person = await fetchJSON(`../people/${personId}.json`);
  const sections = {};
  const folders = ['eras', 'jobs', 'stories', 'photos', 'cars', 'art', 'architecture', 'inventions', 'books'];
  for (const folder of folders) {
    sections[folder] = await findRecordsForPerson(folder, personId, person);
  }
  return { person, sections };
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function findRecordsForPerson(folder, personId, person) {
  let index;
  try {
    index = await fetchJSON(`../${folder}/index.json`);
  } catch (err) {
    return []; // folder doesn't exist or has no index yet — treat as empty
  }
  const matches = [];
  for (const filename of index.files) {
    if (!filename) continue;
    if (filename.endsWith('.json')) {
      let record;
      try {
        record = await fetchJSON(`../${folder}/${filename}`);
      } catch (err) {
        console.warn('Could not load record', folder, filename);
        continue;
      }
      const belongsToPerson =
        record.person_id === personId ||
        (Array.isArray(record.people) && record.people.includes(personId));
      if (belongsToPerson) matches.push(record);
    } else {
      // non-JSON files (likely images) — treat them as photo assets; include if the person lists them
      if (folder === 'photos' && person && Array.isArray(person.photos) && person.photos.includes(filename)) {
        matches.push({ id: filename, file: filename });
      }
    }
  }
  // If this is the eras or jobs folder, sort matches chronologically by start year
  if (folder === 'eras' || folder === 'jobs') {
    matches.sort((a,b) => {
      const ay = parseStartYear(a.years || a.years || '');
      const by = parseStartYear(b.years || b.years || '');
      if(ay === by) return (a.id || '').localeCompare(b.id || '');
      return ay - by;
    });
  }
  return matches;
}

function parseStartYear(years){
  if(!years) return Infinity;
  // Find first 4-digit year in the string
  const m = years.match(/(\d{4})/);
  if(!m) return Infinity;
  return parseInt(m[1], 10);
}

