---
name: ulw
description: "ULTRAWORK super loop — the omo 'just say ulw and walk away' mode. Activates on '/ulw', 'ulw', 'just say ulw', 'ulw it', or any request to run ultrawork on a task, in any language. Generic for any workflow and any database: it first assesses whether a Domain Map (covering ALL systems, workflows and databases in scope) would be best executed BEFORE this skill, then binds a per-codebase system map and a workflow state machine (items, stages, path matrix, stores, queues, final destination) and runs ALL ultrawork phases with zero intervention: Loop A context + audit (Deep-agent evidence sweep, Items List, Target Matrix, false-green post-mortem, Audit List + Tools Plan), Loop B root-cause (codebase-first, adversarial Prometheus debate, no manual data fixes), Loop C decision-complete plans (Metis review), Loop D implementation (skeptical Hephaestus + Momus review), Loop E deploy + 30-minute soak repeated until 5 independent evidence samples per acceptance lane, then an adversarial ORACLE re-executes verification and reproduces artifact hashes, then a 5-lane review, commit, and final report. Never self-activates for ordinary questions; mention it is available when a large task would clearly benefit."
metadata:
  short-description: "ULTRAWORK super loop (generic workflows + databases): Domain Map pre-flight (all systems, workflows, databases) -> audit (Loop A) -> root cause + plan (Loop B) -> plan review (Loop C) -> implement (Loop D) -> deploy + 30-minute soak to 5 evidence samples per lane (Loop E) -> adversarial ORACLE gate -> 5-lane review -> commit."
---

# /ulw — ULTRAWORK super loop (audit → plan → review → execute → soak → prove)

Open your reply with the line `ULTRAWORK MODE ENABLED!` (if another active mode mandates its own first line, print that line first and this marker next).

The user said "ulw": run every loop below in one continuous run. Do not stop to ask whether to continue.

## 0. Operating contract (read before any action)

**Domain Map gate — assess BEFORE executing this skill's loops**

Before Loop A starts, assess whether a Domain Map would be best executed **BEFORE this skill**:

1. Does a current Domain Map exist for this codebase (repo docs, mem-palace, carry-forward)?
2. Does it cover **ALL systems, ALL workflows, and ALL databases** in scope of this /ulw-loop?

**What the Domain Map is** (reference: the `domain-modeling` skill — https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling):

