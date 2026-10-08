# TV Tracker — project brief

Last updated: 2026-10-08

## Purpose and scope

Build a Letterboxd-style TV tracker for the owner's personal use. Focus on a personal library, viewing progress, and ratings. No social features. Public launch, multi-user accounts, and native mobile apps are not current requirements.

This document records the requested product direction. The first working local web app is implemented; see README.md for startup and storage details.

## Metadata

- Allow independent personal poster and backdrop choices from TMDB artwork fetched on demand. Persist only chosen paths, preserve them through metadata refresh, and allow resetting either choice to the current TMDB default.

Use TMDB as the preferred initial source for TV search, posters, descriptions, genres, seasons, episodes, air dates, and series status. Its TV endpoints fit the requested scope; no second provider is currently needed.

The user authorized reusing the existing TMDB credential from their Letterbox repository. It has been copied into this project's ignored `.env` file and validated successfully against TMDB's TV API. Keep credentials out of committed files and documentation.

References:

- [TV search](https://developer.themoviedb.org/reference/search-tv)
- [Series details](https://developer.themoviedb.org/reference/tv-series-details)
- [Season details](https://developer.themoviedb.org/reference/tv-season-details)
- [Application authentication](https://developer.themoviedb.org/docs/authentication-application)

## Watch statuses

The requested statuses are:

- **Watching:** Actively watching, with episodes still to watch.
- **Paused:** Temporarily stopped, with an intention that the show may be resumed later.
- **Completed:** Finished watching a show that is over.
- **Caught Up:** Watched all currently aired episodes of an ongoing or returning show, including between seasons.
- **Dropped:** Chosen to stop watching.

Suggested implementation rules, subject to refinement during development:

- Derive Completed versus Caught Up from both personal progress and TMDB series status. Watching all released episodes alone does not mean the series is over.
- Treat Ended or Canceled as over once all relevant episodes have aired and been watched. Cancellation must not hide remaining episodes.
- Keep a show Caught Up between seasons; when a new episode airs, move it to Watching if it remains unwatched.
- Keep Dropped explicit and persistent until the user changes it.
- Keep Paused until the user changes it or adds newly watched episode progress. Removing/correcting progress does not resume the show. When progress advances, return the show to its automatic status (normally Watching).
- Metadata can be incomplete or delayed; do not interpret a missing next air date as proof that a show has ended. Allow a manual correction when necessary.
- An ongoing status does not guarantee renewal or a known next-season date.

Watchlist and library membership are independent. In search, + Add puts a show in the tracked library as Watching, while + Watchlist saves it only to Watchlist. A tracked show can also be flagged for Watchlist (for example, for a rewatch) and remains in All shows and its status tab. Adding or removing the flag never changes library membership, ratings, progress, or status. A watchlist-only show enters the tracked library when assigned a viewing status or marked with watched episodes. Show details do not need a separate “Start watching” button. Its watchlist flag remains until removed. Existing libraries preserve their previous memberships.

## Viewing progress

- Each watched episode has a compact repeat button that adds one rewatch, with a count excluding the original watch and an adjacent options menu for exact-count corrections. Read-only season and show indicators show the minimum repeat count across currently aired episodes (regular episodes only for shows); new releases can lower summaries without clearing saved counts. Recorded rewatches move a show up in My Shows Last updated order, but never change progress, statuses, Continue Watching order, or Home Updates. Editing repeat counts is a correction and does not change recency. No bulk rewatch action or separate viewing run.
- Select the last watched episode within a season, e.g. “watched through season 2, episode 5.”
- Support marking an entire season watched and convenient individual episode changes.
- A “watched through” action should mark preceding regular episodes watched so the user does not have to enter their history episode by episode.
- Make progress editable to correct mistakes.
- Show the last watched position and next unwatched episode where available.
- Order “Pick up where you left off” by the time watched progress was most recently added, newest first, and show at most three eligible Watching shows. Progress corrections that only remove watched episodes do not update this order. Existing history has no inferred timestamp and uses a stable fallback until new progress is recorded.
- Suggested default: track specials separately without making them mandatory for completion. Exclude unaired episodes from currently available progress; handle missing air dates conservatively.

## Ratings

- Show ratings use the Letterboxd scale: 0.5–5 stars in half-star increments.
- Unrated is separate from any numeric rating.
- Season ratings are desired as an optional addition using the same scale; the user is open to supporting both show and season ratings.
- Keep an explicitly entered show rating independent of season ratings; do not silently replace it with an average.
- Episode ratings are outside the current scope.

## Your Shows

- Present the library as a responsive dashboard with Home, My Shows, Lists, and Stats navigation in the header.
- Keep the Home overview focused on library totals, Continue Watching, upcoming episodes, and latest updates.
- A personal library with an All view and tabs for Watching, Paused, Completed, Caught Up, and Dropped, plus a separate Watchlist. Shows can appear in both Watchlist and another status; those shows remain in All.
- Filter by personal rating, watch status, and genre; combine filters.
- Sort by watch status, personal rating, title, recently added, last updated watched progress, and original release date (newest or oldest first). Last updated is the default. It orders the most recent newly watched progress or recorded episode rewatch first, with shows lacking a timestamp afterward. Release date means the show's first premiere, not its most recent season; unknown dates appear last.
- Switch between a poster gallery (the first-use default), a backdrop gallery with four cards per desktop row, and a compact list using a shared icon-only three-way control. Both galleries use outlined watch status labels beside show titles instead of premiere years. Backdrop images are landscape with poster fallback. The list shows name, premiere date, watch status, rating, episode progress, and the last watched update, and the browser remembers the selected view.
- Show enough information to recognize each show and see its rating, status, and progress quickly.
- Search TMDB and add shows to this library.
- Persist personal ratings, progress, and library entries across restarts independently of refreshed metadata.
- Allow removing a show from All Shows to return it to an unwatched state. Clear viewing status, ratings, and progress; preserve an independent Watchlist flag. If it is not on Watchlist, remove the saved entry entirely so it can be added again from search.

## Home updates

- Upcoming episodes lists one nearest future unwatched regular episode per saved show except Dropped, ordered by air date then title. Include season premieres; exclude specials, unknown dates, and releases airing today. Offer a browser-saved 30/90-day window including its final day; rows open the corresponding season. Use cached episode metadata and the existing refresh schedule, with no new library fields or requests.
- On desktop, place Upcoming episodes beside a narrow Updates column, both 360px tall. Upcoming cards scroll horizontally; Updates scrolls vertically. Stack on smaller screens with each list capped at 320px. Show one latest meaningful update per saved show, newest first. Keep entries for 30 days from discovery; show ten initially with Show more/less.
- Detect newly available regular episodes, future season premiere dates and their changes or removal, Ended/Canceled series changes, and viewing-status changes. Do not log routine refreshes, ratings, artwork edits, or progress that does not change viewing status.
- External show updates use green accents and explicit Show update labels. Personal activity and news for Dropped shows use muted styling. Paused and Watchlist-only shows still receive news; personal-list membership never duplicates an entry.
- New external news replaces the previous entry and is unread. Personal activity cannot replace unread external news. A checkbox beside Unread marks an entry read, with a Mark as read hover hint; read entries remain until expiry. Personal activity is always included; there is no activity toggle. An info tooltip beside Updates explains retention.
- Persist detection baselines, latest entries, and read state in the normal library and backups. Existing/newly added shows start quietly without reconstructing historical news.
- Clicking the unread-count button (with a Mark all as read hover hint) saves all current unread entries in one operation, including entries beyond the initial ten. Hide the count when none remain. Match entry identifiers so newly replaced news stays unread.
- Detect metadata changes during successful refreshes and known air-date transitions on library load or date changes while open. Preserve the existing refresh schedule and all automatic/manual status rules; no push notifications or background service.

## Stats

- Recorded episode rewatches add to episode-watch and estimated watch-hour totals, including specials. Keep unique progress, completed seasons, statuses, ratings, and Continue Watching order independent. Store optional per-episode repeat counts, excluding the original watch, and clear them when the associated watched progress is cleared. Preserve them in metadata refreshes and backups; older libraries default to zero.
- Provide a dedicated Stats view inside the dashboard shell with lifetime library totals.
- Show tracked shows, episodes watched, completed seasons, estimated watch hours, show-rating distribution, status counts, regular aired-episode progress, and the top genres by show count and Bayesian-weighted rating.
- Keep Watchlist separate from viewing-status counts because it can overlap any status.
- Count watched specials in episode and watch-time totals. Exclude specials from completed-season and show-progress calculations.
- Estimate runtime from episode metadata first, typical show runtime second, and the median known library runtime as a fallback. Label watch time as approximate and let runtime coverage improve through the normal metadata-refresh cycle rather than a bulk backfill.
- Keep monthly activity, streaks, and time-based trends deferred until dated viewing history exists.

## Lists

- Provide private personal lists containing shows already saved in My Shows or Watchlist. Lists do not create show records or change status, progress, ratings, Watchlist membership, or Stats.
- Give each list a unique case-insensitive name, optional description, and dedicated overview and detail pages. Preview the first four displayed show backdrops in a 2 × 2 grid for lists with at least four shows; smaller lists use the first show's backdrop alone. Fall back to posters when backdrops are missing.
- Support unranked lists that initially display in oldest-added order. Both list types can change display order from the list page using added order, title, watch status, premiere date, or personal rating; missing dates and ratings remain last.
- Support ranked lists with durable manual ranks changed only in Edit List through accessible position fields. Alternate display sorting and switching to unranked never destroy the manual order restored by Ranked order.
- Manage membership from either the list or show details. Prevent complete deletion of a show until it is removed from every list that names it; deleting a list never deletes its shows.
- Reuse the My Shows gallery cards and compact rows on list details. Allow title search and status, genre, and rating filters within the current list without changing membership.
- Persist list data in `data/library.json` and include it in normal backup export and restore. Store only per-list gallery/list display preferences in the local browser.

## Deferred — remember for later

- Consolidate the complete show-collection filter toolbar into one configurable renderer shared by My Shows and Lists. Preserve the current My Shows layout exactly, allow collection-specific sort options such as Ranked order, and add visual geometry coverage before the refactor.
- Dated viewing diary and “when watched” logging.
- Diary entries or written reviews associated with viewing dates.
- Native mobile app and multi-device access.

When mobile development begins, reorganize the repository around these boundaries,
adapting the exact layout if the codebase has changed:

```text
apps/
  web/          Web app
  mobile/       Mobile app
functions/      Cloud Run backend functions
packages/       Shared client-only utilities used by web and mobile
  utilities/    General shared utilities
scripts/        One-off and off-app utilities
```

Until that work begins, keep implementation scoped to the current web app. Do not
prematurely introduce the mobile app, shared packages, cloud functions, or a
multi-device architecture.

Do not build diary or date-entry workflows in the initial version. Current progress is not a dated viewing history, and future diary features must not invent historical viewing dates.

## Initial implementation decisions

- Local Node.js web app, available on this Mac at localhost:3210. No login or cloud sync.
- Personal library and cached metadata persist in `data/library.json`, with atomic file replacement and a downloadable JSON backup.
- Show and optional season ratings both ship in the first version.
- Search offers separate + Add and + Watchlist actions. All-show totals and average ratings use tracked library membership, independently of the watchlist flag.
- Metadata refreshes on startup using status-aware intervals: 24 hours for Watching and Caught Up, seven days for Paused and Watchlist-only shows, and 30 days for Completed and Dropped. Limit automatic work to five stale shows per startup, prioritizing active shows and then the oldest metadata. Keep a manual refresh in show details.
- All five statuses can be manually set; Automatic returns to progress-based status. Manual status does not change episode progress. Paused returns to automatic status when newly watched progress is added.

## Still open for later

- The mobile technology and deployment model.
- How authentication, storage, and synchronization should work across devices.

Diary and viewing-date features remain deferred.
