// Static product guidance stays separate from the application shell.
export function renderHelp(container) {
  container.innerHTML = `
    <header class="help-hero">
      <div>
        <p class="eyebrow">WELCOME TO NEXT EPISODE</p>
        <h1 id="help-title">Keep your place.<br>Find what’s next.</h1>
        <p class="subtitle">
          Next Episode is your private TV library for tracking progress,
          rating shows, making personal lists, and deciding what to watch next.
        </p>
      </div>
      <div class="help-hero-mark" aria-hidden="true">
        <img src="/assets/logo.png" alt="">
      </div>
    </header>

    <section class="help-start" aria-labelledby="help-start-title">
      <div class="help-section-heading">
        <p class="eyebrow">START HERE</p>
        <h2 id="help-start-title">Three steps to your next episode</h2>
      </div>
      <ol class="help-steps">
        <li>
          <b>01</b>
          <div>
            <h3>Add a show</h3>
            <p>Use Add a show or press <kbd>⌘ K</kbd> to search TMDB. Add it to your library when you are ready to track it, or save it to Watchlist for later.</p>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <h3>Set your progress</h3>
            <p>Mark individual episodes, a whole season, or everything through a chosen episode. Your episode progress and Continue Watching position stay in sync.</p>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <h3>Make it yours</h3>
            <p>Rate shows and seasons, collect saved shows in personal lists, and use Stats to see the shape of your viewing history.</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="help-guide" aria-labelledby="help-guide-title">
      <div class="help-section-heading">
        <p class="eyebrow">HOW IT WORKS</p>
        <h2 id="help-guide-title">Your library, at a glance</h2>
      </div>
      <div class="help-card-grid">
        <article>
          <i class="help-icon" aria-hidden="true">＋</i>
          <h3>Library and Watchlist</h3>
          <p>Your library contains shows you track. Watchlist is an independent marker, so a show can be tracked and remain on your Watchlist at the same time.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">◎</i>
          <h3>Watch statuses</h3>
          <p>Watching, Paused, Caught Up, Completed, and Dropped describe where each show stands. Automatic status follows its episodes and series state.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">✓</i>
          <h3>Episode progress</h3>
          <p>Continue Watching finds the next aired episode in active shows. Specials remain optional and do not decide whether a regular season is complete.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">★</i>
          <h3>Ratings</h3>
          <p>Rate a show or any season from half a star to five stars. Show and season ratings stay separate, so one never silently replaces the other.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">≡</i>
          <h3>Find and filter</h3>
          <p>Combine watch statuses, Watchlist, genres, ratings, and title search in My Shows. Statuses match any selection; selected genres must all match.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">⌁</i>
          <h3>Stats</h3>
          <p>Explore lifetime totals, ratings, statuses, your most watched and highest-rated genres, episode progress, and estimated watch time. Genre rankings weight small samples toward your overall average.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">☷</i>
          <h3>Personal lists</h3>
          <p>Collect shows already in My Shows or Watchlist. Unranked lists start in added order; ranked lists keep manual ranks changed with drag-and-drop or Move buttons. Change either list's display order from its page.</p>
        </article>
      </div>
    </section>

    <section class="help-details" aria-label="Data, refresh, and credits">
      <article>
        <p class="eyebrow">PRIVATE BY DESIGN</p>
        <h2>Your library stays on this computer.</h2>
        <p>Ratings, progress, lists, and cached show information are stored in <code>data/library.json</code>. List gallery/row preferences stay in this browser. Next Episode has no account or cloud sync.</p>
        <p>Use <a href="/api/export" download>Back up library ↗</a> to download your shows, lists, membership, and manual list order. A show must be removed from its lists before it can be deleted completely.</p>
      </article>
      <article>
        <p class="eyebrow">FRESH SHOW INFORMATION</p>
        <h2>Updates happen a little at a time.</h2>
        <p>When the app opens, it refreshes up to five stale shows: daily for Watching and Caught Up, weekly for Paused and Watchlist-only, and every 30 days for Completed and Dropped.</p>
        <p>You can also use Refresh show info in any show’s details to check it immediately.</p>
      </article>
      <article class="help-credit">
        <p class="eyebrow">SHOW DATA</p>
        <h2>Powered by TMDB.</h2>
        <p>Show details and artwork are provided by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">The Movie Database</a>.</p>
        <img class="tmdb-logo" src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB">
        <p class="muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </article>
    </section>`;
}
