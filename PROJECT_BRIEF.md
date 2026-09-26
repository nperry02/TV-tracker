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
- **Completed:** Finished watching a show that is over.
- **Caught Up:** Watched all currently aired episodes of an ongoing or returning show, including between seasons.
- **Dropped:** Chosen to stop watching.

Suggested implementation rules, subject to refinement during development:

- Derive Completed versus Caught Up from both personal progress and TMDB series status. Watching all released episodes alone does not mean the series is over.
- Treat Ended or Canceled as over once all relevant episodes have aired and been watched. Cancellation must not hide remaining episodes.
- Keep a show Caught Up between seasons; when a new episode airs, move it to Watching if it remains unwatched.
- Keep Dropped explicit and persistent until the user changes it.
- Metadata can be incomplete or delayed; do not interpret a missing next air date as proof that a show has ended. Allow a manual correction when necessary.
- An ongoing status does not guarantee renewal or a known next-season date.

Watchlist is a separate tab, excluded from All shows and its count. New shows with no watched episodes start there automatically. Marking the first episode watched moves a show into the tracked library; clearing all progress returns it to Watchlist. Explicit status overrides remain in effect until changed back to Automatic. Ratings alone do not start a show. Existing automatic-status shows without progress follow the same rule.

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

- A personal library with an All view and tabs for Watching, Completed, Caught Up, and Dropped, plus a separate Watchlist excluded from All.
- Filter by personal rating, watch status, and genre; combine filters.
- Sort by personal rating, title, recently added, and original release date (newest or oldest first). Release date means the show's first premiere, not its most recent season; unknown dates appear last.
- Show enough information to recognize each show and see its rating, status, and progress quickly.
- Search TMDB and add shows to this library.
- Persist personal ratings, progress, and library entries across restarts independently of refreshed metadata.

## Deferred — remember for later

- Dated viewing diary and “when watched” logging.
- Diary entries or written reviews associated with viewing dates.

Do not build diary or date-entry workflows in the initial version. Current progress is not a dated viewing history, and future diary features must not invent historical viewing dates.

## Initial implementation decisions

- Local Node.js web app, available on this Mac at localhost:3210. No login or cloud sync.
- Personal library and cached metadata persist in `data/library.json`, with atomic file replacement and a downloadable JSON backup.
- Show and optional season ratings both ship in the first version.
- Newly added shows appear in Watchlist until an episode is marked watched. Tracked-show totals and average ratings exclude watchlist entries.
- Metadata refreshes on startup when older than six hours, with a manual refresh in show details.
- All four statuses can be manually set; Automatic returns to progress-based status. Manual status does not change episode progress.

## Still open for later

- Whether cross-device access is needed.

Diary and viewing-date features remain deferred.
