// Preloaded only by browser tests. No network calls or real credentials required.
const catalog = [
  {
    id: 1396,
    name: "Breaking Bad",
    poster_path: "/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
    status: "Ended",
    first_air_date: "2008-01-20",
  },
  {
    id: 95396,
    name: "Severance",
    poster_path: "/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    status: "Returning Series",
    first_air_date: "2022-02-18",
  },
  {
    id: 76331,
    name: "Succession",
    poster_path: "/7HW47XbkNQ5fiwQFYGWdw9gs144.jpg",
    status: "Ended",
    first_air_date: "2018-06-03",
  },
  {
    id: 60059,
    name: "Better Call Saul",
    poster_path: "/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg",
    status: "Ended",
    first_air_date: "2015-02-08",
  },
  {
    id: 85552,
    name: "Euphoria",
    poster_path: "/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg",
    status: "Returning Series",
    first_air_date: "2019-06-16",
  },
  {
    id: 1438,
    name: "The Wire",
    poster_path: "/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
    status: "Ended",
    first_air_date: "2002-06-02",
  },
];
catalog.push(
  ...Array.from({ length: 23 }, (_, i) => ({
    id: 200000 + i,
    name: `Test series ${String(i + 1).padStart(2, "0")}`,
    status: "Returning Series",
    first_air_date: "2020-01-01",
  })),
);
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.hostname !== "api.themoviedb.org")
    throw new Error("Unexpected network call in fixture test.");
  const path = url.pathname.replace("/3/", "");
  if (path === "search/tv") {
    const query = url.searchParams.get("query").toLowerCase();
    if (query === "offline") return Response.json({}, { status: 503 });
    const page = Number(url.searchParams.get("page") || 1);
    const results = catalog.filter((s) => s.name.toLowerCase().includes(query));
    return Response.json({
      results: results.slice((page - 1) * 20, page * 20),
      page,
      total_results: results.length,
      total_pages: Math.ceil(results.length / 20),
    });
  }
  const match = path.match(/^tv\/(\d+)(?:\/season\/(\d+))?$/);
  const show = catalog.find((s) => s.id === Number(match?.[1]));
  if (!show) return Response.json({}, { status: 404 });
  if (match[2]) {
    const season_number = Number(match[2]);
    return Response.json({
      episodes: [1, 2, 3].map((n) => ({
        id: show.id * 100 + season_number * 10 + n,
        name: ["The beginning", "An unexpected turn", "Everything changes"][
          n - 1
        ],
        season_number,
        episode_number: n,
        air_date: "2020-01-01",
        runtime: 42 + n,
      })),
    });
  }
  return Response.json({
    ...show,
    overview:
      "Every choice has a consequence. An acclaimed series about the people we become and the lives we leave behind.",
    genres: [
      { id: 18, name: "Drama" },
      { id: 80, name: "Crime" },
    ],
    number_of_episodes: 6,
    episode_run_time: [45],
    seasons: [
      { season_number: 1, name: "Season 1" },
      { season_number: 2, name: "Season 2" },
    ],
  });
};
