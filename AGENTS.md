# Project commands and style guide

Read PROJECT_BRIEF.md for the product scope and deferred features.

## Project overview and architecture

- Next Episode is a local TV-tracking web app for one user.
- The server uses Node.js 22 with no runtime dependencies. The client uses plain JavaScript, HTML, and CSS; do not apply React or TypeScript conventions unless the stack changes.
- `server.mjs` owns the local API, TMDB integration, and persistent JSON storage.
- `public/app.js` owns browser behavior, `public/model.js` contains pure domain logic, and `public/index.html` and `public/style.css` define the interface.
- Personal library data lives in ignored `data/library.json`. Never commit library data, credentials, dependencies, or generated test artifacts.

## Project commands

- `npm start`: run the local app.
- `npm run dev`: run the local app with Node watch mode.
- `npm run check`: check JavaScript syntax and run model/API tests.
- `npm run test:browser`: run the Playwright browser flow against fixture TMDB data.
- `npm run test:live`: run the isolated browser flow against live TMDB only when integration changes warrant it.

## Code style

- Keep comments minimal and functional. Use one short line for non-obvious behavior or constraints. Do not narrate straightforward code or describe removed implementations; use commit and PR history for that context.
- Use standard top-level ESM imports. Keep imports grouped by built-in, third-party, and local modules when more than one group is present.
- Use camelCase for variables and functions, PascalCase for constructable types if introduced, and ALL_CAPS for configuration-level constants. Ordinary local `const` bindings remain camelCase.
- Use `try`/`catch` around asynchronous operations that can fail and provide a useful fallback for network requests.
- Keep pure, reusable domain calculations in `public/model.js` so they can be unit tested independently.
- Follow the existing file organization and patterns. Prefer an existing file or UI pattern when it is the natural fit; create a focused file when separation materially improves clarity.
- Reuse existing helpers, controls, and dialogs when practical. Extract shared logic when it prevents meaningful duplication or makes behavior easier to verify; avoid premature abstractions.
- Do not add a paid service, dependency, API, or feature that costs money to implement or use. If requested work would create a cost, explain the cost and why it should not be implemented before making the change.
- Stay within the requested scope while completing the supporting work needed to make the change functional and testable. Ask for clarification when a product decision cannot be inferred safely.
- Do not create new Markdown or README files unless the user requests one or a workflow explicitly requires it. Update existing documentation when product behavior, commands, or repository workflow changes.

## Branches and pull requests

- Always work on a feature branch. Never commit directly to `main`.
- Name branches `<user>/<number>/<brief-description>`, using the contributor's GitHub username and lowercase words separated by hyphens, for example `nperry02/1/workflow`.
- Increase the work number for each new body of work. Use the next number after the highest branch in this format or `num-XXX` PR title; GitHub's automatic PR number is unrelated.
- Title pull requests `num-XXX: Brief description`, zero-padding the same work number, for example `num-001: Add workflow guidelines`.
- Include a concise summary and test plan in every pull request body.
- Create pull requests with `gh` or the GitHub integration when requested.

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
