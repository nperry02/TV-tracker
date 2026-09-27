# Project workflow

Read PROJECT_BRIEF.md for the product scope and deferred features.

## Incremental delivery

The user wants work completed in steps, with commits and pushes between useful milestones rather than only at the end of a large implementation.

- Before substantial work, identify a few coherent milestones.
- Complete and verify each milestone and review its diff, then ask the user whether it should be committed and pushed. Do not commit or push until the user explicitly approves that specific milestone.
- Choose boundaries that leave the project usable: a tested data/API feature, a complete UI flow, or a focused fix. Keep small related changes together.
- Run checks appropriate to the milestone. Use `npm run check` for application logic and API changes, and `npm run test:browser` for UI flows. Use the live TMDB check only when integration changes warrant it.
- Always request the user's approval before every commit and push, even when a previous milestone was approved. A request to implement or continue work does not authorize committing or pushing it.
- Never force-push, rewrite shared history, or commit credentials, local library data, dependencies, or test artifacts.
- Verify each push and report the completed milestone briefly. If a push is blocked, explain the specific blocker rather than silently postponing all pushes.

This workflow applies to future work as well as the initial implementation.
