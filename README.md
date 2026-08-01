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

Opening these files straight from disk (`file://...`) works, but each page
is sandboxed independently, so the browser makes you re-click **Connect
folder** on every single navigation — editor to viewer, person page to era
page, all of it. Serving over plain HTTP instead fixes this: every page
shares one origin (`http://localhost:8000`), so the browser remembers the
folder grant across pages instead of asking every time.

From the repo root:

```
python3 -m http.server 8000
```

(macOS ships Python 3, so this needs nothing extra. If you'd rather use
Node, `npx serve .` from the repo root works the same way.)

Then open `http://localhost:8000/editor/person-editor.html` or
`http://localhost:8000/view/person.html?id=craig-colin-cline`, etc. When
you click **Connect folder**, pick this same repo folder — it's already
where `people/`, `photos/`, `videos/`, and `eras/` live. Stop the server
with Ctrl+C when you're done.

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

## What this is / isn't

No timeline or generated static site yet — that's Phase 3/4, and it'll
build on the same JSON files everything else here creates. The JSON is
the database; the editor and view templates are just windows onto it.

Nothing is stored in the browser between sessions (no localStorage) —
the JSON files on disk are the only persistent state, on purpose. That
keeps the archive portable: it can live on an SD card, in solid oak,
wherever outlasts the software that touched it.