- a **domain glossary** — canonical terms and their relationships, written with zero implementation details (the reference's `CONTEXT.md`);
- a **context map** — where each sub-domain/context lives when the codebase has more than one (the reference's `CONTEXT-MAP.md`);
- **decisions** — hard-to-reverse, surprising, or trade-off decisions recorded as ADRs (the reference's `docs/adr/`);
- plus the **operational inventory** this skill layers on top: every system, every workflow, and every database in /ulw-loop scope (listed below).

If the Domain Map is missing, stale, or incomplete, **execute the Domain Map FIRST — before any loop step — and persist it.** If a domain-modeling or Domain Map skill exists in the current tool catalog, run it as the pre-flight and consume its outputs; otherwise produce the Domain Map yourself. The Domain Map MUST cover, for this /ulw-loop:

- **every system**: execution nodes, processing/transfer system, source feed(s), final destination;
- **every workflow**: item lifecycle, stages S1..Sn, workflow state machines, path matrices;
- **every database / data store**: the state store, staging/orphan queue, statistics stores, external reference systems.

Persist the Domain Map as `.omo/state/domain-map.md` plus machine-readable `.omo/state/domain-map.json`, sourced from the domain-modeling outputs where they exist, else repo config, docs, code, codegraph and mem-palace, with an `evidence_ref` per system/workflow/database entry. Never leave the loop's bindings dependent on files this skill does not own.

The Domain Map is the source of truth for Loop A step A's workflow-model bindings. A primitive that is not on the Domain Map is bound during Loop A with evidence or recorded as a blocker — never guessed.

**Activation** — never self-activate for ordinary questions; when a large task would clearly benefit, mention that /ulw is available.

**Prime directives**

- **Never make the user the bottleneck.** Do not ask for approval, clarification, or credentials mid-loop. If blocked, record the blocker in `.omo/state/blockers.jsonl` with a proposed unblock action and continue with the next independent work item.
- **Script-first / always use scripts wherever available.** Any operation performed more than once MUST become a committed script under `.omo/tools/` (the Tools Plan is where repeatable audit, debug, log-collection, monitoring, and documentation scripts are identified — including commands you are about to run that will be useful in subsequent loops). Ad-hoc commands are permitted only for one-time discovery.
- **Evidence or silence — no claims without irrefutable evidence.** Be thorough; evidence must be clear enough for another LLM to follow and gain a shared understanding. Every claim carries an `evidence_ref`.
- **Codebase-only remediation.** Do NOT manually fix any data or perform system actions. All fixes must be handled via the codebase. Manual intervention is a defect in the code.
- **Write for the next LLM.** Every artifact must be reconstructible by a fresh agent with no conversation history, using only the repo + `.omo/` state.
- **Carry-forward.** On entry, load `.omo/state/carryforward.json`. Any unfinished Boulder Plan, Tools Plan, Audit List, or Items List entry from a prior run is merged into this run's inputs before Loop A begins. Nothing is dropped silently; dropping requires an explicit superseded record with evidence.

**Workflow model (generic — works for any workflow and any database)**

Every pipeline under audit is modeled with the primitives below. Bind them from the repo's config, docs, code, mem-palace and carry-forward during Loop A step A, and record the bindings in `.omo/state/system-map.json`. A missing binding is a blocker, not a guess: record it with a proposed unblock (which config file or code path would answer it) and proceed with everything else.

| Primitive | Meaning | Bind from |
| --- | --- | --- |
| **Item** | the unit of work tracked through the workflow (a file, record, request, job, row) | domain code + docs |
| **Stage (S1..Sn)** | a named processing phase in the workflow; the ordered column set of the path matrix | state-machine docs or code |
| **Workflow State Machine** | all states per stage and all ALLOWED transitions between them, plus per-state invariants and validation rules | docs if present, else reconstructed from code with evidence and reviewer-validated |
| **Path Matrix** | stages as columns × items as rows; each cell = the item's current state/status in that stage | the state machine + live store data |
| **Target Matrix** | the path matrix plus progress, stuck and error flags per item — the proof that stages are progressing | derived from the path matrix |
| **Source feed(s)** | where new items originate | config + docs |
| **State store (any database)** | where item records/status live (SQL, NoSQL, warehouse, API-backed store, spreadsheet) | config + docs + schema |
| **Processing/transfer system** | the component(s) that transform or move items between stages | config + docs |
| **Staging/orphan queue** | the landing zone for files or records that lost their owning item | config + docs + directory layout |
| **Final destination** | terminal storage: cloud bucket, warehouse, filesystem, archive | config + docs |
| **Primary pipeline scripts** | orchestrator, shared libraries, UI/dashboard | repo entry points + docs |
| **Execution nodes** | the hosts/environments where pipeline scripts run, plus their configuration file and any remote-exec/gather script | repo's node config |

Persist the reconstructed workflow state machine in `.omo/state/workflow-state-machine.json` (states, allowed transitions, invariants, validation rules) with an evidence_ref for every transition claim. Every later loop enforces it: there must be NO workflow / State Machine violations and NO data loss.

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
| `.omo/state/domain-map.json` | the Domain Map: every system, workflow and database in /ulw-loop scope (pre-flight; source of truth for bindings) |
| `.omo/state/system-map.json` | this run's primitive bindings (per codebase, resolved from the Domain Map) |
| `.omo/state/workflow-state-machine.json` | states, allowed transitions, invariants, validation rules |
| `.omo/state/items_list.jsonl` | the Items List: one row per tracked item (stage, first_seen, last_transition, stuck_since) |
| `.omo/state/target_matrix.jsonl` | the Target Matrix: stage columns × item rows, cells = status-column data from the state store, plus progress/stuck/error flags |
| `.omo/state/audit_list.jsonl` | the Audit List: findings from Loop A steps A–K, each with evidence_refs, severity, root_cause_id |
| `.omo/state/root_causes.jsonl` | root cause, supporting + contradicting evidence, adversarial Prometheus verdict |
| `.omo/state/boulder_plan.jsonl` | remediation items, owner loop, status, blocking deps |
| `.omo/state/tools_plan.jsonl` | scripts to build, purpose, invocation, status |
| `.omo/state/blockers.jsonl` | anything that stopped progress, with proposed unblock |
| `.omo/state/soak-ledger.jsonl` | soak rounds: round #, commands, pass/fail, timestamps, evidence_refs |
| `.omo/state/carryforward.json` | pointer set consumed by the next run |
| `.omo/evidence/<ts>/` | raw captures (test output, diffs, hashes, screenshots) |

Before every compaction step (N, T, Y, AC): flush all of the above, write `carryforward.json`, emit a ≤500-word `.omo/state/handoff.md` a cold agent can resume from, and update mem-palace + codegraph with what this phase produced. A compaction that loses un-flushed state is a run failure.

**Coordinator & role contract**

- You are the **implementation coordinator**. You write the overall plan and dispatch everything; you **never impersonate a role** and **never implement product code yourself**. Every verdict you report carries the role name and its report path.
- Role sub-agents inherit the same tools and workspace data as you. Each spawns **fresh** (no conversation history, no shared narrative) and receives only: the coordinator's plan, the artifact/evidence paths, and its contract.
- Every role writes its own plan + results as an OKAY/REJECT structured report under `.omo-reports/`; reports are claims until you verify them against the artifacts.
- Read-only roles (Prometheus-as-falsifier, Metis, Momus, Hephaestus-as-reviewer, ORACLE) are denied write/edit AND delegation tools only — read, grep, codegraph, and read-only bash stay available. Reviewers never mutate the workspace.
- Max 6 concurrent agents. Every agent output is validated against its schema before acceptance; schema failure = respawn once, then record a blocker.

**Loop guards** — each loop has `max_iterations: 3` (review gates: 5). On exhaustion, do not spin: write remaining deltas to `carryforward.json`, mark `exit_reason: iteration_cap`, and proceed to the next loop.

## LOOP A — "Start LoopA": context & relentless audit (steps A–N)

Thoroughly audit and relentlessly investigate by spawning `(category=Deep)` agents (fresh, evidence-first), each to:

- **A)** Check documentation, memory, codegraph and mem-palace for the latest occurrences, updates, decisions, glossary and principles; resolve the workflow-model bindings from the Domain Map produced in the pre-flight and reconstruct/validate the workflow state machine.
- **B)** Gather ALL the system logs from every execution node in the system map (queried via the node's API, e.g. a container/agent API, where the repo provides one) from the most recent 24 hours into the Items List.
- **C)** Check that source feeds are being processed into the state store: get actual items again from the feed(s) and the store, check all recent items from the last 24 hours, and: 1) review and validate these items against the Items List AND check previous items from the previous loop's Items List — IF previous items are still not completed, or stuck in the staging queue, or stuck in the processing system, THEN add them back into the current Items List; 2) investigate errors and data-quality issues of the newly ingested items.
- **D)** Check the state store (any database) by performing an actual batch query against each item in the Items List and: 1) investigate items in eternal/looped errors, stuck in eternal failures; 2) identify and anticipate data-quality issues; 3) retrieve and audit the long-term statistics, save current statistics, and track processing-system statistics beyond this loop in mem-palace.
- **E)** Check the processing/transfer system by directly querying it and: 1) get actual evidence of the number of finished items/files and total size at the final destination; 2) each item must be progressing in order to be removed from the Items List — if not, track each item, find the root cause and fix it; 3) check how many items have been added to the processing system; 4) check how many processed items have been synced, validated, orphan-adopted, skipped; 5) investigate repeat items being skipped at intermediate stages, why items are stuck in the processing system or the staging queue, and validate that skip is the correct action; 6) investigate repeat items stuck in active processing slots.
- **F)** Track each item in the Items List moving through the path matrix (stages as columns, allowed transitions only).
- **G)** Check the staging/orphan queue: 1) make a list of Orphaned Files from EACH directory; 2) retrieve and audit the long-term statistics, save current statistics, and track staging-queue statistics beyond this loop in mem-palace.
- **H)** Thoroughly investigate all the system logs and: 1) investigate the errors and gather related evidence; 2) look for configuration issues in the execution nodes against the repo's node configuration; 3) validate logs against the pre+post functions and data events; 4) identify and anticipate gaps or errors in logging that will hinder current or future audits and investigations.
- **I)** Anticipate and identify where data may be missing and relentlessly close this gap.
- **J)** Compile a Target Matrix showing that stages are progressing for each item in the Items List: columns = the workflow's stage columns (S1..Sn), rows = each item in the Items List, cell value = data formatted as the item's status column in the state store, plus progress/stuck/error flags.
- **K)** Deeply investigate the reason why the last super loop can still be validated by ORACLE while evidence shows: remote nodes are not working; there are no new source items; the processing queue is full and nothing is being transferred; the processing system has errors that are not being retried; processed-file numbers are NOT trending down; items are not being copied to the final destination; items are not being validated. Document this for later auditing against the Items List (this is the false-green post-mortem).
- **L)** Compile all findings into an Audit List containing every item reviewed and identified as an error from steps A–K, and review it with Hephaestus.
- **M)** Identify and anticipate useful repeatable scripts to automate auditing, debugging, log collection, monitoring and documentation into a Tools Plan — this applies even to the commands you are about to run if they are useful in subsequent loops.
- **N)** Compact memory to begin the next phase (flush state, write handoff).

