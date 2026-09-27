# TV Tracker — project brief

Last updated: 2026-09-26

## Purpose and scope

Build a Letterboxd-style TV tracker for the owner's personal use. Focus on a personal library, viewing progress, and ratings. No social features. Public launch, multi-user accounts, and native mobile apps are not current requirements.

This document records the requested product direction. The first working local web app is implemented; see README.md for startup and storage details.

## Metadata

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

- Select the last watched episode within a season, e.g. “watched through season 2, episode 5.”
- Support marking an entire season watched and convenient individual episode changes.
- A “watched through” action should mark preceding regular episodes watched so the user does not have to enter their history episode by episode.
- Make progress editable to correct mistakes.
- Show the last watched position and next unwatched episode where available.
- Suggested default: track specials separately without making them mandatory for completion. Exclude unaired episodes from currently available progress; handle missing air dates conservatively.

## Ratings

- Show ratings use the Letterboxd scale: 0.5–5 stars in half-star increments.
- Unrated is separate from any numeric rating.
- Season ratings are desired as an optional addition using the same scale; the user is open to supporting both show and season ratings.
- Keep an explicitly entered show rating independent of season ratings; do not silently replace it with an average.
- Episode ratings are outside the current scope.

## Your Shows

- A personal library with an All view and tabs for Watching, Paused, Completed, Caught Up, and Dropped, plus a separate Watchlist. Shows can appear in both Watchlist and another status; those shows remain in All.
- Filter by personal rating, watch status, and genre; combine filters.
- Sort by personal rating, title, recently added, and original release date (newest or oldest first). Release date means the show's first premiere, not its most recent season; unknown dates appear last.
- Show enough information to recognize each show and see its rating, status, and progress quickly.
- Search TMDB and add shows to this library.
- Persist personal ratings, progress, and library entries across restarts independently of refreshed metadata.
- Allow removing a show from All Shows to return it to an unwatched state. Clear viewing status, ratings, and progress; preserve an independent Watchlist flag. If it is not on Watchlist, remove the saved entry entirely so it can be added again from search.

## Deferred — remember for later

- Dated viewing diary and “when watched” logging.
- Diary entries or written reviews associated with viewing dates.

Do not build diary or date-entry workflows in the initial version. Current progress is not a dated viewing history, and future diary features must not invent historical viewing dates.

## Initial implementation decisions

- Local Node.js web app, available on this Mac at localhost:3210. No login or cloud sync.
- Personal library and cached metadata persist in `data/library.json`, with atomic file replacement and a downloadable JSON backup.
- Show and optional season ratings both ship in the first version.
- Search offers separate + Add and + Watchlist actions. All-show totals and average ratings use tracked library membership, independently of the watchlist flag.
- Metadata refreshes on startup when older than six hours, with a manual refresh in show details.
- All five statuses can be manually set; Automatic returns to progress-based status. Manual status does not change episode progress. Paused returns to automatic status when newly watched progress is added.

## Still open for later

- Whether cross-device access is needed.

Diary and viewing-date features remain deferred.
