# Next Episode

A personal TV library: find shows, rate them, and keep your place across episodes and seasons. Built as a local web app with Node.js 22+ and no runtime dependencies.

## First-time setup

Install [Node.js 22 or newer](https://nodejs.org/), then clone the repository and
enter its directory:

```sh
git clone https://github.com/nperry02/next-episode.git
cd next-episode
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
- Sort by last updated, release date, recently added, personal rating, title, or watch status. Watch status groups Watching, Paused, Caught Up, Completed, and Dropped in that order, followed by Watchlist-only shows, with titles A–Z inside each group. “Last updated” is the default and uses the most recent newly watched progress, with shows lacking a timestamp afterward. Unknown premiere dates appear last for release sorting.
- Use the three view icons to switch between the default poster gallery, a backdrop gallery with card details overlaid on the images, and compact rows showing each show's name, premiere date, watch status, rating, progress, and last watched update. Both galleries show an outlined watch status label beside the title instead of the premiere year. Backdrop cards use landscape artwork and fall back to posters when needed. The browser remembers the selected view, independently for My Shows and each list.
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

## Local security and public source

The server explicitly binds to this computer's loopback interface with
`server.listen(..., "127.0.0.1", ...)` in [server.mjs](server.mjs). Host and Origin
checks reject other hosts and browser origins. There is no login or user
isolation: keep this app local rather than exposing it through port forwarding
or a public tunnel. Making the source repository public does not host the app.

Keep `.env` and its variants, personal library data, downloaded backups, and
private keys outside Git. Only the placeholder `.env.example` is published.
Use the ignored `backups/` directory for local backups saved within this checkout.
Ignore rules do not remove older commits; revoke or rotate any credential found
in published history, then assess whether history cleanup is needed.

Run `npm run check:secrets` before publication or after sensitive changes. It
downloads a pinned Gitleaks release, verifies its SHA-256 hash, scans every
locally fetched Git ref, and scans current nonignored publishable files. Ignored
credentials and personal libraries are excluded from that file snapshot. Reports
show finding locations without secret values; temporary files are removed.
The helper supports Apple Silicon macOS and Linux x64. An optional
`GITLEAKS_ARCHIVE` can reuse a downloaded archive, still subject to the same pinned
checksum. Secret scanning is a safeguard, not proof that no secret exists.

The `CI` workflow runs model/API checks, fixture browser tests, and secret scans
on pull requests, pushes to `main`, and manual dispatch. Jobs use read-only
permissions, commit-pinned official Actions, and GitHub-hosted runners. No TMDB
credential or other repository secret is needed. Jobs skip private repositories
to avoid private Actions usage charges. Dependabot vulnerability alerts and
security update pull requests are enabled for this repository; updates are not
merged automatically. The prepared Dependabot configuration adds weekly checks
for routine npm package and Action updates once merged into the default branch.
These Dependabot features are free. Other copies of this repository must enable
alerts and security updates separately in GitHub settings.

After publication is explicitly approved and the workflow is on the default
branch, run CI once and verify all three jobs pass. The prepared
[main ruleset](.github/main-ruleset.json) can then be applied with
`gh api --method POST repos/nperry02/next-episode/rulesets --input .github/main-ruleset.json`.
It requires a PR, resolved conversations, and current passing `Model and API`,
`Browser fixtures`, and `Secret scan` checks from GitHub Actions. It blocks force
pushes and deletion of `main`, has no bypass actors, and requires zero approvals
so a solo maintainer can merge their own PRs. The file alone does not activate
protection. Reuse an existing ruleset rather than creating duplicates.

Before considering publication complete, also verify secret scanning, push
protection, Dependabot alerts/security updates, and approval for all external
contributors' fork workflows are enabled. Keep Actions tokens read-only, automated
PR approval disabled, and outside PRs off self-hosted runners. Public Git history
includes author/committer emails; changing the email for future commits does not
remove addresses already in history. Review PR comments and attachments as well
as source files before changing visibility.

## Credits

Show data and artwork come from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
