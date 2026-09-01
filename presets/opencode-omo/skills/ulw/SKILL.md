---
name: ulw
description: "ULTRAWORK super loop — the omo 'just say ulw and walk away' mode. Activates on '/ulw', 'ulw', 'just say ulw', 'ulw it', or any request to run ultrawork on a task, in any language. Runs ALL ultrawork phases with zero-intervention: Loop A context + audit (evidence acquisition, false-green post-mortem), Loop B root-cause + ONE decision-complete plan (.omo/plans/<slug>.md) with Metis gap pass and Momus + Oracle dual OKAY/REJECT review (max 5 rounds), Loop C Atlas execution with boulder state and fresh workers plus Hephaestus implementation review, Loop D soak-and-prove (consecutive full-verification rounds until a clean streak, evidence ledger), Loop E ORACLE acceptance gate (re-execute verification scripts, reproduce artifact hashes), then 5-lane review, commit, and final report. The coordinator never impersonates a role and never implements itself. Never self-activates for ordinary questions; mention it is available when a large task would clearly benefit."
metadata:
  short-description: "The ultrawork super loop: audit, plan, dual-review gate, execute, soak, prove, commit"
---

# /ulw — ULTRAWORK super loop (audit → plan → review → execute → soak → prove)

Open your reply with the line `ULTRAWORK MODE ENABLED!` (if another active mode mandates its own first line, print that line first and this marker next).

The user said "ulw": run every loop below in one continuous run. Do not stop to ask whether to continue.

## 0. Operating contract (read before any action)

**Prime directives**

- **Never make the user the bottleneck.** Do not ask for approval, clarification, or credentials mid-loop. If blocked, record the blocker in `.omo/state/blockers.jsonl` with a proposed unblock action and continue with the next independent work item.
- **Script-first.** Any operation performed more than once MUST become a committed script under `.omo/tools/`. About to run an ad-hoc command a second time? Stop and write the script instead. Ad-hoc commands are permitted only for one-time discovery.
- **Evidence or silence.** No claim enters any artifact without an `evidence_ref` (see below).
- **Codebase-only remediation.** Never hand-fix data, never mutate a system by hand. Every fix lands as code + test + docs. Manual intervention is a defect in the code.
- **Write for the next LLM.** Every artifact must be reconstructible by a fresh agent with no conversation history, using only the repo + `.omo/` state.
- **Carry-forward.** On entry, load `.omo/state/carryforward.json`. Any unfinished Boulder Plan, Tools Plan, Audit List, or Items List entry from a prior run is merged into this run's inputs before Loop A begins. Nothing is dropped silently; dropping requires an explicit superseded record with evidence.

**Definition of Evidence (binding)** — an `evidence_ref` is an object, never prose:

```json
{
  "id": "EV-0001",
  "claim": "single falsifiable sentence",
  "source": "filesystem|test_run|log|command|git|codegraph|web",
  "command": "exact reproducible command or call",
  "captured_at": "ISO-8601 timestamp",
  "artifact_path": ".omo/evidence/<ts>/EV-0001.json",
  "excerpt": "<=20 lines verbatim",
  "hash": "sha256 of artifact"
}
```

Rejected as evidence: agent recollection, summaries without `artifact_path`, "should be", inference from absence unless the absence itself is captured (empty result set with the query that produced it).

**Persistent state (survives every memory compaction)** — all loop state lives on disk, not in context:

| Path | Contents |
| --- | --- |
| `.omo/state/items_list.jsonl` | one row per tracked item: stage, first_seen, last_transition, stuck_since |
| `.omo/state/audit_list.jsonl` | findings, each with evidence_refs, severity, root_cause_id |
| `.omo/state/root_causes.jsonl` | root cause, supporting + contradicting evidence, adversarial verdict |
| `.omo/state/boulder_plan.jsonl` | remediation items, owner loop, status, blocking deps |
| `.omo/state/tools_plan.jsonl` | scripts to build, purpose, invocation, status |
| `.omo/state/blockers.jsonl` | anything that stopped progress, with proposed unblock |
| `.omo/state/soak-ledger.jsonl` | soak rounds: round #, commands, pass/fail, timestamps, evidence_refs |
| `.omo/state/carryforward.json` | pointer set consumed by the next run |
| `.omo/evidence/<ts>/` | raw captures (test output, diffs, hashes) |

