// Static product guidance stays separate from the application shell.
// Render app usage guidance, storage behavior, and third-party attribution.
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
          <h3>Home updates</h3>
          <p>Home places Updates beside your four top-rated shows on desktop and below them on smaller screens. The desktop feed matches the height of Top-rated shows; scroll inside it to browse entries. The info icon beside Updates explains its 30-day retention.</p>
          <p>Updates shows the latest meaningful change for each saved show for 30 days from discovery. New episodes, season premiere dates or date changes, and a series ending or being cancelled appear as Show updates. Paused and Watchlist shows get news too; Dropped-show news uses muted styling.</p>
          <p>Your viewing-status changes appear as muted Your activity entries. Your activity is always included. Ratings, artwork edits, and ordinary progress changes do not create updates.</p>
          <p>New show news replaces the previous entry. Your activity cannot replace unread show news. Check the box beside Unread to mark an entry read; hovering over it shows Mark as read. Click the unread-count button in the header to mark the entire current feed read, including entries beyond the newest ten; its hover hint says Mark all as read. The count disappears when everything is read. New news discovered during that save stays unread. Read entries stay in the feed until their 30 days expire. Show more reveals entries beyond the newest ten.</p>
          <p>News is discovered when show information refreshes, or when a known episode air date arrives while the app is open or on your next visit. Existing shows start with a quiet baseline, so the feed does not reconstruct older news. Cancellation does not mark unwatched episodes as watched, and Paused or manually chosen statuses remain respected.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">≡</i>
          <h3>Find and filter</h3>
          <p>Combine watch statuses, Watchlist, genres, ratings, and title search in My Shows. Statuses match any selection; selected genres must all match.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">⌁</i>
          <h3>Stats</h3>
          <p>Use the repeat button beside a watched episode to record another viewing. The number shows rewatches only, excluding the original watch. Open its options menu to edit the count or set it to zero. Show and season repeat indicators count complete rewatches of currently aired episodes; a newly aired episode can lower that summary until you rewatch it. Specials count separately and are excluded from the show indicator. There is no separate rewatch mode or Home activity entry.</p>
          <p>Episode watches and estimated watch time include recorded rewatches, including specials. Repeat counts exclude the original watch. Rewatches do not change unique episode progress, completed-season totals, show status, or viewing order. Clearing watched progress also clears its repeat counts.</p>
          <p>Explore lifetime totals, ratings, statuses, your most watched and highest-rated genres, episode progress, and estimated watch time. Genre rankings weight small samples toward your overall average.</p>
        </article>
        <article>
          <i class="help-icon" aria-hidden="true">☷</i>
          <h3>Personal lists</h3>
          <p>Sort by Watch status in My Shows or a list to group Watching, Paused, Caught Up, Completed, then Dropped, with Watchlist-only shows last and titles A–Z within groups. Use the three view icons in My Shows or a list to choose poster gallery, backdrop gallery, or compact rows. Both galleries show an outlined watch status label beside the title instead of the premiere year. The backdrop gallery places details over landscape artwork. Missing backdrops fall back to posters.</p>
          <p>Search the Lists overview by list name or description.</p>
          <p>Collect shows already in My Shows or Watchlist. Search and filter each list using the familiar My Shows layouts. Edit ranked lists to change manual order with position fields; either list type can change its display order.</p>
          <p>List covers follow display order: four or more shows use a 2 × 2 backdrop grid; smaller lists use the first show's backdrop. Missing backdrops fall back to posters.</p>
        </article>
      </div>
    </section>

    <section class="help-details" aria-label="Data, refresh, and credits">
      <article>
        <p class="eyebrow">PRIVATE BY DESIGN</p>
        <h2>Your library stays on this computer.</h2>
        <p>Ratings, progress, lists, cached show information, latest updates, and read state are stored in <code>data/library.json</code> and included in backups. Poster gallery, backdrop gallery, and list view preferences stay in this browser, with a separate preference for each list. Next Episode has no account or cloud sync.</p>
        <p>Use <a href="/api/export" download>Back up library ↗</a> to download your shows, lists, membership, and manual list order. A show must be removed from its lists before it can be deleted completely.</p>
      </article>
      <article>
        <p class="eyebrow">FRESH SHOW INFORMATION</p>
        <h2>Updates happen a little at a time.</h2>
        <p>When the app opens, it refreshes up to five stale shows: daily for Watching and Caught Up, weekly for Paused and Watchlist-only, and every 30 days for Completed and Dropped.</p>
        <p>You can also use Refresh show info in any show’s details to check it immediately.</p>
        <p>Saved personal poster and backdrop choices take priority over TMDB defaults and survive metadata refreshes and backups.</p>
        <p>Use Change artwork at the top of show details to choose a poster or backdrop. An asterisk beside the button means saved artwork differs from the current TMDB default. Options load only when you open the picker; Save changes applies your choices everywhere. Use TMDB default resets either image, and Cancel leaves saved artwork unchanged.</p>
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
