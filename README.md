# Next Episode

A personal TV library: find shows, rate them, and keep your place across episodes and seasons. Built as a local web app with Node.js 22+ and no runtime dependencies.

## Run

```sh
npm start
```

Open **http://localhost:3210**. The server binds only to this Mac. Stop it with Ctrl+C.

The existing Letterbox project TMDB credential has been copied into the ignored local `.env` file. For a fresh checkout, copy `.env.example` to `.env` and fill in `TMDB_TOKEN` with your TMDB API Read Access Token. A v3 API key is also supported. Credentials stay on the server.

## First version

- Search TMDB and add shows to your library.
- Switch between All, Watching, Caught Up, Completed, and Dropped.
- Combine title search, genre, and personal rating filters. Sort by title, rating, or recently added.
- Rate shows and individual seasons independently, from 0.5 to 5 stars.
- Mark individual episodes or aired episodes in a season watched. “Watched through here” fills in earlier regular episodes across seasons.
- Mark the next unwatched episode directly from the library or show details. “Watched through this season” fills in earlier seasons too.
- Correct progress by unchecking episodes or clearing a season.
- Automatic status distinguishes ongoing shows from ended/canceled shows. Manual status overrides are available, including Dropped.
- Specials are optional and do not affect completion. Future episodes and episodes with unknown air dates are not marked watched in bulk.
- Show information refreshes when opening the app if older than six hours; a manual refresh is available in show details. Saved library data remains usable when TMDB is offline.
- Download a JSON backup from the footer.

Newly added shows start in Watching with “Not started” progress. There is no separate watchlist yet. Diary entries, viewing dates, and reviews are deferred; see [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

## Storage and backups

Personal data and cached metadata live in `data/library.json`, not in browser storage. Writes use a temporary file and atomic replacement. The data directory and credentials are excluded from Git. Use one running server for a given library file.

To restore a downloaded backup, stop the server, preserve your existing file, and copy the backup to `data/library.json`. Then restart. There is no cloud sync or account system.

## Development and verification

```sh
npm run dev
npm run check
npm install
npm run test:browser
```

The tests cover status transitions, unaired episodes, specials, persistent ratings/progress, invalid inputs, and cross-origin write protection. Tests use temporary data and do not call TMDB.

Browser tests use Playwright with installed Google Chrome, a temporary library, and fixture metadata. `npm run test:live` runs the main browser flow against real TMDB using `.env`; it also uses an isolated temporary library. Screenshots are saved under ignored `test-results/`.

Optional environment variables: `PORT` (default `3210`) and `TV_DATA_FILE` (alternative library path).

## Credits

Show data and artwork come from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
