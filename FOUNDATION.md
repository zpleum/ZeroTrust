# Foundation implementation

## Current policy correction (2026-11-01)

This section supersedes historical configuration/deployment guidance below.
Room policy revision 2 requires process.env, a local untracked .env, and
.gitignore rules for .env and node_modules. No credentials or assigned port are
copied from historical source. Project p01 was confirmed previously; verified
connection settings must be supplied locally before any live DB check. SQL must
go through the database UI, never server startup or npm scripts.
No migration is executed in this batch. Public publication is disabled.

## Scope and precedence

Project: p01 (confirmed by user); requested database db_std09_p01 and assigned
port 31091. Runtime is CommonJS; Node 24 is the observed local version, not a
classroom requirement. The earlier MariaDB/no-environment/native-package-ban
claims were incorrect. Application settings now read process.env; .env is loaded
locally without overriding existing environment variables. DB credentials and
PORT have no guessed defaults; API and DB-check modes fail safely until configured.
Existing schema.sql is NOT executed: it drops tables and selects an unassigned
database. No schema or application data changes in this batch.

This batch provides section folding, bounded pool configuration, documented rule
constants from SPEC, transaction cleanup, a clock, safe JSON errors and local
foundation self-tests. It does not implement authentication, jobs, uploads or UI.
No resources are seeded. Resource defaults are form suggestions, never inventory.

## Input and output contract (before implementation)

No form fields, mutable HTTP APIs, query/path parameters, body fields, tokens,
file uploads or external HTTP integrations are introduced. Frontend field rules,
blur/submit checks, numeric precision, related fields, uniqueness, business
authorization and date input rules are N/A until those workflows are implemented.
Do not install body parsing until an endpoint defines its input contract.

### CLI arguments

- Type: array of strings from process.argv.slice(2); no coercion.
- Required: optional; empty array starts API. Null/undefined items are invalid.
- Whitespace: exact matching, no trimming or case folding. ASCII only.
- Length/format/allowed values: zero arguments or exactly one of --selftest,
  --check-db, --check-job-lock. Maximum token length 16 ASCII characters. Duplicate,
  unknown, combined flags and positional values fail before opening a listener or DB.
- Numeric, dates, units, cross-field rules: N/A except mutually exclusive modes.
- Authorization: local operator only; no diagnostic mode is exposed through HTTP.
  --selftest is denied if CONFIG.mode is production. --check-db is read-only.
  --check-job-lock runs schema checks then transient session locks, never table writes.
- Output: unknown input yields nonzero exit and safe error code; self-test uses
  node:test output and nonzero exit on failure; DB check prints only success or
  safe error code. No credentials, query text or stack trace are logged.

### Clock configuration (operator-only, not an HTTP input)

- mode: required exact enum development/production, no whitespace normalization.
- fakeNow: optional null means real time; otherwise exact 24-character ASCII
  YYYY-MM-DDTHH:mm:ss.sssZ string. Valid calendar instant in years 0001-9999;
  full round-trip equality required. No offsets, partial parsing or impossible dates.
- Production always uses real time, ignoring fakeNow. No dev HTTP controls exist.
- Output: fresh Date object each call. Invalid development fakeNow fails startup.
- Related fields: fakeNow effective only in development. Size/bytes both 24 for
  non-null values; numeric ranges, ownership and uniqueness N/A.

### Internal transaction callback

- Required function; wrong type fails before acquiring a connection.
- Receives one leased connection. Commit on success; rollback on callback failure.
  If COMMIT rejects, its outcome is unknown: destroy the connection without trying
  ROLLBACK or returning it to the pool. Successful rollback cannot prove that an
  earlier commit did not persist. Preserve the original error on failure.
- Return callback result unchanged. No automatic retries: callbacks may have effects
  that cannot safely be repeated. Isolation/business locks added per workflow.
- String normalization, date/number limits, HTTP authorization N/A for this function.

### Transaction follow-up (2026-11-01, p01 reconfirmed)

- Fixed withTx connection reuse after an ambiguous COMMIT failure. Begin failures
  and rollback failures also destroy the connection; callback failures with a
  successful rollback still release it normally.
- Added a mock regression where commit persists effects but its acknowledgement
  is lost. The original error propagates, with no rollback, reuse or effect retry.
- npm run check passed; npm test passed 34 tests; git diff --check passed
  with only existing line-ending advisories. These are offline checks only.
