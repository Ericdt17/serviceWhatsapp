# LIV-14 — Improve client group creation (`#link`) message

Plan for [LIV-14](https://linear.app/livsight-sarl/issue/LIV-14/whatsapp-bot-improve-client-group-creation-message):
improve the WhatsApp bot’s `#link` reply so it still returns **group name** and **group ID**,
and adds a professional French welcome that encourages clients to download the LivSight app
(Android + iPhone links from env) and request login credentials in the group.

**Branch:** `edjou/liv-14-whatsapp-bot-improve-client-group-creation`  
**Base for PRs:** `main`  
**Scope:** `#link` reply copy + configurable store URL env vars only — trigger and command
behavior stay as today  
**Last updated:** 2026-11-11  
**Current phase:** 2 Done · next: Phase 3 (human must explicitly start)

---

## Agent rules (all agents — Cursor, Claude Code, other)

These rules apply to **every** agent working this plan (including Claude Code on Linear).

1. **Propose first → human OK** before any edit to this MD, the Linear issue (text or checkboxes),
   or application code.
2. **Open questions anytime** — pause while unanswered; do not proceed past unresolved questions.
3. **Ask before reading the codebase** when audit/design/impl needs it.
4. **Phases follow Linear checkboxes** — use the [Linear checkbox map](#linear-checkbox-map);
   do not invent out-of-scope work without asking. Propose dropping/editing unnecessary
   checkboxes; apply only after human OK; keep the map in sync.
5. **Linear may be updated by Claude Code too** — re-fetch the issue before flipping boxes;
   only complete still-open items for the finished phase; do not fight other agents’ updates.
6. Honor the [Hard gate](#hard-gate--linear--github-rules-claude-code--any-agent) and
   [Agent handoff protocol](#agent-handoff-protocol-every-phase) below.

---

## Hard gate — Linear ↔ GitHub rules (Claude Code / any agent)

**Do not start coding, continue a phase, or create any commit on this issue unless the same
Linear linking rules as Cursor’s user rule “Linear ↔ GitHub” are configured and will be
applied.** Commits are how the branch links to Linear — missing those rules means work must
not begin, not only that PRs are blocked.

Required rules (must all be true):

| Rule | Requirement |
|---|---|
| Issue signal | Work is explicitly for **LIV-14** (branch, user, or Linear URL) |
| Branch name | Use Linear’s git branch name: `edjou/liv-14-whatsapp-bot-improve-client-group-creation` (contains `liv-14`) |
| **Commits (mandatory while coding)** | Conventional Commits, English, imperative; every commit on this work **must** link LIV-14 via subject `[LIV-14]` and/or body/trailer `Refs LIV-14` (use `Fixes LIV-14` only when the human says the issue is finished) |
| PR title | Conventional Commit + `[LIV-14]` (when a PR is requested) |
| PR body | Near the top: `Fixes LIV-14` (finishes) or `Refs LIV-14` (partial / related) |
| No invented links | Do not invent other Linear IDs |

If these rules are **not** configured in the agent/session (Claude Code project rules, CLAUDE.md,
Cursor rules, or equivalent), the agent must:

1. **Stop immediately** — do not write or edit application code
2. Tell the human that Linear ↔ GitHub linking is missing or incomplete
3. Refuse to code, commit, update this plan’s phase status as Done, or open a PR until the rules match

Paste or confirm this block is present **before starting to code** (Phase 1+):

```text
Linear ↔ GitHub (required before coding): branch includes liv-14; every commit links LIV-14
(Refs/Fixes); PR title has [LIV-14]; PR body has Fixes/Refs LIV-14; do not invent Linear IDs.
```

---

## Agent handoff protocol (every phase)

**Before writing any code for a phase:** re-check the [Hard gate](#hard-gate--linear--github-rules-claude-code--any-agent) and [Agent rules](#agent-rules-all-agents--cursor-claude-code-other). If Linear commit-linking rules are not configured, stop — do not code. Ask before codebase reads; propose code edits and wait for human OK.

When an agent (Cursor, Claude Code, or other) **finishes a phase**:

1. **Propose** MD updates (phase **Done**, **Current phase**, **Exit notes**); wait for human OK,
   then apply.
2. Run the phase’s verification (Jest scoped as listed, or full `npm test` if unspecified).
3. **Re-fetch** LIV-14 from Linear. **Propose** which still-open checkboxes this phase completed
   per [Linear checkbox map](#linear-checkbox-map); wait for human OK; then flip only those
   `- [ ]` → `- [x]` (preserve all other description text; do not invent boxes). Multi-phase
   items only when this phase is the last required one. If Linear update fails, record that in
   Exit notes and continue.
4. **Commit** all approved phase work **including this markdown update**, using Conventional
   Commits English, scope `bot` when appropriate, and **always** link LIV-14 in the commit
   (see Hard gate — commits are mandatory for Linear, not optional).
5. Do **not** start the next phase in the same commit unless the human explicitly asks.
6. Do **not** open a PR unless the human explicitly asks (then base `main`, title/body per
   Linear rules). Same Linear rules already applied to every commit while coding; the PR only
   adds title/body linking.

Suggested commit shape when closing a phase:

```text
feat(bot): <phase summary> [LIV-14]

Refs LIV-14
```

Use `docs:` if the phase only updated planning/docs. Use `test:` if tests-only. Never omit the
LIV-14 link on commits for this branch.

**Code permission:** Do not write or change production code unless (a) Linear ↔ GitHub rules
are configured for commits as above, and (b) the human explicitly allows implementation for
the current phase after a proposed plan of edits. Docs-only phases still require human OK
before editing this file, and LIV-14-linked commits when committing.

**TDD:** For behavior changes, failing Jest tests first → minimal implementation → refactor
(see repo `.cursor/rules/tdd.mdc` and `CLAUDE.md`). Prefer unit tests under
`wwebjs-bot/src/__tests__/unit/` with mocks (no live WhatsApp).

---

## Decisions (human-validated 2026-11-11)

| Topic | Decision |
|---|---|
| Command | Existing `#link` — command stays as it is |
| Trigger | Same as today (on `#link`) |
| Language | French only (issue proposed copy) |
| Store URLs | Env vars `LIVSIGHT_ANDROID_STORE_URL` / `LIVSIGHT_IOS_STORE_URL` with official links |
| Empty store URL | Omit that platform line; omit whole download section if both empty |
| Dashboard tip | Keep short “paste ID into client profile” line under Identifiant |
| Base branch | `main` |
| Out of scope | Changing who can run `#link`, Core linking API, dashboard UX |

Official store URLs (2026-11-11):

- Android: `https://play.google.com/store/apps/details?id=com.livsight.client`
- iOS: `https://apps.apple.com/fr/app/livsight/id6788786430`

### Target reply shape (from Linear; placeholders for stores)

```text
Bienvenue chez LivSight !

Votre groupe WhatsApp a été configuré avec succès.

*Nom du groupe :* [Group Name]
*Identifiant :* [Group ID]

Pour profiter pleinement de nos services, téléchargez l'application LivSight afin de suivre vos livraisons et consulter vos rapports.

*Télécharger l'application :*
Android : [Google Play Store link]
iPhone : [Apple App Store link]

Une fois l'application installée, contactez notre équipe dans ce groupe pour récupérer vos identifiants de connexion.

Merci de votre confiance !
*L'équipe LivSight*
```

WhatsApp formatting note: prefer `*bold*` (WhatsApp markdown) over Markdown `**bold**` where the reply is sent as plain text.

Suggested env names (confirm in Phase 1/2 if `.envexample` already uses different keys):

- `LIVSIGHT_ANDROID_STORE_URL`
- `LIVSIGHT_IOS_STORE_URL`

---

## User stories

| ID | Role | Want | So that | Phase |
|---|---|---|---|---|
| US-1 | Ops / staff | `#link` still returns correct group name + ID | Dashboard linking keeps working | 2–3 |
| US-2 | New client in group | Receive a clear French welcome after `#link` | They know the group is configured | 2–3 |
| US-3 | New client | See Android + iPhone download links | They can install LivSight | 2–3 |
| US-4 | New client | Know to ask in-group for login credentials after install | Onboarding completes without confusion | 2–3 |
| US-5 | Developer | Store URLs come from env | Links can change without code edits | 2 |
| US-6 | Developer / QA | Unit + smoke coverage for the new reply | Regressions don’t drop ID/name or formatting | 3–4 |

Story → Linear map: US-1 → preserve ID/name + AC; US-2 → welcome task; US-3 → store links; US-4 → credentials; US-5 → configurable links; US-6 → format + test tasks / ACs.

---

## Phase status

| Phase | Name | Status | Owner / agent | Completed |
|---|---|---|---|---|
| 0 | Preconditions & Linear gate | Done (branch + plan) | Cursor | 2026-11-11 |
| 1 | Locate `#link` reply + document current message | Done | Cursor | 2026-11-11 |
| 2 | Message builder + store URL env (TDD) | Done | Cursor | 2026-11-11 |
| 3 | Wire `#link` to new reply + unit tests | Not started | — | — |
| 4 | Local / smoke verification of `#link` | Not started | — | — |

Statuses: `Not started` · `In progress` · `Blocked` · `Done`

---

## Linear checkbox map

Source: LIV-14 description tasks. Phase **Done** means the mapped open boxes may be proposed for
`- [x]` only after human OK (multi-phase: check only on the **last** required phase).

| Linear checkbox | Satisfied when | Phase(s) |
|---|---|---|
| Update the existing WhatsApp group creation command response | `#link` sends the new welcome reply | **3** (last) · design in 2 |
| Preserve the group ID and group name in the response | Reply still includes both values correctly | **3** (last) · builder in 2 |
| Add a professional welcome and onboarding message | French welcome + onboarding copy present | **2** (copy) · **3** (wired) — check on **3** |
| Include configurable Google Play and Apple App Store links | Env-driven Android + iOS URLs in reply | **2** (last for config) · verified wired in **3** — check on **3** |
| Explain how clients can request their login credentials after installation | Credentials sentence present | **2** · **3** — check on **3** |
| Ensure the message is properly formatted for WhatsApp | Bold/line breaks render as intended | **2** · **3** — check on **3** |
| Test the response when creating a new client group | Unit tests green + local `#link` smoke | **3** (unit) · **4** (manual) — check on **4** |

### Acceptance criteria coverage

| AC | Phase |
|---|---|
| Command still returns correct group ID and group name | 2–3 |
| Message includes both app download links | 2–3 |
| Clients receive clear instructions for obtaining credentials | 2–3 |
| Response is sent automatically after successful group creation / `#link` | 3 (same trigger as today) |
| Existing group creation functionality remains unaffected | 3–4 |

---

## Context snapshot (Phase 1 — 2026-11-11)

| Piece | Role today | LIV-14 relevance |
|---|---|---|
| `handlers/messageHandler.js` `onMessage` | Detects `#link` / `link` (normalized); group-only | **Keep trigger**; change reply text only |
| DM `#link` | `msg.reply` — use the client *groupe*, not DM | Unchanged |
| `sendLinkMessage(client, whatsappGroupId, groupName)` | Builds reply + 3-method send fallback | Swap `text` only; keep send chain |
| Group ID | `resolveWhatsappGroupId(msg, chat, chatId)` | Must remain in reply |
| Group name | `groupName` already passed into `sendLinkMessage` | Must remain in reply |
| Store URL envs | **None** in `.envexample` | Add `LIVSIGHT_ANDROID_STORE_URL` / `LIVSIGHT_IOS_STORE_URL` in Phase 2 |
| Tests | `src/__tests__/unit/messageHandler.test.js` | Asserts `sendMessage` contains group id; DM path asserts *groupe* |

### Current `#link` reply (verbatim builder)

```text
📋 ID du groupe WhatsApp:

`{whatsappGroupId}`

💡 Copiez cet ID et collez-le dans le profil client (dashboard LivSight).

📝 Nom du groupe: {groupName}
```

No welcome, app store links, or credentials instructions today. Ops tip about pasting the ID into the dashboard is present; Phase 2–3 may fold ID/name into the Linear welcome copy (dashboard tip optional — propose in Phase 2 if we drop it).

### Phase 2–3 implementation note

Prefer a pure helper (e.g. `src/lib/linkWelcomeMessage.js`) consumed by `sendLinkMessage`, so unit tests cover copy without Puppeteer. Do not change who may run `#link` or the send fallback methods.

---

## Phase 0 — Preconditions & Linear gate

**Status:** Done (branch from `origin/main` + this plan file).

### Scope

- Branch `edjou/liv-14-whatsapp-bot-improve-client-group-creation` exists from `main`.
- This plan file exists with Agent rules, Hard gate, handoff, decisions, checkbox map.
- Linear ↔ GitHub linking confirmed for the session before Phase 1+ coding.

### Out of scope

- Application code.

### Verification

- `git branch --show-current` = Linear branch name; PR base is `main`.
- Human can review this plan before Phase 1.

### Commit

```text
docs(bot): add LIV-14 client group link welcome plan [LIV-14]

Refs LIV-14
```

### Exit notes

- Branch created from `origin/main` at `35bb669` (Merge PR #10 LIV-37).
- No application code yet. Do not start Phase 1 until human explicitly says so.

---

## Phase 1 — Locate `#link` reply + document current message

**Status:** Done (2026-11-11, Cursor)  
**Goal:** With human OK to read the codebase, find where `#link` builds its reply, document
current text and any env already used, and note exact files for Phase 2–3.

### Scope

- Ask before reads; then locate `#link` handling (likely message handler / staff commands).
- Record current reply shape, how group name/ID are obtained, and `.envexample` gaps.
- Update this plan’s Context snapshot (add section when done).

### Out of scope

- Changing reply behavior.

### Verification

- Human review of Context snapshot (files + current message).
- No production behavior change.

### Commit

```text
docs(bot): document #link reply path for LIV-14 [LIV-14]

Refs LIV-14
```

### Exit notes

- `#link` / `link` handled in `messageHandler.js`; reply built in `sendLinkMessage`.
- Current message is ID + dashboard paste tip + group name only.
- No store URL env vars yet; no welcome/credentials copy.
- Existing unit coverage: group id in `sendMessage`; DM `#link` hint.
- **No Linear checkboxes** flipped (none map to Phase 1).
- No application code changed. Do not start Phase 2 until human explicitly says so.

---

## Phase 2 — Message builder + store URL env (TDD)

**Status:** Done (2026-11-11, Cursor)  
**Goal:** Extract or add a pure helper that builds the French welcome from group name, group ID,
and env store URLs; document env in `.envexample`.

### Scope

- Failing unit tests first for: name+ID present, both store links from env, credentials line,
  WhatsApp-friendly bold/newlines, sensible behavior if a store URL env is missing (propose
  fallback to human before coding).
- Minimal implementation of the builder + `.envexample` (+ optional `.env` local placeholders
  — do not commit secrets).

### Out of scope

- Wiring into the live `#link` handler (Phase 3).

### Verification

- `./node_modules/.bin/jest src/__tests__/unit/linkWelcomeMessage.test.js` — 10 passed.

### Commit

```text
feat(bot): add #link welcome message builder [LIV-14]

Refs LIV-14
```

### Exit notes

- Added `src/lib/linkWelcomeMessage.js` (`buildLinkWelcomeMessage`, `resolveStoreUrlsFromEnv`).
- Unit tests: `src/__tests__/unit/linkWelcomeMessage.test.js` (10 passed).
- Documented + defaulted store URLs in `.envexample`; local `.env` updated (not committed).
- Empty URL → omit platform line; both empty → omit download section; dashboard tip kept.
- **No Linear checkboxes** flipped (multi-phase items check on Phase 3).
- `#link` not wired yet. Do not start Phase 3 until human explicitly says so.

---

## Phase 3 — Wire `#link` to new reply + unit tests

**Status:** Not started  
**Goal:** `#link` uses the new builder; trigger and permissions unchanged; unit tests cover
handler reply content with mocks.

### Scope

- Failing handler/unit tests first, then wire `#link` to call the builder.
- Preserve automatic reply after successful `#link` (same path as today).
- Do not change Core linking / group resolution beyond the reply text.

### Out of scope

- Live WhatsApp smoke (Phase 4).

### Verification

- Scoped Jest for `#link` / welcome message tests.
- Confirm no change to who may invoke `#link` or when it runs.

### Commit

```text
feat(bot): use welcome message on #link reply [LIV-14]

Refs LIV-14
```

### Exit notes

_(fill on Done)_

---

## Phase 4 — Local / smoke verification of `#link`

**Status:** Not started  
**Goal:** Confirm on a real or local WhatsApp session that `#link` returns the new formatted
message with correct name, ID, both store links, and credential instructions.

### Scope

- Manual `#link` in a test/client group (or documented dry-run if session unavailable).
- Record result in Exit notes; fix formatting issues if found (with tests).

### Out of scope

- Publishing official store URLs (placeholders remain OK).

### Verification

- Human confirms message looks correct in WhatsApp.
- Relevant unit tests still green.

### Commit

```text
docs(bot): record LIV-14 #link welcome smoke notes [LIV-14]

Refs LIV-14
```

(or `fix(bot): …` if formatting fix required)

### Exit notes

_(fill on Done)_

---

## Open questions

None — empty-URL omit + dashboard tip + official store URLs validated 2026-11-11.

---

## Out of scope (whole issue)

- Changing `#link` trigger, authorization, or Core `getClientByWhatsappGroup` linking.
- Dashboard / app store publishing.
- Non-French copy.
- Unrelated delivery / parser work (e.g. LIV-37).