**Loop A overall rule: do not make claims without irrefutable evidence; be thorough; evidence must be clear for another LLM to follow and gain a shared understanding.**

## LOOP B — "Start LoopB": root cause + plan (steps O–T)

- **O)** Focus codebase updates around the primary pipeline scripts from the system map (orchestrator, shared libraries, UI/dashboard) — do not change others unless required and dependent. Scripts that execute remotely will require the repo's execute/gather script to collect data — check mem-palace for information and scripts.
- **P)** Identify the last code commit and relentlessly search for evidence of continuous execution improvements for each of the changes.
- **Q)** Relentlessly check the logs by spawning model-appropriate sub-agents, each agent to: 1) verify each item's processing in the actual systems — check observable information from documentation and system logs against the path matrix for all allowed item transitions in each row, and identify which column is a transition state aligned with the workflow state machine; there must be NO workflow / State Machine violations and NO data loss; 2) ensure errors and issues in the logs are dealt with; 3) find items NOT progressing for 6+ hours — find root cause and fix; 4) classify where each step takes longest and identify ways to reduce the duration — implement and test this; 5) make sure the console logs provide irrefutable proof of item history, with messages that are meaningful and concise; 6) identify gaps in the logs against the documented pre+post functions and data events; 7) obtain REAL screenshots of the pipeline UI/dashboard and ensure it is functional, and verify the information is informative and accurate — do not make unnecessary changes, the screen real-estate is precious, use every bit of it; 8) query the actual source feeds, the state-store API and any external reference systems, and review that the data is correct; 9) review the Orphaned List, check possible adoption items and identify orphan-adoption failures; 10) ensure that NO data is lost and every item is validated before it is completed/deleted, AND ensure that the item validation rules are not violated; 11) anticipate failure scenarios and identify edge cases that are preventing progress or have not been captured previously — plan an update to fix these problems; 12) anticipate and identify where data may be missing and relentlessly identify cases and actions to address this gap; 13) do not make code changes that go against past decisions — check documentation and mem-palace.
- **R)** Systematically identify the root causes for all items from #1–#13, and using evidence debate each root cause with an independently spawned adversarial **Prometheus** (falsifier-only). REPEAT Loop B until action items are planned for ALL Audit items into the Boulder Plan.
- **S)** Update the Tools Plan if there are additional items to improve the automation of debugging, log collection, data monitoring and documentation.
- **T)** Compact memory to begin the next phase.

