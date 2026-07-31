# Forebears — Person Editor (Phase 1)

A single HTML file. No build step, no server, no dependencies to install —
Vue loads from a CDN. Runs entirely in the browser.

## Folder structure it expects

Create this once, anywhere (an external drive, the SD card, a Forebears
folder inside your Netlify/GitHub project — doesn't matter):

```
Forebears/
  people/          <- this app reads and writes JSON files here
  photos/          <- Phase 2
  videos/          <- Phase 2
  places/          <- later
  events/          <- Phase 3
  stories/          <- later
  generated_html/  <- Phase 4
```

Only `people/` needs to exist for this prototype — the app will create it
inside whatever folder you connect, if it isn't there already.

## How to use it

1. Open `person-editor.html` in **Chrome or Edge** (needed for direct
   file writing — see note below).
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

## If you're not on Chrome/Edge

Safari and Firefox don't yet support writing files directly from a web
page (the File System Access API). The app detects this and switches to:

- **Import JSON** — pick one or more existing `.json` files to load them
  into the session.
- **Download JSON** — after Save, download the file and drop it into
  `Forebears/people/` yourself.

Everything else works the same; you just move files by hand.

## What this is / isn't

This is Phase 1 only, exactly as scoped: the Person Editor. No photos,
no timeline, no generated site yet — those are Phases 2–4, and they all
build on the same JSON files this creates. The JSON is the database;
this page is just an editor for it.

Nothing is stored in the browser between sessions (no localStorage) —
the JSON files on disk are the only persistent state, on purpose. That
keeps the archive portable: it can live on an SD card, in solid oak,
wherever outlasts the software that touched it.
