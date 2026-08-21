# Testing and synthetic scenarios

All repository fixtures are invented. Synthetic mode is the default for development, screenshots, and CI and never reads `FM_HOME` or invokes `quota-axi`.

## Automated suites

- `tests/unit`: metadata/status/quota parsers, runtime/model separation, hostile allowlist mapping, elapsed semantics, account registry shape and file mode, comparable account windows, and Host/Forwarded/Origin enforcement.
- `tests/integration`: fixed `--json` argv, timeout/output limits, discarded diagnostics, malformed and hostile Firstmate snapshots, primary plus second-mate grouping, stale retention/recovery, partial providers, live stream heartbeat/reconnect and refresh behavior, account mutations, and no snapshot persistence.
- `tests/e2e`: live night watch, blocker ordering, critical quota, source failure, stale recovery, actual and filtered empty states, add/detect/rename/disconnect, comparable and incomparable windows, keyboard/focus restoration, responsive desktop/mobile, reduced motion, loopback requests, and clean browser payloads.

Run the complete gate:

```sh
npm run check
```

## Scenario controls

Synthetic mode exposes a bottom scenario rail:

- `live`: full primary and second-mate watch bill.
- `loading`: static-under-reduced-motion skeletons.
- `empty`: genuine no-worker state.
- `stale`: retained values with seven-minute stale notices.
- `partial`: unreachable second mate and failed Codex quota source.
- `critical`: Claude 5-hour remaining at 11%.
- `source failure`: explicit quota execution failure state.
- `incomparable`: two Claude aliases with different window sets.

## Screenshot regeneration

After installing Playwright Chromium:

```sh
# terminal 1
npm run build
CREWDECK_DEMO=1 npm start

# terminal 2
npm run screenshots
```

The capture script starts no server itself. Run it while a synthetic production server is listening on `http://127.0.0.1:4317`, or set `CREWDECK_SCREENSHOT_URL` to another explicit loopback URL. It refuses non-loopback targets and records zero remote requests.