**Loop B overall rule: do not manually FIX any data or perform system actions — all fixes must be handled via the codebase, and be clear for another LLM to follow and gain a shared understanding.**

## LOOP C — "Start LoopC": plans + review (steps U–Y)

- **U)** For each item in the Boulder Plan AND Tools Plan, perform a detailed code-update plan and documentation update. Make the changes surgical; the glossary, architecture, decision records and design updates must be aligned with documented or past updates, easily navigated by another LLM, and codegraph + mem-palace must be aligned with the new changes.
- **V)** Ensure the code architecture is effective and efficient: reduce duplicate code functions across the codebase and reduce/generalize functions into a separate function or module to reduce code-slop.
- **W)** Ensure test-driven development methodology is followed: update the testing plan; code testing must be comprehensive and test failures must be anticipated.
- **X)** Review the testing and code-update plans and identify whether it is justified to complete each item without a basic test or prototype. Where testing is identified, create a Prototyping Plan — a set of conceptual tests or proofs of concept — to ensure the UI, code logic, code structures, data definitions, data models or data flows from the coding/testing updates work.
- **Y)** Perform reviews on each item of: 1) the code-update plan, 2) the documentation-update plan, 3) the test-update plan, 4) the Prototyping Plan — each with an independently spawned **Metis**. REPEAT Loop C until all plans in the previous step have passed review. Then compact memory to begin the next phase (flush state, write handoff).