- No DB connection, migration, credentials change, deployment or scanner run in
  this follow-up. SETUP-03 and SETUP-06 remain incomplete; live verification and
  required security scans still block deployment.

### Existing static HTTP surface

- Only Express public static files and generic 404/error handling exist.
- Dotfiles are not served. No API consumes body/query/header values for business work.
- Response errors expose only {error:{code,message}}, no private data or raw errors.
- No new user-controlled output is rendered. API validation and request limits must
  be defined when APIs are added; this batch does not claim a complete HTTP contract.

## Acceptance and verification

- Node syntax checks pass for both JS files.
- Actual Node 24 start serves /, /index.js and /style.css on port 31091.
- Unknown URLs return 404 with safe JSON. Unknown CLI modes exit nonzero.
- Offline self-tests cover valid/invalid clock values, production ignoring fake
  time, CLI rejection, transaction success/rollback/acquisition/commit/cleanup errors.
- Read-only DB check verifies DATABASE() against configured DB_NAME on a dedicated
  connection, then inspects job_runs metadata: InnoDB, required column definitions,
  generated id, nullable cleanup fields and a full single-column unique run_key.
  Identity mismatch and incompatible schema fail with safe codes. The connection
  is released on both success and failure; no migration or job effects are run.
- This checks job foundation compatibility, not all tables, migration history,
  persistence, concurrency, triggers, grants or crash recovery.
- No full frontend/input/security/concurrency certification is claimed.

## Current live verification (2026-11-01, p01)

This section supersedes historical missing-configuration results below.

- Local configuration presence/assignment checks now pass; no secret values were
  printed or changed. The live selected database matches db_std09_p01.
- Read-only metadata inspection found 42 tables, all InnoDB. Enhanced
  npm run check:db passed the job foundation checks, including auto_increment id
  and full single-column unique run_key. No application rows were read or written.
- npm run check passed; npm test passed 73 offline tests, 0 failed. The additional
  clock test covers frozen fake time, environment/runtime offsets, reset behavior,
  invalid offsets and production control rejection. Sixteen schema inspection
  scenarios cover valid metadata, wrong identity, absent/incompatible
  schema, missing id generation, nullable key, invalid field types, required
  cleanup field, nonunique/prefix/composite indexes, query and acquisition errors.
  Twenty-two probe scenarios cover success, both acquisition failures, wrong
  database on either session, duplicate session identity, errors at all nine query
  steps (including lost acknowledgements), and invalid lock results at seven steps.
- npm run check:locks passed live with DB_LOCK_VERIFIED: distinct sessions on the
  configured database demonstrated mutual exclusion in both directions and handoff
  after explicit release. IS_FREE_LOCK confirmed the probe was free afterward.
- Development clock HTTP verification passed on temporary port 31092 with an
  ephemeral DEV_TOKEN: GET /api/v1/time returned serverTime, an invalid X-Dev-Token
  returned 401, POST /dev/clock applied a 180-minute offset, and DELETE reset it.
  Frontend displayed the synchronized server clock and no secret was stored or printed.
  The port 31091 occupant was not stopped; production dev routes are not mounted.
- Probe lock names are fresh 64-byte ASCII probe: hashes, separate from job: names.
  All GET_LOCK calls use zero wait; queries have a 10-second client timeout. Both
  probe connections are destroyed in finally, including partial acquisition and
  ambiguous lock outcomes. No persistent rows or schema are changed. This verifies
  advisory-lock behavior, NOT withJobLock deduplication, effects or crash recovery.
- SETUP-06 remains incomplete pending live withJobLock concurrency, durable
  deduplication, effect rollback and crash recovery in an approved test context.
- No .env changes, migration, deployment or scanner run in this continuation.
  Backend recheck and policy-required scans still block deployment.

## Deferred requirements / blockers

- SETUP-02: install dependencies as features need them, always with lifecycle
  scripts disabled as required by room policy. Recheck dependency security before deploy.
- SETUP-03: environment-backed CONFIG, production DB/JWT secret validation,
  immutable foundation RULES, mysql2 pool and withTx are implemented and tested.
  Trust late/loan penalties, vouch stakes and limits, and alibi thresholds are
  centralized in server.js. JWT authentication and workflow-specific services
  are intentionally separate; remaining module rules arrive with their workflows.
  Authentication foundation uses bcrypt cost 12, signed JWT cookies,
  register/login/logout/me routes and a Thai Login/Register browser screen.
  Email verification is removed; registration marks the account usable and returns
  success without creating auth_tokens. Registration issues the same session cookie
  as login. Live smoke returned register 201, session cookie set, and /me 200;
  the temporary account was removed. Password reset remains unverified. Earlier
  smoke checks on temporary port 31093 returned 400 for invalid registration and
  401 for unauthenticated /me, with no test user retained.
