---
name: behavior-first-testing
description: >-
  Use when designing, writing, reviewing, or simplifying automated feature and
  regression tests, especially when test boundaries are unclear or a suite repeats
  checks of implementation steps. Includes requests to 精简测试 or test a complete
  feature from upstream input to observable output. Do NOT use for test runner
  configuration, formatting-only changes, or infrastructure load testing.
---

# Behavior-first testing

Test a feature from its real input to its observable result. Choose the boundary
before choosing test cases. A helper function, branch, or module is not by itself
a reason for another test.

## References

- [Worked examples](references/examples.md): functional boundaries and justified exceptions.
- [Session retrospective](references/retro.md): evidence behind these rules.
- [Evaluation scenarios](evals/evals.json): positive and negative trigger cases and expected decisions.

## Workflow

### 1. Name the behavior

**Action:** State what the user or API consumer provides and what they receive.
Use requirements and observed bugs as the source of expected behavior.

Trace the proposed guarantee from a reachable consumer action, through a real
functional seam, to a promised observable result. A seam connects that action to
its result, such as modal input to persistence or a drop target to animation.
An exported application helper is not automatically a consumer-facing API.

**Key point:** Describe “upstream locale → plugin text,” rather than listing
normalization, detection, dictionary lookup, and rendering as separate features.

**Why:** Those steps can change while the promised behavior stays the same.

### 2. Choose one functional boundary

**Action:** Exercise the actual product path to the promised output. For a UI,
assert rendered text or user-visible effects; for a library, use its public API;
for a service, use its public request and observable response or state change.

**Key points:**

- Use the smallest boundary that exercises the complete behavior. Full browser
  end-to-end testing is not a universal requirement.
- Keep product logic between input and result real. Substitute external services,
  host SDKs, clocks, or platform facilities when necessary for deterministic tests.
- Do not bypass language detection by supplying the expected plugin language,
  then claim to have tested upstream language adaptation.
- Reuse existing fixtures. Avoid building another harness for the same boundary.
- Keep an existing boundary if it already exercises the promise. A more expensive
  UI or CLI harness needs a concrete missing connection to justify replacing it.

**Why:** Separate passing tests for each step can miss broken connections between them.

### 3. Select representative scenarios

**Action:** Put a small set of requirement examples at that boundary. Use a data
table when examples differ only in inputs and expected outputs.

**Key points:**

- Include the reported bug's actual conditions.
- Add a scenario when it expresses another promised outcome. The existence of
  another `if`, field alias, or fallback stage does not establish that need.
- Use independent expected outputs from requirements or known fixtures, not
  values calculated by the implementation being tested.
- Capture expected data before the action can change it. This avoids a self-confirming
  assertion; it does not establish a requirement that input objects stay immutable.
- Separate initialization, live updates, or error handling only when they are
  distinct promised behaviors. Do not multiply every business error by every locale.

**Why:** Several useful examples can belong to one functional test; a smaller
number of `test()` declarations alone does not mean the suite is simpler.

### 4. Apply TDD or simplify existing coverage

**New or changed behavior:** Write the functional test, observe the intended
failure, implement the minimum change, and run the appropriate checks.

**Existing-test refactor:** Passing on the first run is expected when the behavior
already exists. Do not change production behavior just to create a red phase.
Replace repeated layer checks with the functional test and remove obsolete fixtures.
When practical, replay the original bug or break a concrete functional seam in an
isolated copy. Before treating the result as a coverage defect, establish the
reachable consumer action and changed promised output. A surviving internal mutant
or an old test that fails is insufficient. Do not add tests just to kill mutants.

Reject injected scenarios requiring a new action through a disabled control,
impossible state, or direct calls bypassing the real entry path, unless those calls
belong to an independently supported consumer API. If a queued event can still
arrive, demonstrate its real entry and lifecycle rather than assuming a bypass is
reachable. Report unproven reachability as a limitation.

**Scope:** A newly written test is not authorization to add an adjacent feature.
Distinguish a requirement failure from an unrequested capability.

### 5. Review each remaining test

Before adding or retaining another test, answer:

- What promised behavior would lose protection if this test disappeared?
- Can the consumer reach its conditions through the selected real entry path?
- Does the selected functional test already exercise that behavior?
- Does this assert a result, or merely pin an internal call, branch, or helper?
- Is the fixture and execution cost proportionate to the behavior protected?

A separate lower-level test is justified for an independently promised API or
invariant, or when a required scenario cannot be exercised safely, deterministically,
or at reasonable cost through the chosen boundary. Examples include a reusable
parser, numerical accuracy, and a payment's idempotency contract. State the concrete
consumer promise and why that boundary is needed; “different function,” “exported,”
or “the mutation survived” is insufficient. App-internal logic alone is not another
functional contract.

When coverage moves across tests or files, name the surviving scenario and verify
that it observes the same promise. For a promise that holds during an operation,
observe its result then: a captured save request does not prove the live UI stayed
consistent. Replacing an external animation clock must retain its meaningful target
or visible effect; completion alone does not prove arrival at the promised slot.

Structural checks such as schema or dictionary completeness can remain as explicit
quality guarantees. They are not substitutes for functional tests. If pruning drops
a unique guarantee, state that trade-off; do not claim identical coverage.

## Guardrails

| Temptation                                                  | Required decision                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| “Every helper needs its own test.”                          | Start with the functional contract; justify any additional boundary.            |
| “Another branch means another requirement.”                 | Find the promised outcome before adding a case.                                 |
| “All functions pass, so the feature works.”                 | Exercise the connected product path.                                            |
| “Wrap all assertions in one test to simplify it.”           | Remove duplicate checks and setup; retain meaningful scenario diagnostics.      |
| “Fewer tests means faster or equally safe.”                 | Check cost and lost guarantees; counts prove neither.                           |
| “Behavior-first means deleting all unit tests.”             | A library's public function can be the complete functional boundary.            |
| “The new test exposed an opportunity to add a feature.”     | Keep production changes within the authorized behavior.                         |
| “An internal mutation survived, so another test is needed.” | First prove reachable conditions and a violated consumer promise.               |
| “The old test fails, so it must be valuable.”               | Check its observable contract; implementation-only differences may be harmless. |
| “The UI blocks this input, but I can call its callback.”    | Reject the bypass as user-path evidence; justify a supported API separately.    |

## Completion and communication

Explain retained tests in terms of inputs and outcomes, without defending a list
of implementation details. If the user challenges the test boundary, reassess the
whole feature rather than shaving assertions from each layer.

Complete when the chosen scenarios exercise the product path, duplicate checks
and unused fixtures are removed, appropriate checks pass, and any remaining unique
quality guarantees or platform limitations are identified. Report observed results;
do not describe a simulated host test as real host acceptance.
For fault injection, distinguish historical bugs from synthetic seam breaks, and
state the consumer conditions and observed output. Mutation survival alone does not
prove a product defect or justify restoring removed internal checks.
