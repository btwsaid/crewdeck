# Privacy and local-only threat model

## Assets

Firstmate homes can contain prompts, status prose, filesystem locations, terminal and pane identifiers, credentials, personal identities, and delivery metadata. Native provider stores can contain login material and emails. Crewdeck treats all upstream objects as private by default.

## Trust boundaries

1. **Configured ownership boundary:** `FM_HOME` is mandatory in live mode. Membership comes only from Firstmate's read-only `fm-fleet-snapshot.v1` collector and validated registered second-mate homes. Crewdeck never scans process tables, terminals, sockets, home directories, or unrelated runtime sessions.
2. **Collection boundary:** [`src/server/service.ts`](../src/server/service.ts) alone invokes fixed local commands and reads exact metadata files for already-authorized task IDs. Executables receive a literal `--json`; shell mode and caller-supplied argv are impossible. Stderr is discarded rather than retained.
3. **Presentation boundary:** mappers construct [`contracts.ts`](../src/server/contracts.ts) values one field at a time. A new source field is excluded until deliberately mapped. `assertCleanPayload` runs before every API JSON or SSE serialization.
4. **Network boundary:** the Node server binds `127.0.0.1`; explicit IP Host checks, forwarded-header refusal, same-origin mutation checks, and CSP reduce DNS-rebinding and browser cross-site risks.
5. **Persistence boundary:** snapshots are memory-only. The account registry is mode `0600` and contains only alias/sourceId pairs.

## Browser presentation allowlist

- Worker: task slug, project display name, safe task-part/status text, kind, runtime family, model display name, effort, semantic status, start/end/update times, phase counts/label, next semantic gate, numeric PR identity/state, aggregate CI state/check label, blocker/decision-safe summary, stale marker.
- Home: generated Crewdeck home ID, captain-facing primary/second-mate label, availability, safe reason, last observation time.
- Quota: schema version, provider/plan/source kind, account alias, exact source state, safe reason, latest query-error observation/reason, window ID/label/kind, remaining percentage, reset/window timestamps, elapsed tide percentage, pace fields, limiting IDs, comparability state.
- Account: captain alias, provider, plan, masked non-secret source identifier, quota windows/state, safe limitation note.

No wildcard object spread is used across this boundary.

## Always excluded

Prompts; conversation content; terminal output; usernames or emails; raw files; local filesystem locations; endpoint, pane, tab, workspace, or session identifiers; tokens, secrets, passwords, cookies, keys, credential records; native account identity; monetary costs, credits, prices, or amounts; arbitrary URLs; unrecognized future source fields.

Status and reason prose is normalized, length-bounded, and replaced wholesale when it resembles an email, local path, credential assignment, token shape, control sequence, or monetary value. Replacing the whole field avoids partial-secret leakage.

## Account and quota safety

Crewdeck calls only `quota-axi --json`. It never invokes or ingests `--full`. Official CLIs own sign-in and logout. Crewdeck accepts no credential field and disconnects no native profile. A profile can be registered only after the authoritative safe source reports a stable masked identifier; otherwise detection says unsupported.

Transient Claude query failures can retain a prior field-by-field presentation snapshot only in process. Retention removes stale pace and limiting claims, drops reset-expired windows, expires resetless session evidence after five hours and weekly/model evidence after seven days, and never survives process restart. Authentication rejection is definitive and bypasses retention.

## Residual risks

- A malicious dependency running in the same Node process has the process's local read authority. Lockfile review, zero audit findings, CSP, and the narrow collector reduce but cannot erase package-supply-chain risk.
- Captain-facing Firstmate status text is useful presentation data. Defense-in-depth lint can withhold suspicious text, but captains should still avoid placing secrets in status lines.
- Firstmate's own registered remote collector can use Firstmate's existing supervision transport. Crewdeck neither configures nor directly opens that channel; route security remains Firstmate's trust decision.
- Any local process running as the same OS account can generally call a loopback service. Crewdeck's boundary prevents remote exposure, not compromise of the local account.
