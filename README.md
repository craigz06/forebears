# Forebears

Plain HTML files. No build step, no server, no dependencies to install —
Vue and all fonts are vendored locally under `assets/vendor/`, so the
whole thing runs offline (an SD card, a laptop with no wifi, wherever).

Three roles, kept structurally separate:

- **`editor/person-editor.html`** — private data-entry tool. Reads and
  writes `people/<slug>.json` directly, auto-links relationships. Not
  meant to be linked from anything a visitor sees.
- **`view/person.html?id=<slug>`** — public-facing person page template.
  One file renders anyone in the archive, reading `people/<slug>.json`.
- **`view/era.html?id=<slug>`** — narrative "life era" page template
  (hero video, story excerpt, places lived, photo grid), reading
  `eras/<slug>.json`. Linked from a person's page when era data exists
  for them.

## Folder structure it expects

Create this once, anywhere (an external drive, the SD card, a Forebears
folder inside your Netlify/GitHub project — doesn't matter):

```
Forebears/
  people/          <- editor reads/writes JSON files here; views read them
  eras/            <- "life era" JSON objects, one per era page
  photos/          <- referenced by people/*.json and eras/*.json photos[] fields
  videos/          <- referenced by eras/*.json hero_video field
  places/          <- later
  events/          <- Phase 3
  stories/          <- later
  generated_html/  <- one-off legacy pages, being phased out by the templates above
```

Only `people/` needs to exist for the editor — it'll create it inside
whatever folder you connect, if it isn't there already. `eras/`, `photos/`,
and `videos/` are optional — pages degrade gracefully (sections just don't
render) if they're missing or a person/era has no photos yet.

## Running it locally (recommended)

The `view/*.html` pages (`person.html`, `era.html`, `art.html`,
`architecture.html`, `cars.html`, `automobiles.html`) load their data with
`fetch()` against relative JSON paths. Browsers block `fetch()` against
`file://` outright — it's not a permission prompt you can click through,
it's a hard scheme restriction — so opening one of these by double-clicking
it will always fail with a "Could not load..." error. They need an HTTP
origin, any port:

```
python3 -m http.server 8000
```

(macOS ships Python 3, so this needs nothing extra. If you'd rather use
Node, `npx serve .` from the repo root works the same way.)

Then open `http://localhost:8000/view/person.html?id=craig-colin-cline`,
etc. Stop the server with Ctrl+C when you're done.

The editor (`editor/person-editor.html`) is different — it uses the File
System Access API (**Connect folder**) to read and write JSON directly, and
that part of the flow does work over `file://`, just open it and click
Connect folder as usual. See "If you're not on Chrome/Edge" below if
that API isn't available to you.

**No server at all?** See "Static archive (zero-server)" below —
`generate-archive.js` bakes the viewer's data into standalone HTML files
that work straight off an SD card via `file://`, no `fetch()` involved.

## How to use it

1. Open `editor/person-editor.html` (see **Running it locally** above —
   Chrome or Edge, needed for direct file writing).
2. Click **Connect folder** and choose your `Forebears` folder. The app
   will load every `.json` file already in `Forebears/people/`.
3. Click **"Tell me about someone"** and fill in what you know. Leave
   anything blank you don't have.
4. For Parents / Spouse(s) / Children, start typing a name. If that
   person already exists in the archive, it links to them. If not, it
   creates a lightweight stub entry for them automatically (marked
   "new" until you fill in their own page later).
5. Click **Save**. This writes `people/<slug>.json` directly to your
   folder — and if the relationship is new, it also updates the other
   person's file so the link goes both ways (list Elizabeth as Craig's
   spouse, and Craig automatically appears on Elizabeth's page).

### Viewing a person or era page

Open `view/person.html?id=<slug>` (e.g. `view/person.html?id=craig-colin-cline`)
or `view/era.html?id=<slug>`, click **Connect folder** the same way, and
it reads straight from the JSON — no separate build or export step. A
person's "Life Eras" section only appears if an `eras/*.json` file has a
matching `linked_person`.

## If you're not on Chrome/Edge

Safari and Firefox don't yet support writing files directly from a web
page (the File System Access API). The app detects this and switches to:

- **Import JSON** — pick one or more existing `.json` files to load them
  into the session.
- **Download JSON** — after Save, download the file and drop it into
  `Forebears/people/` yourself.

Everything else works the same; you just move files by hand.

## Static archive (zero-server)

`generate-archive.js` is a separate, additive script — it doesn't change
how the live editor or `view/*.html` pages behave; it just reads the same
JSON `view/person-data.js` fetches at runtime and bakes it into standalone
files. Run from the repo root (needs Node, no npm packages required):

```
node generate-archive.js
```

For every file in `people/`, this walks the same 8 content folders
(`eras`, `stories`, `photos`, `cars`, `art`, `architecture`, `inventions`,
`books`) and related-people lookups that `person-data.js` does, then writes
a copy of `view/person.html` with that data inlined as
`window.__ARCHIVE_DATA__` instead of left to `fetch()`. It's the same
template and the same Vue app — just fed data synchronously instead of
over the network, so the rendered page is identical to the live viewer.

Output lands in `archive/`:

```
archive/
  index.html          <- plain link list of everyone generated
  view/<slug>.html     <- one self-contained page per person, e.g. craig-colin-cline.html
  photos/              <- only the photos/videos those pages actually reference
  assets/              <- vendored Vue + fonts, copied wholesale
```

Open `archive/index.html` (or any `archive/view/<slug>.html`) straight from
disk — no server, works from an SD card. Family links between generated
pages resolve to the sibling `.html` file directly (no `?id=` query string
needed). Re-run the command any time the source JSON changes; it fully
regenerates `archive/` from scratch.

**Known limitation:** only person pages are generated so far. A person
page's links to era/art/architecture/cars/automobiles detail pages
(`era.html?id=...`, `art.html?record=...`, etc.) still point at the live,
fetch-based versions of those templates, which won't resolve inside the
static archive. Extending the same bake-instead-of-fetch approach to those
templates would be the natural next phase.

## What this is / isn't

No timeline yet — that's Phase 3, and it'll build on the same JSON files
everything else here creates. The JSON is the database; the editor and
view templates are just windows onto it. A first pass at Phase 4 (a
generated static site) now exists — see "Static archive" above.

Nothing is stored in the browser between sessions (no localStorage) —
the JSON files on disk are the only persistent state, on purpose. That
keeps the archive portable: it can live on an SD card, in solid oak,
wherever outlasts the software that touched it.
