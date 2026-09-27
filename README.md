# Next Episode

A personal TV library: find shows, rate them, and keep your place across episodes and seasons. Built as a local web app with Node.js 22+ and no runtime dependencies.

## Run

```sh
npm start
```

Open **http://localhost:3210**. The server binds only to this Mac. Stop it with Ctrl+C.

The existing Letterbox project TMDB credential has been copied into the ignored local `.env` file. For a fresh checkout, copy `.env.example` to `.env` and fill in `TMDB_TOKEN` with your TMDB API Read Access Token. A v3 API key is also supported. Credentials stay on the server.

## First version

- Use a dashboard layout with desktop sidebar shortcuts, a global show-search control, summary cards, backdrop-based Continue Watching cards, and a responsive mobile presentation. All existing library tools remain available in the dashboard.
- Open Stats from the sidebar for lifetime totals, a half-star rating histogram, status and progress breakdowns, top genres, and clickable top-rated shows.
- Stats estimate watch time from episode runtimes, each show's typical runtime, and the median known runtime in the library. Specials count toward episodes watched and watch time, but not season-completion or regular-episode progress.
- Search TMDB and add shows to your library. Load additional pages without losing earlier results; failed page loads can be retried.
- Switch between All, Watching, Paused, Caught Up, Completed, Dropped, and a separate Watchlist. Only watchlist-only, unstarted shows are excluded from All shows and its count.
- Combine title search, genre, and personal rating filters. Last updated is the default sort; release date, title, rating, and recently added are also available. “Last updated” uses the most recent newly watched progress and places shows without a recorded update afterward. Unknown premiere dates appear last for release sorting.
- Switch between the default poster gallery and a compact list showing each show's name, premiere date, watch status, rating, progress, and last watched update. The browser remembers the selected view.
- Rate shows and individual seasons independently, from 0.5 to 5 stars.
- Mark individual episodes or aired episodes in a season watched. “Watched through here” fills in earlier regular episodes across seasons.
- Mark the next unwatched episode directly from the library or show details. “Watched through this season” fills in earlier seasons too.
- “Pick up where you left off” shows up to three Watching shows with remaining episodes, ordered by the most recently added watched progress. Correcting/removing progress does not move a show to the front.
- Correct progress by unchecking episodes or clearing a season.
- Remove an accidentally added show from All Shows. This clears its viewing status, ratings, and progress; a separate Watchlist flag is preserved. Unflagged shows are removed entirely and can be added again from search.
- Automatic status distinguishes ongoing shows from ended/canceled shows. Paused is a manual status for shows you may resume; adding newly watched progress returns it to Watching automatically. Dropped remains set until changed manually.
- Specials are optional and do not affect completion. Future episodes and episodes with unknown air dates are not marked watched in bulk.
- Show information refreshes when opening the app if older than six hours; a manual refresh is available in show details. Saved library data remains usable when TMDB is offline.
- Download a JSON backup from the footer.

Watchlist and library membership are independent. In search, + Add puts a show in the tracked library as Watching, while + Watchlist saves it only to Watchlist. A tracked show can also be flagged for Watchlist (for example, for a rewatch) and remains in All shows and its status tab. Adding or removing the flag never changes library membership, ratings, progress, or status. A watchlist-only show enters the tracked library when assigned a viewing status or marked with watched episodes; there is no separate “Start watching” control in show details. Its watchlist flag remains until removed. Existing libraries preserve their previous memberships. Diary entries, viewing dates, and reviews are deferred; see [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

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

The tests cover status transitions, unaired episodes, specials, stats aggregations, runtime estimates, persistent ratings/progress/runtime metadata, invalid inputs, and cross-origin write protection. Tests use temporary data and do not call TMDB.

Browser tests use Playwright with installed Google Chrome, a temporary library, and fixture metadata. `npm run test:live` runs the main browser flow against real TMDB using `.env`; it also uses an isolated temporary library. Screenshots are saved under ignored `test-results/`.

Optional environment variables: `PORT` (default `3210`) and `TV_DATA_FILE` (alternative library path).

## Credits

Show data and artwork come from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