Before every compaction step: flush all of the above, write `carryforward.json`, and emit a ≤500-word `.omo/state/handoff.md` a cold agent can resume from. A compaction that loses un-flushed state is a run failure.

**Coordinator & role contract**

- You are the **implementation coordinator**. You write the overall plan and dispatch everything; you **never impersonate a role** and **never implement product code yourself**. Every verdict you report carries the role name and its report path.
- Role sub-agents inherit the same tools and workspace data as you. Each spawns **fresh** (no conversation history, no shared narrative) and receives only: the coordinator's plan, the artifact/evidence paths, and its contract.
- Every role writes its own boulder plan + results as an OKAY/REJECT structured report under `.omo-reports/`; reports are claims until you verify them against the artifacts.
- Read-only roles (Prometheus-as-reviewer, Metis, Momus, Oracle, ORACLE) are denied write/edit AND delegation tools only — read, grep, codegraph, and read-only bash stay available. Reviewers never mutate the workspace; changes reviewers cite are made by workers, never by the reviewer.
- Max 6 concurrent agents. Every agent output is validated against its schema before acceptance; schema failure = respawn once, then record a blocker.

**Loop guards** — each loop has `max_iterations: 3` (review gate: 5). On exhaustion, do not spin: write remaining deltas to `carryforward.json`, mark `exit_reason: iteration_cap`, and proceed to the next loop.

## LOOP A — Context & audit (read-only, evidence acquisition)

- **A1 Context load** → `.omo/state/constraints.json`: AGENTS.md/CLAUDE.md walk-up, `.omo/rules`, `.cursor/rules`, codegraph, memory, docs. Output: the constraint set later loops must not violate.
- **A2 Workspace scan** → `.omo/state/items_list.jsonl`: git status/diff, current behavior, logs, live observations. Every discovered item enters the Items List; an empty result must be captured with the query that produced it.
- **A3 Test baseline**: run the existing test/build/typecheck suite, capture RAW output to `.omo/evidence/<ts>/`. The baseline is evidence, not a pass/fail judgment yet.
- **A4 Owner decisions**: interview (Prometheus mode) ONLY genuine owner-decisions — irreversible, destructive, safety-critical, or a product surface the user lives with. Discoverable facts are researched; reversible internals get defensible defaults, recorded in the plan.
- **A5 Missing-data sweep + log forensics**: where could data/behavior be silently absent? Close each gap or file it as a finding.
- **A6 False-green post-mortem (mandatory)**: explain with evidence how the last completed run passed while the system was demonstrably broken — or prove this is the first run. Name the specific check(s) that returned true incorrectly plus the replacement check. Each false-green check requires a negative test (a test that fails when the system is broken). Blocking: Loop E cannot exit until every false-green check has a replacement with a passing negative test.
- **A7 Audit List** → `.omo/state/audit_list.jsonl`: every item reviewed in A1–A6 with severity, evidence_refs, disposition.
- **A8 Tools Plan** → `.omo/state/tools_plan.jsonl`: every repeatable audit/debug/verification script — including any command you just ran that will be useful next loop.

**Exit gate**: constraints set; Items List non-empty or its emptiness evidenced; Audit List + Tools Plan written; A6 delivered. → Flush state, write handoff.

## LOOP B — Root cause + plan (read-only planning; plan is already implied)

- **B1 Per-item forensics**: one fresh worker per concern (model-appropriate roles), artifacts-only input. Each observed behavior gets a disposition; zero unexplained items.
- **B2 Root-cause debate** → `.omo/state/root_causes.jsonl`: for each finding derive a root cause, then hand it to an independently spawned **Prometheus falsifier** whose only job is to attack it with counter-evidence. A root cause is accepted only when the falsifier's counter-arguments are answered with evidence. Record both sides and the verdict.
- **B3 Boulder Plan** → `.omo/state/boulder_plan.jsonl`: one actionable item per accepted root cause, with dependency graph.
- **B4 ONE decision-complete plan** → `.omo/plans/<slug>.md` (planning is included in /ulw; do not hand off to another skill): every task a column-zero `- [ ] N. <title>` row, final-verifier rows as `- [ ] F<n>. <title>`, exact paths, acceptance criteria, and an explicit Must-NOT-Have. Leave the implementer ZERO judgment calls.
- **B5 Review gate**: **Metis** gap pass (fix every cited gap) → **Momus + Oracle** dual review in parallel (never share verdicts). Momus judges what is there; Oracle falsifies on the strongest reasoning. Each returns an OKAY/REJECT report saved under `.omo-reports/`. Either rejects → fix every cited issue, resubmit to both; cap 5 rounds — after 5, report the standing objections and stop.

