# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Read `README.md` before changing runtime behavior; it owns setup, configuration, architecture, account semantics, and the local-only guarantee.
- `src/server/service.ts` is the only operational collection owner. Keep fleet/quota argv fixed to `--json`, never add `quota-axi --full`, and construct presentation payloads through `src/server/contracts.ts` plus `src/server/safety.ts`.
- Public fixtures and screenshots must remain synthetic. Run `npm run check` before shipping; browser acceptance scenarios live in `tests/e2e/crewdeck.spec.ts`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