- Registration validation now returns field-specific safe codes for username,
  email, display name, password and birth year. The Thai form maps them to
  actionable messages, accepts both Buddhist and Gregorian years, and constrains
  username length/characters and year range in HTML. Browser submission on port
  31091 confirmed the short-username Thai message; no account was created.
- Successful development registration now shows an explicit verification action
  instead of leaving the user at the registration-success message. The button calls
  the existing verify-email API with the development-only verification token and
  moves the screen to Login on success. Production never exposes or auto-uses that token;
- Squad foundation is implemented in server.js and the allowed frontend files:
  authenticated list/create, owner/admin invite creation, hashed-free opaque 32-char
  invite tokens, invite expiration/use limits, approval-aware active/pending join,
  duplicate and revoked invite rejection. Create/join payloads use prepared statements
  and transactions; resources are user input, not hardcoded inventory. Smoke test on
  temporary port 31094 returned 401 for unauthenticated squad list and 200 for the
  static dashboard route, with no live squad data written. Full lifecycle remains
  unverified until verified email accounts and authorized live create/join tests exist.
- SETUP-04: requires a reviewed, non-destructive migration for db_std09_p01,
  submitted through the database UI only. Never run SQL migrations from server.js,
  npm or Git. Download the existing migration and append only; global DB settings
  and privilege changes belong to the administrator.
- SETUP-05: FAKE_NOW and CLOCK_OFFSET_MINUTES are read through process.env for
  development; runtime dev controls require DEV_TOKEN and are mounted only in
  development. /api/v1/time and frontend offset synchronization are implemented.
- SETUP-06: withJobLock is implemented and offline-tested; live job_runs metadata
  and two-session advisory-lock exclusion/handoff checks pass. Full job concurrency,
  durable deduplication, effect rollback and crash-recovery verification still
  require an approved test context; configuration is no longer the blocker.
- SETUP-07: worker/seed/rebuild remain unavailable until their real services exist.
- SETUP-08: uploads remain unavailable until authorization/retention/validation rules
  and authentication are implemented. Do not expose private files prematurely.
- Missing deployment HTTPS/secrets management and required security scan results
  prevent any production-readiness claim.

## Results (historical; not current verification)

Verified locally 2026-11-01:

- node --version: v24.22.1; npm 11.19.1.
- npm install --ignore-scripts: success; npm reported 0 vulnerabilities across 90
  packages. This is an installation audit snapshot, not a security certification.
- node --check server.js and node --check public/index.js: passed.
- npm test: 9 tests passed, 0 failed. Tests use mocked connections; they do not
  prove live transaction isolation, real rollback or concurrency behavior.
- npm run check:db: DB_CONNECTED after SELECT 1 against assigned db_std09.
  No migration or data changes performed.
- New-server HTTP probe: BLOCKED. Port 3109 is occupied by existing PID 12660,
  node server.js; new process reports EADDRINUSE. Existing process was not killed.
  Existing server returns 200 for /, /index.js, /style.css and safe 404 for unknown
  API, /.env and /SPEC.md, but has no Helmet header. These responses therefore do
  NOT verify the new implementation. New security headers remain unverified live.
- Separate node server.js --worker check: safe INVALID_ARGUMENTS, exit 1;
  no listener or worker started. Other unknown/combined inputs covered offline.
- git diff --check: passed (Git reported only LF-to-CRLF advisory warnings).
- VS Code diagnostics: no errors in server.js or package.json.

## Squad and task workspace continuation (2026-11-01)

This batch implemented the core SQUAD-02/03 and task workspace paths. New invitations
create pending membership; joining requires rules consent before active access. Consent
records rules_accepted_at. Owners are consented automatically; squads requiring join approval
keep consented new members pending until an owner/admin approves them. The workspace supports
squad switching, member listing/role updates/soft leave-kick, task CRUD and assignment status,
list/Kanban views, and team health from active overdue work. Proof submission, verification,
attachments, trust settlement, and auto-verification remain separate unfinished workflows.
Font Awesome 6 is loaded from CDN, and the server was restarted on assigned port 31091 after
npm syntax checks passed.

