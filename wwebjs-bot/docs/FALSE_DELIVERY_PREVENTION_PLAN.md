# LIV-37 — Prevent false delivery creation (WhatsApp bot)

Plan for [LIV-37](https://linear.app/livsight-sarl/issue/LIV-37/whatsapp-bot-prevent-false-delivery-creation):
stop the WhatsApp bot from creating Core deliveries when a message merely contains a number
(e.g. phone shared in chat), while preserving legitimate order recognition. Ambiguous /
low-confidence cases are ignored or confirmed; messages without a real product are not
deliveries.

**Branch:** `edjou/liv-37-whatsapp-bot-prevent-false-delivery-creation`  
**Base for PRs:** `main`  
**Scope:** Core mode only (`USE_CORE_API=true`) — legacy DB path out of scope  
**Last updated:** 2026-11-11  
**Current phase:** 2 — Intent + product gates (Done — awaiting human OK / commit)

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
| Issue signal | Work is explicitly for **LIV-37** (branch, user, or Linear URL) |
| Branch name | Use Linear’s git branch name: `edjou/liv-37-whatsapp-bot-prevent-false-delivery-creation` (contains `liv-37`) |
| **Commits (mandatory while coding)** | Conventional Commits, English, imperative; every commit on this work **must** link LIV-37 via subject `[LIV-37]` and/or body/trailer `Refs LIV-37` (use `Fixes LIV-37` only when the human says the issue is finished) |
| PR title | Conventional Commit + `[LIV-37]` (when a PR is requested) |
| PR body | Near the top: `Fixes LIV-37` (finishes) or `Refs LIV-37` (partial / related) |
| No invented links | Do not invent other Linear IDs |

If these rules are **not** configured in the agent/session (Claude Code project rules, CLAUDE.md,
Cursor rules, or equivalent), the agent must:

1. **Stop immediately** — do not write or edit application code
2. Tell the human that Linear ↔ GitHub linking is missing or incomplete
3. Refuse to code, commit, update this plan’s phase status as Done, or open a PR until the rules match

Paste or confirm this block is present **before starting to code** (Phase 1+):

```text
Linear ↔ GitHub (required before coding): branch includes liv-37; every commit links LIV-37
(Refs/Fixes); PR title has [LIV-37]; PR body has Fixes/Refs LIV-37; do not invent Linear IDs.
```

---

## Agent handoff protocol (every phase)

**Before writing any code for a phase:** re-check the [Hard gate](#hard-gate--linear--github-rules-claude-code--any-agent) and [Agent rules](#agent-rules-all-agents--cursor-claude-code-other). If Linear commit-linking rules are not configured, stop — do not code. Ask before codebase reads; propose code edits and wait for human OK.

When an agent (Cursor, Claude Code, or other) **finishes a phase**:

1. **Propose** MD updates (phase **Done**, **Current phase**, **Exit notes**); wait for human OK,
   then apply.
2. Run the phase’s verification (Jest scoped as listed, or full `npm test` if unspecified).
3. **Re-fetch** LIV-37 from Linear. **Propose** which still-open checkboxes this phase completed
   per [Linear checkbox map](#linear-checkbox-map); wait for human OK; then flip only those
   `- [ ]` → `- [x]` (preserve all other description text; do not invent boxes). Multi-phase
   items only when this phase is the last required one. If Linear update fails, record that in
   Exit notes and continue.
4. **Commit** all approved phase work **including this markdown update**, using Conventional
   Commits English, scope `bot` / `parser` / `delivery` when appropriate, and **always** link
   LIV-37 in the commit (see Hard gate — commits are mandatory for Linear, not optional).
5. Do **not** start the next phase in the same commit unless the human explicitly asks.
6. Do **not** open a PR unless the human explicitly asks (then base `main`, title/body per
   Linear rules). Same Linear rules already applied to every commit while coding; the PR only
   adds title/body linking.

Suggested commit shape when closing a phase:

```text
feat(bot): <phase summary> [LIV-37]

Refs LIV-37
```

Use `docs:` if the phase only updated planning/docs. Use `test:` if tests-only. Never omit the
LIV-37 link on commits for this branch.

**Code permission:** Do not write or change production code unless (a) Linear ↔ GitHub rules
are configured for commits as above, and (b) the human explicitly allows implementation for
the current phase after a proposed plan of edits. Docs-only phases still require human OK
before editing this file, and LIV-37-linked commits when committing.

**TDD:** For behavior changes, failing Jest tests first → minimal implementation → refactor
(see repo `.cursor/rules/tdd.mdc` and `CLAUDE.md`). Prefer unit tests under
`wwebjs-bot/src/__tests__/unit/` with mocks (no live WhatsApp).

---

## Decisions (human-validated 2026-11-11)

| Topic | Decision |
|---|---|
| Mode | Core only |
| Casual / number-in-chat | **Ignore silently** (people often just share a number to communicate) |
| Ambiguous / low-confidence | Do **not** auto-create; use **pre-create confirmation** when the message looks like a weak/AI order |
| Strict valid order + real product | Create **immediately** (no confirm) |
| Product gate | No real product → **not** a delivery (reject empty / `"Non spécifié"` / placeholder); catalog stock match **not** required (pickup free-text OK) |
| Gates to tighten | Strict parser **and** AI fallback (`looksLikeMalformed` + `validateAndNormalizeAiDelivery`) |
| Post-create `SEND_CONFIRMATIONS` | Leave as-is; do **not** overload it for pre-create confirm |
| Confirm timeout | ~10–15 minutes, then drop pending |
| Base branch | `main` |

---

## Phase status

| Phase | Name | Status | Owner / agent | Completed |
|---|---|---|---|---|
| 0 | Preconditions & Linear gate | Done (branch + plan) | Cursor | 2026-11-11 |
| 1 | Reproduce & document create path / confirmation gap | Done | Cursor | 2026-11-11 |
| 2 | Intent + product gates (strict + malformed + AI) | Done | Cursor | 2026-11-11 |
| 3 | Ambiguous-only pre-create confirmation | Not started | — | — |
| 4 | Wire handler + regression unit tests | Not started | — | — |
| 5 | Staging verification with realistic messages | Not started | — | — |

Statuses: `Not started` · `In progress` · `Blocked` · `Done`

---

## Context snapshot (Phase 1 — local WhatsApp repro 2026-11-11)

| Piece | Role today | LIV-37 relevance |
|---|---|---|
| `deliveryHandler.handleDelivery` | Strict success → immediate `saveDelivery`; fail → malformed → AI → **immediate create** | **No pre-create confirm** |
| `parseDeliveryMessage` | Needs structured 4 lines incl. product (≥2 chars) | Phone-only / chitchat fails strict (good) |
| `looksLikeMalformedDelivery*` | ≥2 of phone / amount / location (or labeled fields) opens AI | Phone+`15k` or phone+`Makepe` chitchat → AI |
| `validateAndNormalizeAiDelivery` | Phone + amount only; missing product → `"Non spécifié"` | Accepts placeholder product + amount `0` |
| `resolvePackageMatch` / Core create | Catalog optional; miss → pickup `"Non spécifié"` | Still POSTs `/api/transactions` |
| `SEND_CONFIRMATIONS` | **Post-create** group notice only (default off) | **Not** a confirmation step |
| Quoted replies (core) | `hasQuotedMsg` + non-strict body → skip create | Confirm/`Oui` ignored today; `_data.quotedMsg` works when `getQuotedMessage` fails (`r`) |

### Local repro results (linked group, `USE_CORE_API=true`, AI on)

| Message | Gate | Outcome | Core ref |
|---|---|---|---|
| `699123456` / `2 robes` / `15000` / `Makepe` | `CREATE_STRICT` | Legitimate create | **352** |
| `Je viens d'appeler le 699123456` + `15k` | `CREATE_AI` · `placeholderProduct: true` | **False positive** | **353** |
| `Je viens d'appeler le 699123456` + `Makepe` | `CREATE_AI` · amount `0` · placeholder | **False positive** | **354** |
| Reply `Oui` to strict order | `replyLooksLikeConfirm: true` · quoted via `_data.quotedMsg` | `IGNORE` (no confirm flow yet) | — |

### Confirmation gap (documented before Phase 3)

- Create is **immediate** after strict success or AI normalize success.
- There is **no** approve/confirm step before `createTransaction`.
- `SEND_CONFIRMATIONS` only notifies **after** create.
- Reply detection in core: skip create for non-strict replies; can read quoted order body via `msg._data.quotedMsg` (needed for future confirm).

Unit fixtures locking this current behavior:
`src/__tests__/unit/liv37FalseDeliveryFixtures.test.js` (Phase 2 will flip false-positive expectations).

---

## Phase 0 — Preconditions & Linear gate

**Status:** Done (branch from `origin/main` + this plan file).

### Scope

- Branch `edjou/liv-37-whatsapp-bot-prevent-false-delivery-creation` exists from `main`.
- This plan file exists with Agent rules, Hard gate, handoff, decisions, checkbox map.
- Linear ↔ GitHub linking confirmed for the session before Phase 1+ coding.

### Out of scope

- Application code.

### Verification

- `git branch --show-current` = Linear branch name; base is `main`.
- Human can review this plan before Phase 1.

### Commit

```text
docs(bot): add LIV-37 false delivery prevention plan [LIV-37]

Refs LIV-37
```

### Exit notes

- Branch created from `origin/main` at `a05615b` (Merge PR #9 feat/internal-send-text).
- Working tree may show unrelated `.DS_Store` — do not commit it.
- No application code yet. Do not start Phase 1 until human explicitly says so.

---

## Phase 1 — Reproduce & document create path / confirmation gap

**Status:** Done (2026-11-11, Cursor)  
**Goal:** Reproduce false positives and document parse → AI → validation → create, including that no pre-create confirmation exists.

### Scope

- Add or extend failing/documentary unit fixtures for: casual phone chat, phone+price no product, valid 4-line, labeled French, near-miss variants that open AI.
- Trace and write findings into this plan’s Context snapshot (confirm / refine).
- Explicitly document: create is immediate today; `SEND_CONFIRMATIONS` is post-create only.

### Out of scope

- Changing create behavior (Phase 2+).

### Verification

- Human review of updated Context snapshot.
- `npx jest src/__tests__/unit/liv37FalseDeliveryFixtures.test.js`

### Commit

```text
docs(bot): document false delivery create path for LIV-37 [LIV-37]

Refs LIV-37
```

(fixtures land in the same commit as docs, or `test:` if split)

### Exit notes

- Reproduced on local `npm run dev` against linked group + Core API.
- False creates **353** (phone+15k → AI `"Non spécifié"`) and **354** (phone+Makepe → AI amount 0 + placeholder).
- Legitimate strict create **352** still works.
- Confirmed: no pre-create confirmation; `SEND_CONFIRMATIONS` is post-create only.
- Reply `Oui` to an order: detected via `_data.quotedMsg`, confirm heuristic true, still IGNORE for create.
- Temporary `[LIV-37-repro]` logs remain in `deliveryHandler.js` for Phase 2/3 work — remove before merge unless human wants to keep.
- Did **not** change create behavior in this phase.

---

## Phase 2 — Intent + product gates (strict + malformed + AI)

**Status:** Done (2026-11-11, Cursor)  
**Goal:** Require meaningful delivery-order evidence; number alone is never enough; no product ⇒ not a delivery; ambiguous casual chat ignored.

### Scope (TDD)

- **Strict path:** reject missing / placeholder / digits-only “product”; keep valid structured orders.
- **`looksLikeMalformed*`:** do not treat phone-in-chitchat (or similar) as delivery intent; require stronger evidence before AI/reminder.
- **AI `validateAndNormalizeAiDelivery`:** require non-placeholder product; stop accepting `"Nonspécifié"` as success; do not invent product for casual number messages.
- Ambiguous after gates → **ignore** (no create, no format reminder for those cases — reminder only if still clearly malformed-order shaped per tightened gate).
- Unit tests for casual conversations, phones, prices, mixed content, valid formatted orders.

### Out of scope

- Confirmation UX (Phase 3).
- Staging WhatsApp (Phase 5).

### Verification

```bash
cd wwebjs-bot
npx jest src/__tests__/unit/parser.test.js
npx jest src/__tests__/unit/aiDeliveryExtract.test.js
# plus any new gate test files
```

### Commit

```text
fix(parser): require product and order intent before delivery extract [LIV-37]

Refs LIV-37
```

### Exit notes

- Added `isPlaceholderProduct` in `productNormalize.js`; used by strict parser + AI validator.
- `looksLikeMalformed*` now requires a **product signal**; phone+amount / phone+quartier / chitchat alone → ignore (no AI, no format reminder).
- AI no longer accepts `"Non spécifié"` / empty / digits-only products; prompt updated to return empty product instead.
- Strict 4-line with placeholder product → invalid.
- Fixtures flipped in `liv37FalseDeliveryFixtures.test.js`; parser tests updated for LIV-37.
- Verification: 83 passed across liv37 / parser / aiDeliveryExtract / deliveryHandler.
- Confirm UX still Phase 3; `[LIV-37-repro]` logs still present.

---

## Phase 3 — Ambiguous-only pre-create confirmation

**Status:** Not started  
**Goal:** When a message still looks like a weak/AI-assisted order (not strict-valid), ask for confirm before `createTransaction`; timeout drops pending.

### Scope (TDD)

- Pending-confirm store (in-memory + file-backed if needed for PM2 restart — propose design, human OK).
- Bot replies with short summary (`📱 / 📦 / 💰 / 📍`) + ask to reply `oui` (or reply-to confirm message).
- On affirmative within ~10–15 min → `saveDelivery` / `createTransaction`.
- On timeout / non-affirmative → ignore (no create).
- Strict valid + real product → still immediate create (no confirm).
- Do not reuse `SEND_CONFIRMATIONS` for this path.

### Out of scope

- Always-confirm for strict orders.
- Catalog stock match as a hard gate.

### Verification

```bash
cd wwebjs-bot
npx jest src/__tests__/unit/deliveryConfirm*.test.js
npx jest src/__tests__/unit/deliveryHandler.test.js
```

### Commit

```text
feat(bot): confirm ambiguous AI orders before Core create [LIV-37]

Refs LIV-37
```

### Exit notes

_(fill on Done)_

---

## Phase 4 — Wire handler + regression unit tests

**Status:** Not started  
**Goal:** End-to-end unit coverage of handler paths: ignore / confirm / immediate create; no regressions.

### Scope

- Wire Phases 2–3 into `deliveryHandler` / message flow cleanly.
- Regression tests: false positives, valid orders, ambiguous confirm + timeout, product missing.
- Preserve idempotency / circuit breaker / status-update skips.

### Out of scope

- Live staging (Phase 5).

### Verification

```bash
cd wwebjs-bot
npm test
```

### Commit

```text
test(bot): cover false delivery prevention paths [LIV-37]

Refs LIV-37
```

(or `feat(bot):` if wiring is the main delta)

### Exit notes

_(fill on Done)_

---

## Phase 5 — Staging verification

**Status:** Not started  
**Goal:** Verify behavior on WhatsApp Bot staging with realistic messages.

### Scope

- Manual checklist in linked staging group (core):
  - Casual number share → no delivery
  - Phone + chitchat → no delivery
  - Valid 4-line with product → creates (immediate)
  - Ambiguous AI-shaped order → confirm prompt; `oui` creates; ignore/timeout does not
- Note env flags needed (`AI_DELIVERY_FALLBACK_ENABLED`, confirm timeout, etc.) in Exit notes / ops note if useful.

### Out of scope

- Production rollout (unless human expands).

### Verification

- Human sign-off on staging checklist results recorded in Exit notes.

### Commit

```text
docs(bot): record LIV-37 staging verification [LIV-37]

Refs LIV-37
```

### Exit notes

_(fill on Done)_

---

## Linear checkbox map

Map LIV-37 description checkboxes to phases. Phases follow these boxes. On phase Done:
re-fetch Linear → propose flips → human OK → update Linear (not only this file). Propose map
or checkbox edits anytime if items look unnecessary; apply only after human OK.

### Tasks (from LIV-37)

| Linear checkbox (summary) | Phase(s) | Check on Linear when |
|---|---|---|
| Reproduce false-positive creation and trace parse / AI / validation / create | 1 | Phase 1 Done |
| Identify why phone/amounts/numerals trigger without order intent | 1 | Phase 1 Done |
| Require meaningful evidence of a delivery order; not number alone | 2 | Phase 2 Done |
| Ambiguous/low-confidence do not auto-create; preserve legitimate flow | 2–3 | Phase 3 Done (last) |
| Check whether confirmation exists; document before modifying | 1 (document) + 3 (add ambiguous confirm) | Phase 3 Done |
| Add regression tests (casual, phones, prices, mixed, valid) | 2–4 | Phase 4 Done |
| Verify on WhatsApp Bot staging with realistic messages | 5 | Phase 5 Done |

### Acceptance criteria (from LIV-37)

| Linear AC (summary) | Phase(s) | Check on Linear when |
|---|---|---|
| Numbers but no delivery intent do not create records | 2–5 | Phase 5 Done |
| Legitimate delivery orders still recognized and created | 2–5 | Phase 5 Done |
| Ambiguous messages handled safely without unintended create | 2–3, 5 | Phase 5 Done |
| Tests cover false positives and valid orders | 4 | Phase 4 Done |
| No regressions in existing message processing | 4–5 | Phase 5 Done |

## Acceptance criteria checklist (local mirror)

- [ ] Messages containing numbers but no delivery intent do not create delivery records
- [ ] Legitimate delivery orders continue to be recognized and created
- [ ] Ambiguous messages are handled safely (ignore or confirm) without unintended record creation
- [ ] Tests cover both false positives and valid orders
- [ ] No regressions in existing message processing
- [ ] No product / placeholder product → not treated as a delivery
- [ ] Pre-create confirmation only for ambiguous/weak (AI) path; strict+product immediate