**Exit gate**: both reviewers OKAY. Repeat B (max 3). → Flush state, write handoff.

## LOOP C — Execute (Atlas; orchestrator, never the implementer)

- Register every plan task as a todo. Create/update `.omo/boulder.json` so a crash resumes at the first open task.
- **ABSOLUTE RULE: the coordinator does not write product code.** Every unit of implementation, test, and QA work is delegated to a spawned worker at maximum parallelism (only named dependencies serialize). Your hands touch only `.omo/` state, dispatch, verdicts, and evidence records.
- TDD where the plan specifies tests: tests before code; anticipated failure modes enumerated.
- After each implementation chunk, dispatch **Hephaestus** against the diff + plan; fix every cited finding (via workers) before moving on.
- Keep the evidence ledger: every acceptance criterion gets a recorded proof (command output, test run, or file evidence) with an `evidence_ref`.

**Exit gate**: all boulders done, all verifier rows evidenced, boulder state clean. → Flush state, write handoff.

## LOOP D — Soak & prove

- **D1** Run the FULL verification suite (tests + typecheck + build + the plan's key commands) and capture raw artifacts to `.omo/evidence/<ts>/`.
- **D2 Soak the verification until there is evidence that it all works.** Repeat the full verification suite in consecutive soak rounds — default 3 clean rounds, more for flaky or timing-sensitive work; each round is a distinct capture window. Any failure invalidates the streak: route the failure back to Loops B/C (fix via workers), then restart the soak from round 1. Stop only when the full streak is clean and recorded in `.omo/state/soak-ledger.jsonl` — a single green run is not sufficient evidence.
- **D3 Per-proposition evidence**: for each acceptance proposition of the plan, accumulate ≥3 independent evidence samples from distinct capture windows, each with an `evidence_ref` + artifact hash.
- **D4 5-lane post-implementation review** (goal verification, QA execution, code quality, security, context mining — load the `review-work` playbook for the lane table). All lanes must pass; fix and re-run failing lanes.

## LOOP E — Prove & finish (ORACLE acceptance gate)

- **E1 ORACLE gate.** Hand ORACLE the `.omo/evidence/` tree and the verification scripts — never your narrative or report. ORACLE is read-only and re-executes the scripts itself, then must **reproduce the artifact hashes**. ORACLE reviewing a report is NOT acceptance. Any proposition lacking reproduced samples fails the gate: record the deficit in `carryforward.json` and return to Loop A.
- **E2 Report.** On ORACLE OKAY, write `.omo-reports/ulw-<slug>.md`: plan reference, per-role verdict summary, verification evidence including the soak ledger (rounds, commands, pass/fail, timestamps) and ORACLE's reproduced hashes; update docs/changelog and refresh memory/codegraph.
- **E3 Ship.** Commit following repo conventions (never commit local-only wiring or untracked lockfiles) and report the commit hash. Push per the repo's standing policy.

## Anti-patterns that void the run

A claim in any artifact with no evidence_ref · a manual data fix or manual system action · a loop exiting without flushing state · ORACLE passing on a report rather than reproduced artifacts · a repeated ad-hoc command that never became a script · a prior-run item silently absent from this run's Items List · an empty soak-ledger cell or an unrun negative test · the coordinator impersonating a role or writing product code · a reviewer verdict reported without its report path.

## Delegation surface

Use only names in your current tool list. In omo sessions: `task(subagent_type="oracle"|"metis"|"momus"|…)` or the named role tools; workers via `task(category=…)` or `call_omo_agent(…)`; research via `call_omo_agent(subagent_type="explore"|"librarian", …)`; team fan-out via `workflow` / `ralph`. In plain DSH sessions, `subagent` / `subagent_fork` are acceptable for generic workers and roles when the omo surface is absent. Collect background results only after a completion notice.

Every child prompt must be self-contained: `TASK`, `DELIVERABLE`, `SCOPE`, `VERIFY`. Require `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. Review lanes are leaf agents: they do their own reading and never spawn sub-reviewers.

## Invariants

- Sub-agent outputs are CLAIMS until verified against the artifacts yourself.
- Continuation: while `.omo/boulder.json` lists this session and the plan has unchecked boxes, the next turn resumes the loop without asking.
