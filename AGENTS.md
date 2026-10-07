# Project commands and style guide

Read PROJECT_BRIEF.md for the product scope and deferred features.

## Project overview and architecture

- Next Episode is a local TV-tracking web app for one user.
- The server uses Node.js 22 with no runtime dependencies. The client uses plain JavaScript, HTML, and CSS; do not apply React or TypeScript conventions unless the stack changes.
- `server.mjs` owns the local API, TMDB integration, and persistent JSON storage.
- `public/app.js` coordinates browser state, routing, mutations, and events. `public/api.js` handles requests, `public/ui.js` contains shared presentation helpers, `public/views/` contains feature renderers, and `public/model.js` contains pure domain logic. `public/index.html` and `public/style.css` define the interface structure and styling.
- Personal library data lives in ignored `data/library.json`. Never commit library data, credentials, dependencies, or generated test artifacts.

## Project commands

- `npm start`: run the local app.
- `npm run dev`: run the local app with Node watch mode.
- `npm run check`: check JavaScript syntax and run model/API tests.
- `npm run test:browser`: run the Playwright browser flow against fixture TMDB data.
- `npm run test:live`: run the isolated browser flow against live TMDB only when integration changes warrant it.

## Code style

- Use comments as regular navigational landmarks, especially in long files and multi-step flows. A reader should be able to skim the comments and understand the major sections, data flow, and places where behavior is constrained.
- Add short section comments above meaningful groups of state, helpers, effects, rendering branches, and processing phases. Within longer functions, label the major steps when the sequence is easier to follow with signposts such as filtering, fetching, merging, reconciling, or updating state.
- Explain behavior that is not obvious from the code itself, including caching and synchronization rules, fallback behavior, dependency choices, performance-sensitive lookups, stale-request protection, ordering requirements, and side effects. Use two or three lines when the constraint or interaction cannot be stated clearly in one.
- Strongly prefer source comment blocks of three consecutive lines or fewer. A longer block is acceptable when a correctness constraint or interaction cannot be explained accurately within that limit, but first improve the surrounding names or structure, split explanations beside the relevant phases, and move broader rationale to the commit and pull request.
- Put a short purpose comment immediately before every named function, including arrow-function helpers, nested helpers, and object methods. Describe what the function returns or changes; retain nearby rationale and section comments when they add useful context.
- Brief comments on straightforward operations are acceptable when they divide a dense workflow into readable phases. Avoid commenting every assignment or repeating names in prose. Document event handlers and substantial callbacks at their registration or processing phase; concise inline callbacks can rely on the enclosing function's explanation.
- During substantive work, review the touched area for missing section and rationale comments instead of commenting only the newly added lines. Do not leave a substantial module or complex workflow with no navigational comments merely because each individual statement is readable.
- Keep comments current when the surrounding behavior changes. Do not describe removed implementations or leave historical notes in source; use commit and pull request history for that context.
- Use standard top-level ESM imports. Keep imports grouped by built-in, third-party, and local modules when more than one group is present.
- Use camelCase for variables and functions, PascalCase for constructable types if introduced, and ALL_CAPS for configuration-level constants. Ordinary local `const` bindings remain camelCase.
- Use `try`/`catch` around asynchronous operations that can fail and provide a useful fallback for network requests.
- Keep pure, reusable domain calculations in `public/model.js` so they can be unit tested independently.
- Follow the existing file organization and patterns. Prefer an existing file or UI pattern when it is the natural fit; create a focused file when separation materially improves clarity.
- Reuse existing helpers, controls, and dialogs when practical. Extract shared logic when it prevents meaningful duplication or makes behavior easier to verify; avoid premature abstractions.
- Treat repeated interface patterns as complete reusable components when practical: share their markup, icons, interaction behavior, layout structure, and styling so the same control looks and behaves consistently everywhere it appears.
- For interface icons, first reuse an icon already serving the same purpose elsewhere in the site. If none exists, use the complete appropriate Lucide icon as provided rather than recreating part of it with text, CSS, or custom SVG; custom symbols are a last resort and should generally be avoided.
- Do not add a paid service, dependency, API, or feature that costs money to implement or use. If requested work would create a cost, explain the cost and why it should not be implemented before making the change.
- Stay within the requested scope while completing the supporting work needed to make the change functional and testable. Ask for clarification when a product decision cannot be inferred safely.
- Do not create new Markdown or README files unless the user requests one or a workflow explicitly requires it. Update existing documentation when product behavior, commands, or repository workflow changes.
- Keep the in-app Help & About page in `public/views/help.js` accurate. When a change affects behavior explained there—such as progress, statuses, filters, statistics, refresh timing, storage, backups, shortcuts, or data attribution—update the page in the same milestone.

## Branches and pull requests

- Always work on a feature branch. Never commit directly to `main`.
- Name branches `<user>/NUM-XXXX/<brief-description>`, using the contributor's GitHub username and lowercase words separated by hyphens, for example `nperry02/NUM-0001/workflow`.
- Increase the work number for each new body of work. Use the next number after the highest branch or `NUM-XXXX` PR title; GitHub's automatic PR number is unrelated.
- Format work identifiers as uppercase `NUM-` followed by the work number padded to a minimum of four digits, for example `NUM-0004`, `NUM-1234`, and `NUM-12345`.
- Use the same work identifier in the branch name, commit subjects, and pull request title. Title pull requests `NUM-XXXX: Brief description`, for example `NUM-0001: Add workflow guidelines`.
- Write descriptive commit messages with a concise subject followed by a detailed body for every substantive change. Cover the behavior that changed, the problem or root cause, the implementation approach, relevant design decisions or tradeoffs, and any edge cases or compatibility concerns. Include the validation performed when it adds useful context. Small mechanical commits may use a shorter body, but it must still make the purpose clear.
- Write pull request bodies for reviewers who have not followed the working conversation. Include the concrete problem and resulting behavior, a structured summary of the main implementation areas, important technical decisions and tradeoffs, user-visible or compatibility considerations, and a test plan with actual results. Call out known limitations or follow-up work when relevant instead of relying on commit subjects to tell the story.
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
