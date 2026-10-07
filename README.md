# Next Episode

A personal TV library: find shows, rate them, and keep your place across episodes and seasons. Built as a local web app with Node.js 22+ and no runtime dependencies.

## First-time setup

Install [Node.js 22 or newer](https://nodejs.org/), then clone the repository and
enter its directory:

```sh
git clone https://github.com/nperry02/TV-tracker.git
cd TV-tracker
```

Create the local environment file from the committed template:

```sh
cp .env.example .env
```

Create a TMDB account and request an API credential from its
[API settings](https://www.themoviedb.org/settings/api). Open `.env` and add
the API Read Access Token or v3 API key:

```env
TMDB_TOKEN=your_tmdb_credential
```

`PORT` is optional. The app uses port `3210` when it is not included in `.env`.
The credential and personal library stay outside Git. Each checkout creates its
own independent library in `data/library.json` when the app first saves data.

The web app has no runtime packages to install. Run `npm install` only when you
also need the Playwright development dependency for browser testing.

## Running the app

```sh
npm start
```

Open **http://localhost:3210**. The server is available only on the computer
running it. Stop it with Ctrl+C.

## Current features

- Use the header to move between distinct Home, My Shows, Lists, and Stats views or open the Add a show dialog. A navigation drawer keeps those actions available in narrow web-browser windows.
- Home shows library summary cards and up to three backdrop-based Continue Watching cards. My Shows contains the collection, filters, sorting, and gallery/list controls.
- Open Help & about from the footer for an in-app guide to progress, statuses, filtering, refreshes, local data, backups, and show-data credits.
- Open Stats from the header for lifetime totals, a half-star rating histogram, status and progress breakdowns, top genres, and clickable top-rated shows.
- Stats estimate watch time from episode runtimes, each show's typical runtime, and the median known runtime in the library. Specials count toward episodes watched and watch time, but not season-completion or regular-episode progress.
- Search TMDB and add shows to your library. Load additional pages without losing earlier results; failed page loads can be retried.
- Filter by one or more Watching, Paused, Caught Up, Completed, or Dropped statuses. Multiple statuses use OR behavior; All shows clears status and Watchlist selections. Watchlist remains independent and intersects any selected statuses.
- Combine title search, personal rating, and one or more genre filters. A show must match every selected genre. Filter selections remain available while navigating or reloading the current browser tab.
- Sort by last updated, release date, recently added, personal rating, or title. “Last updated” is the default and uses the most recent newly watched progress, with shows lacking a timestamp afterward. Unknown premiere dates appear last for release sorting.
- Switch between the default poster gallery and a compact list showing each show's name, premiere date, watch status, rating, progress, and last watched update. The browser remembers the selected view.
- Create private ranked or unranked lists from shows already saved in My Shows or Watchlist. New unranked lists begin in added order. Change either kind of list's display order from its detail page; edit ranked lists to rearrange their durable manual ranks with position fields.
- Add or remove shows from a list page or use Manage lists in show details. Search and filter a list by status, genre, or rating, and use the same gallery cards and compact rows as My Shows. Each list remembers its own gallery/list layout in the current browser, while list names, descriptions, membership, and manual order live in the library file.
- Rate shows and individual seasons independently, from 0.5 to 5 stars.
- Choose a show's poster and backdrop with Change artwork in show details. Browse TMDB options on demand, save only selected paths, and reset either image to the TMDB default. Personal artwork choices survive refreshes and backups and apply throughout the app.
- Mark individual episodes or aired episodes in a season watched. “Watched through here” fills in earlier regular episodes across seasons.
- Mark the next unwatched episode directly from the library or show details. “Watched through this season” fills in earlier seasons too.
- “Pick up where you left off” shows up to three Watching shows with remaining episodes, ordered by the most recently added watched progress. Correcting/removing progress does not move a show to the front.
- Correct progress by unchecking episodes or clearing a season.
- Remove an accidentally added show from All Shows. This clears its viewing status, ratings, and progress; a separate Watchlist flag is preserved. A show referenced by a list must be removed from those named lists before it can be deleted completely.
- Automatic status distinguishes ongoing shows from ended/canceled shows. Paused is a manual status for shows you may resume; adding newly watched progress returns it to Watching automatically. Dropped remains set until changed manually.
- Specials are optional and do not affect completion. Future episodes and episodes with unknown air dates are not marked watched in bulk.
- Show information refreshes when opening the app according to viewing status: daily for Watching and Caught Up, weekly for Paused and Watchlist-only shows, and every 30 days for Completed and Dropped. Each startup refreshes at most five stale shows, with active shows first. A manual refresh remains available in show details, and saved library data remains usable when TMDB is offline.
- Download a JSON backup from the footer.

Watchlist and library membership are independent. In search, + Add puts a show in the tracked library as Watching, while + Watchlist saves it only to Watchlist. A tracked show can also be flagged for Watchlist (for example, for a rewatch) and remains in All shows and its matching status filter. Adding or removing the flag never changes library membership, ratings, progress, or status. A watchlist-only show enters the tracked library when assigned a viewing status or marked with watched episodes; there is no separate “Start watching” control in show details. Its watchlist flag remains until removed. Existing libraries preserve their previous memberships. Diary entries, viewing dates, and reviews are deferred; see [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

## Storage and backups

Personal data, lists, and cached metadata live in `data/library.json`. Writes use a temporary file and atomic replacement. The data directory and credentials are excluded from Git. Use one running server for a given library file. Browser storage holds presentation preferences such as the My Shows layout and each list's gallery/list choice.

Downloaded backups include lists, membership, and manual order. To restore one, stop the server, preserve your existing file, and copy the backup to `data/library.json`. Then restart. There is no cloud sync or account system.

## Development and verification

```sh
npm install
npm run dev
npm run check
npm run test:browser
```

The tests cover status transitions, unaired episodes, specials, stats aggregations, runtime estimates, persistent ratings/progress/runtime metadata, invalid inputs, and cross-origin write protection. Tests use temporary data and do not call TMDB.

Browser tests use Playwright with installed Google Chrome, a temporary library, and fixture metadata. `npm run test:live` runs the main browser flow against real TMDB using `.env`; it also uses an isolated temporary library. Screenshots are saved under ignored `test-results/`.

When application behavior described by the in-app Help & about page changes, update `public/views/help.js` as part of the same work so the guide remains accurate.

Optional environment variables: `PORT` (default `3210`) and `TV_DATA_FILE` (alternative library path).

## Credits

Show data and artwork come from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