## Verification resumed for p01 (2026-11-01)

This section supersedes earlier results for the current working tree. User
reconfirmed p01. Expected assignment is db_std09_p01, user std09, app port 31091;
these are assignment references, not fallback configuration or DB credentials.

- npm run check: passed syntax checks for server.js and public/index.js.
- npm test: 33 passed, 0 failed (9 foundation tests, 1 job-input test and
  23 job lifecycle scenarios). Expected JOB_FAILED/JOB_OUTCOME_UNKNOWN logs
  come from injected failures; they are not live job failures.
- Coverage includes busy/duplicate skips, failed/interrupted retry, conflicting
  job identity, invalid state/result, claim and effect commit ambiguity, rollback
  and failure-record errors, and named-lock/connection cleanup failures.
- Local .env exists and is ignored; node_modules is ignored; .env is untracked.
  Configuration presence/equality checks printed booleans only, not secret values.
  Host/password are absent and database/user/app port do not match the assignment.
  No values were guessed, copied from legacy, or written to .env.
- npm run check:db: blocked with DB_CONFIG_REQUIRED and exit 1 before connecting.
  No live database query, migration, schema change, or job execution was performed.
- git diff --check: passed; only an LF-to-CRLF advisory for TASK.md.
- SETUP-06 remains unchecked. Before completion, supply verified p01 connection
  settings locally, inspect job_runs schema read-only, and verify real two-session
  lock exclusion, durable deduplication, effect rollback and crash recovery in an
  approved test context. All migration SQL must go through the database UI.
- No deployment or Public request was made. Before deployment, recheck the backend
  and run required Semgrep, OSV and Gitleaks scans under policy revision 2.

## Confirmed project switch: p01 (historical, 2026-11-01)

User confirmed switching projects, not bypassing the legacy port conflict.
At that time server.js used database db_std09_p01 and literal port 31091,
bound to 0.0.0.0. Current configuration instead reads process.env as required.
No legacy process was stopped and no database was migrated.

Verification recorded after that switch (not rerun in the current batch):
- node --check server.js and node --check public/index.js: passed.
- npm test: 9 passed, 0 failed.
- npm run check:db: DB_CONNECTED against db_std09_p01 (read-only SELECT 1).
- New Node server on 31091: /, /index.js, /style.css returned 200;
  /api/v1/not-implemented returned safe JSON 404. All four responses included
  X-Content-Type-Options: nosniff. The temporary test process was stopped afterward.
- Historical legacy results do not establish p01 schema readiness.

SETUP-01 alone is marked complete; all partially implemented tasks stay unchecked.
Do not upload node_modules or package-lock.json. They are local npm artifacts.

## Job execution contract (SETUP-06)

- Internal operator-only utility, not an HTTP endpoint. name is 1-50 ASCII
  letters/digits/underscore/hyphen starting with a letter. runKey is 1-120 ASCII
  letters/digits/colon/underscore/hyphen/dot and must start with name + colon.
  No coercion, trimming, dates parsed from keys, or user-controlled job names.
- fn must be a function; validation precedes connection acquisition. Database
  scope is required; the lock name hashes database + job name to fit 64 bytes.
- GET_LOCK uses zero wait on one dedicated connection. Busy jobs skip. NULL or
  unexpected results are errors, never treated as a harmless busy result.
- Claim/reclaim job_runs under a row transaction and commit the running marker.
  Completed keys skip; failed or interrupted running keys retry only after the
  same named lock has been acquired. Scope/prefix prevents cross-job key reuse.
- Execute callback SQL effects and success status in one transaction on that
  same connection. Callback must not commit, rollback, use other connections,
  issue DDL, release locks, or perform external side effects. Tables must be
  transactional InnoDB. affected defaults to zero; otherwise integer 0..2147483647.
- On callback failure roll back effects, then record a fixed safe failure code
  without copying error text. Original error is preserved. A crash after claim
  leaves a running row that can be reclaimed; no committed effects precede success.
- Commit acknowledgement failures have an unknown outcome: destroy the connection,
  leave the marker unchanged and throw. Never overwrite possible committed success.
  A retry checks persisted status before executing work.
- Release named locks only when acquired. Destroy connections with uncertain
  lock/transaction state; cleanup errors do not mask the original error.
- Offline mocks verify control flow only. Real DB concurrency, schema readiness,
  rollback and crash recovery remain prerequisites to marking SETUP-06 complete.