**Loop C overall rule: be surgical in changes and clear for another LLM to follow and gain a shared understanding.**

## LOOP D — "Start LoopD": prototype + implement + review (steps Z–AC)

- **Z)** Implement with assistance from sub-agents; perform a review yourself AND an independent code review with an independently spawned skeptical **Hephaestus**; execute the Prototype Plan.
- **AA)** Validate the UI, code logic, code structures, data definitions, data models and data flows.
- **AB)** Perform an independently spawned skeptical **Momus** review of each of the results. REPEAT Loop C with new results or findings until the review passes.
- **AC)** Compact memory to begin the next phase.

**Loop D overall rule: be clear for another LLM to follow and gain a shared understanding.**

## LOOP E — "Start LoopE": implement + prove + ship (steps AD–AJ)

- **AD)** Implement with assistance from sub-agents: 1) the code-update plan, 2) the documentation-update plan, and 3) the test-update plan.
- **AE)** Run the tests ensuring all tests pass, ensuring sufficient irrefutable evidence is captured for an adversarial review.
- **AF)** Perform a review yourself and also a code review with an independently spawned skeptical **Hephaestus**.
- **AG)** Update all previous (A–AF) items into mem-palace and codegraph.
- **AH)** Update any remaining markdown files and changelogs as required. Finally: git push; push container images (only if the repo ships containers); deploy the new code and execute it.
- **AI)** SLEEP 30 minutes and GATHER irrefutable evidence that the fixes are applied, then repeat from "Start LoopA". Keep looping until you have **5 EACH** of irrefutable evidence showing: 1) that the fixes are working; 2) that every item in the Audit List is resolved; 3) that every item in the Tools Plan is functional and achieving its objective, with evidence that every item in the Target Matrix is progressing correctly and is validated; 4) that the processing/transfer queue is trending down (actual evidence of the number of finished items/files and total size at the final destination); 5) that source items are arriving at the final destination; 6) that Orphaned files are being processed back to the final destination; 7) that there is no sign of data loss and everything is validated before removal; and 8) that the Target Matrix shows stages progressing for each item in the Items List.
- **AJ)** ONLY THEN verify ALL collected evidence with an adversarial **ORACLE** — ORACLE re-executes the verification scripts and reproduces the artifact hashes; ORACLE reviewing a report is NOT acceptance. When ORACLE says OKAY, run the **5-lane review** (walk every acceptance lane with its captured evidence samples), commit, and write the final report.

**Loop E overall rule: be surgical in changes and clear for another LLM to follow and gain a shared understanding.**

## Anti-patterns that void the run

A claim in any artifact with no evidence_ref · a manual data fix or manual system action · a loop exiting without flushing state · ORACLE passing on a report rather than reproduced artifacts · a repeated ad-hoc command that never became a Tools Plan script · a prior-run item silently absent from this run's Items List · a workflow / State Machine violation or data loss that went unreported · an empty soak-ledger cell or an evidence lane with fewer than 5 captured samples at the ORACLE gate · code changes that contradict past decisions without evidence · a workflow-model binding guessed instead of bound or blocked · a loop started without the Domain Map pre-flight when the Domain Map was missing, stale, or did not cover all systems, workflows and databases in scope · the coordinator impersonating a role or writing product code · a reviewer verdict reported without its report path.

## Delegation surface

Use only names in your current tool list. In omo sessions: `task(subagent_type="oracle"|"metis"|"momus"|…)` or the named role tools; workers via `task(category=…)` (Loop A uses `category="Deep"`) or `call_omo_agent(…)`; research via `call_omo_agent(subagent_type="explore"|"librarian", …)`; team fan-out via `workflow` / `ralph`. In plain DSH sessions, `subagent` / `subagent_fork` are acceptable for generic workers and roles when the omo surface is absent. Collect background results only after a completion notice.

Every child prompt must be self-contained: `TASK`, `DELIVERABLE`, `SCOPE`, `VERIFY`. Require `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. Review lanes are leaf agents: they do their own reading and never spawn sub-reviewers.

## Invariants

- Sub-agent outputs are CLAIMS until verified against the artifacts yourself.
- The coordinator never implements product code: your hands touch only `.omo/` state, dispatch, verdicts, and evidence records.
- Continuation: while `.omo/boulder.json` lists this session and the plan has unchecked boxes, the next turn resumes the loop without asking.
- Every false-green check from Loop A step K requires a negative test (a test that fails when the system is broken) before Loop E can exit.
