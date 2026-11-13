# LIV-48 — Auto-create high-confidence AI deliveries

Plan for [LIV-48](https://linear.app/livsight-sarl/issue/LIV-48/whatsapp-bot-auto-create-high-confidence-ai-deliveries-confirm-only):
after LIV-37, every AI-parsed order asks for WhatsApp confirm. Soften that: **high-confidence**
AI extractions create on Core immediately; **weak** ones keep « Confirmer cette livraison ? ».
Strict 4-line parse stays immediate create.

**Branch:** `edjou/liv-48-whatsapp-bot-auto-create-high-confidence-ai`  
**Base for PRs:** `main`  
**Scope:** Core mode only (`USE_CORE_API=true`) — AI fallback branch in `deliveryHandler` after
normalize; related to [LIV-37](https://linear.app/livsight-sarl/issue/LIV-37/whatsapp-bot-prevent-false-delivery-creation)  
**Last updated:** 2026-11-13  
**Current phase:** 3 Done · next: Phase 4 (human must explicitly start)

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
| Issue signal | Work is explicitly for **LIV-48** (branch, user, or Linear URL) |
| Branch name | Use Linear’s git branch name: `edjou/liv-48-whatsapp-bot-auto-create-high-confidence-ai` (contains `liv-48`) |
| **Commits (mandatory while coding)** | Conventional Commits, English, imperative; every commit on this work **must** link LIV-48 via subject `[LIV-48]` and/or body/trailer `Refs LIV-48` (use `Fixes LIV-48` only when the human says the issue is finished) |
| PR title | Conventional Commit + `[LIV-48]` (when a PR is requested) |
| PR body | Near the top: `Fixes LIV-48` (finishes) or `Refs LIV-48` (partial / related) |
| No invented links | Do not invent other Linear IDs |

If these rules are **not** configured in the agent/session, the agent must stop — do not write
application code — and tell the human.

Paste or confirm before coding (Phase 1+):

```text
Linear ↔ GitHub (required before coding): branch includes liv-48; every commit links LIV-48
(Refs/Fixes); PR title has [LIV-48]; PR body has Fixes/Refs LIV-48; do not invent Linear IDs.
```

---

## Agent handoff protocol (every phase)

**Before writing any code for a phase:** re-check Hard gate + Agent rules. Ask before codebase
reads; propose code edits and wait for human OK.

When an agent **finishes a phase**:

1. **Propose** MD updates (phase **Done**, **Current phase**, **Exit notes**); wait for human OK.
2. Run the phase’s verification.
3. **Re-fetch** LIV-48. **Propose** checkbox flips per map; wait for human OK; then flip only
   those boxes. Multi-phase items only on the **last** required phase.
4. **Commit** with Conventional Commits + `[LIV-48]` / `Refs LIV-48`.
5. Do **not** start the next phase in the same commit unless asked.
6. Do **not** open a PR unless asked (base `main`).

Suggested commit shape:

```text
feat(bot): <phase summary> [LIV-48]

Refs LIV-48
```

**TDD:** failing Jest first → minimal implementation → refactor. Prefer
`wwebjs-bot/src/__tests__/unit/` with mocks (no live WhatsApp).

---

## Decisions (human-validated 2026-11-12)

| Topic | Decision |
|---|---|
| Approach | High-confidence AI → **immediate create**; weak AI → **keep confirm** |
| Strong gate | Valid phone + **real product** + amount `> 0` + non-empty quartier |
| Real product | Non-empty, not `"Non spécifié"` / placeholder — **catalog/stock match not required** (pickup free-text OK) |
| Strict 4-line | Unchanged — immediate create |
| Mode | Core only (`USE_CORE_API=true`) |
| Base branch | `main` |
| Related | Softens LIV-37 “always confirm on AI”; does not reopen casual number-in-chat creates |

---

## User stories

| ID | Role | Want | So that | Phase |
|---|---|---|---|---|
| US-1 | Vendor | Clear labeled / reordered AI orders save without `oui` | Everyday orders feel like pre-LIV-37 | 2–3 |
| US-2 | Vendor | Weak / incomplete AI still asks confirm | No surprise junk creates | 2–3 |
| US-3 | Vendor | Strict 4-line still instant | No regression | 3 |
| US-4 | Ops | Phone-only / no-product chatter still not auto-created | LIV-37 protection holds | 2–3 |
| US-5 | Dev | Unit fixtures for strong vs weak AI | Gate doesn’t drift | 2–3 |

---

## Phase status

| Phase | Name | Status | Owner / agent | Completed |
|---|---|---|---|---|
| 0 | Preconditions & Linear gate | Done (branch + plan) | Cursor | 2026-11-12 |
| 1 | Document AI confirm path + confidence helper design | Done | Cursor | 2026-11-13 |
| 2 | Confidence gate helper + unit tests (TDD) | Done | Cursor | 2026-11-13 |
| 3 | Wire deliveryHandler: strong create / weak confirm | Done | Cursor | 2026-11-13 |
| 4 | Smoke: clear AI auto-creates; weak still confirms | Not started | — | — |

Statuses: `Not started` · `In progress` · `Blocked` · `Done`

---

## Linear checkbox map

| Linear checkbox | Satisfied when | Phase(s) |
|---|---|---|
| Define and document the high-confidence vs weak AI gate | Gate written in Decisions + Context / helper docs | **1** (last) |
| Auto-create on Core when AI result is high-confidence | Strong AI → `saveDelivery` / create, no confirm prompt | **3** (last) · helper in 2 |
| Keep pre-create confirm when AI result is weak / ambiguous | Weak AI → `ASK_CONFIRM_AI` unchanged | **3** (last) · helper in 2 |
| Leave strict-parser immediate create unchanged | No change to strict success path | **3** |
| Add unit tests for high-confidence create vs weak confirm | Jest fixtures (Yanis/Loic-style + weak) | **2** (gate) · **3** (handler) — check on **3** |
| Smoke-check clear AI creates without confirm; weak still asks | Human live/local smoke | **4** |

### Acceptance criteria coverage

| AC | Phase |
|---|---|
| Clear AI orders create without confirm | 2–4 |
| Weak AI still confirm / ignore per gates | 2–4 |
| Strict 4-line still immediate | 3–4 |
| No false-create regression (no product / chatter) | 2–4 |
| Unit tests cover both paths | 2–3 |

---

## Context snapshot (Phase 1 — 2026-11-13)

| Piece | Role today | LIV-48 relevance |
|---|---|---|
| Strict parse success | Immediate `saveDelivery` / create | **Unchanged** |
| AI fallback after `looksLikeMalformed` | `extractDeliveryWithAI` → `validateAndNormalizeAiDelivery` | Entry for confidence split |
| Normalize `null` | Drop (placeholder product / bad phone / bad amount) | No confirm, no create |
| Normalize success | **Always** `pendingDeliveryConfirm.setPending` + « Confirmer… » (`ASK_CONFIRM_AI`) | **Split here**: strong → create; weak → keep confirm |
| `oui` / `non` | `CREATE_AI_CONFIRMED` / clear pending | Keep for weak path |
| `isPlaceholderProduct` (`productNormalize.js`) | Empty, `Non spécifié`, N/A, digits-only, … | Reuse for “real product”; **catalog not required** |
| Normalize shape | `{ phone, items, amount_due, quartier\|null, delivery_note, carrier }` | Helper inputs |
| Amount edge | Normalize can allow `amount_due === 0` | Strong requires `amount_due > 0` |
| Quartier edge | Can be `null` after sanitize | Strong requires non-empty trim |

### Helper API (locked for Phase 2)

```js
// pure; e.g. src/lib/aiDeliveryConfidence.js
isHighConfidenceAiDelivery(normalized) → boolean
```

| Check | Strong when |
|---|---|
| `normalized` | truthy |
| phone | present (already validated by normalize) |
| `items` | not `isPlaceholderProduct(items)` |
| `amount_due` | `Number(amount_due) > 0` |
| `quartier` | `String(quartier).trim()` non-empty |

Wire point: `deliveryHandler.js` AI `runAiFallback` after successful normalize (~687–714) — today always confirm.

---

## Phase 0 — Preconditions & Linear gate

**Status:** Done (branch from `origin/main` + this plan file).

### Scope

- Branch `edjou/liv-48-whatsapp-bot-auto-create-high-confidence-ai` from `main`.
- This plan with Agent rules, Hard gate, handoff, decisions, checkbox map.

### Out of scope

- Application code.

### Verification

- `git branch --show-current` = Linear branch; PR base `main`.

### Commit

```text
docs(bot): add LIV-48 AI high-confidence auto-create plan [LIV-48]

Refs LIV-48
```

### Exit notes

- Branch from `origin/main` at `f199ef4` (Merge PR #11 LIV-14).
- No application code. Do not start Phase 1 until human explicitly says so.

---

## Phase 1 — Document AI confirm path + confidence helper design

**Status:** Done (2026-11-13, Cursor)  
**Goal:** With human OK to read code, pin where AI always confirms today and how
`validateAndNormalizeAiDelivery` / placeholder product flags work; document the exact
inputs for `isHighConfidenceAiDelivery(normalized)`.

### Scope

- Ask before reads; update Context snapshot in this plan.
- Lock helper API shape (pure function, unit-testable).

### Out of scope

- Behavior change.

### Verification

- Human review of Context snapshot (approved 2026-11-13).

### Commit

```text
docs(bot): document AI confirm path for LIV-48 [LIV-48]

Refs LIV-48
```

### Exit notes

- Documented always-confirm AI path and normalize/placeholder behavior.
- Locked `isHighConfidenceAiDelivery(normalized)` for Phase 2.
- Linear checkbox “Define and document the high-confidence vs weak AI gate” flipped after human OK.
- No application code. Do not start Phase 2 until human explicitly says so.

---

## Phase 2 — Confidence gate helper + unit tests (TDD)

**Status:** Done (2026-11-13, Cursor)  
**Goal:** Pure helper: strong vs weak; fixtures for Yanis/Loic-style complete fields vs
placeholder / amount 0 / missing quartier.

### Scope

- Red → green → refactor for the helper only.
- Catalog match **not** required for “real product”.

### Out of scope

- Handler wiring (Phase 3).

### Verification

- `./node_modules/.bin/jest src/__tests__/unit/aiDeliveryConfidence.test.js` — 7 passed.

### Commit

```text
feat(bot): add AI delivery confidence gate [LIV-48]

Refs LIV-48
```

### Exit notes

- Added `src/lib/aiDeliveryConfidence.js` (`isHighConfidenceAiDelivery`).
- Unit tests cover Yanis/Loic-style strong + placeholder / amount 0 / empty quartier / missing phone.
- **No Linear checkboxes** flipped (handler wiring is Phase 3).
- Do not start Phase 3 until human explicitly says so.

---

## Phase 3 — Wire deliveryHandler: strong create / weak confirm

**Status:** Done (2026-11-13, Cursor)  
**Goal:** After AI normalize, if high-confidence → create immediately (same path as confirmed
AI); else keep pending confirm + prompt. Strict path untouched.

### Scope

- Failing handler tests first, then minimal wire.
- Preserve LIV-37 ignore/reject when no real product.

### Out of scope

- Live smoke (Phase 4).

### Verification

- `./node_modules/.bin/jest src/__tests__/unit/deliveryHandler.test.js src/__tests__/unit/aiDeliveryConfidence.test.js` — 25 passed.

### Commit

```text
feat(bot): auto-create high-confidence AI deliveries [LIV-48]

Refs LIV-48
```

### Exit notes

- Wired `isHighConfidenceAiDelivery` in AI `runAiFallback`: strong → `saveDelivery`; weak → confirm.
- Handler tests updated for LIV-48 (high-confidence create; weak confirm/oui/non).
- Linear checkboxes for auto-create / weak confirm / strict unchanged / unit tests flipped after human OK.
- Do not start Phase 4 until human explicitly says so.

---

## Phase 4 — Smoke: clear AI auto-creates; weak still confirms

**Status:** Not started  
**Goal:** Local/staging WhatsApp: labeled clear order creates without confirm; weak case still
asks (or ignores per gates).

### Scope

- Manual smoke; record Exit notes; fix only with tests if needed.

### Verification

- Human confirms behavior; unit tests still green.

### Commit

```text
docs(bot): record LIV-48 AI confidence smoke notes [LIV-48]

Refs LIV-48
```

### Exit notes

_(fill on Done)_

---

## Open questions

None — strong gate + real product (not catalog-forced) validated 2026-11-12.

---

## Out of scope (whole issue)

- Changing strict parser rules.
- Requiring catalog/stock match for auto-create.
- Removing confirm entirely for all AI orders.
- Legacy DB path (non-Core).
- Unrelated `#link` / notification work.
