# Retrospective: simplifying the plugin's i18n tests

## Evidence and impact

1. After fixing issue #16, the discussion considered each helper, language source,
   and callback path a separate reason for testing. Several rounds of explanations
   and assertion trimming failed to address the user's actual objection.
2. The user clarified the intended boundary: test upstream language through to
   final plugin language in one connected feature test, rather than testing each
   intermediate decision.
3. Commit `9685dbe` replaced ten tests in `test/i18n.test.mjs` with three functional
   groups: initial display, live language changes, and localized validation errors.
   The file shrank from 302 to 113 lines. Existing host fixtures were extracted
   for reuse rather than copied into another harness.
4. In an isolated copy, restoring pre-fix detection made the new functional test
   fail for `system/zh-CN`. With the fix, the complete check passed with 92 tests.
   This provides regression evidence beyond merely counting tests.

## Causes, ordered by impact

| Impact | Cause                                                                                 | Corrective rule and placement                                                 |
| ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| High   | Implementation steps were treated as independent feature contracts.                   | Define the input-to-result boundary first; put this in the test-design skill. |
| High   | Challenges to the boundary were answered by defending individual assertions.          | Reassess the complete feature when the user rejects the decomposition.        |
| Medium | TDD was treated as pressure to add more tests and an adjacent runtime language event. | TDD determines sequencing; requirements determine scope and test boundaries.  |
| Medium | Internal override tests were described too broadly as language-switch coverage.       | Exercise supported host events and name the simulation limits.                |
| Medium | An additional rendering test initially duplicated lower-level checks.                 | Replace redundant layers with the functional test rather than stacking both.  |
| Low    | Large reads and repeated explanations obscured the actual testing decision.           | Read targeted test sections; explain outcomes first.                          |

## Six-category audit

- **Navigation:** Existing host fixtures were discoverable in workspace-panel tests;
  extracting them was enough. No new navigation guide is needed.
- **Automated checks:** Type, lint, format, and package checks already exist. A
  compiler or linter cannot reliably decide the correct behavioral boundary.
  Avoid test-count caps, line-count gates, or coverage targets as proxies.
- **Review standards:** Ask which promised outcome loses protection when a test is
  removed. Require a reason for another test boundary.
- **Steering hygiene:** Keep the main rule in the skill. Do not add the whole
  retrospective to AGENTS.md or record this bug fix as a new architectural decision.
- **Tool economy:** Reuse fixtures and inspect focused snippets. Once required
  checks pass, rerun only for a new change or unresolved concern.
- **Information access:** No missing external information caused the testing
  disagreement. More credentials or upstream access would not have solved it.

## Limits and trade-offs

- The replacement uses a simulated host and React renderer, not a running Paseo
  application. Its language-update test exercises returning focus to the plugin.
- Representative examples do not retain every former guarantee: dictionary-key
  equality, every compatibility alias, and all localized error paths are no longer
  exhaustively checked by this file.
- Broader rendering tests cost more than pure helper assertions. The full suite
  took about 3.9 seconds after the refactor versus about 2.4 seconds before it in
  this session. These are individual observations, not a benchmark. Fewer tests
  and fewer lines are not evidence of lower runtime or identical coverage.

The operational lesson is a better boundary and clearer coverage, not a target
number of tests. No automated behavioral benchmark or blind-agent evaluation of
the new skill has been run; the accompanying scenarios define future evaluation.

## Follow-up: fault injection must justify its boundary

The repository-wide simplification in `ab25808` passed 64 tests. A later review
found internal variants that passed the new tests but failed old assertions.
That comparison was initially treated too broadly as proof of lost protection.
It proves a difference in tests, not that the consumer can reach a broken result.

Rechecking the product connections gave a more precise assessment:

- The task modal leaves title input enabled while saving and routes its changes
  to the real session. In an isolated copy, accepting that edit changed the visible
  title while the captured save retained the original title and completion closed
  the modal. This is a reachable UI-to-save inconsistency, suitable for a functional
  scenario rather than a test for each setter guard.
- Real card release passes its selected target to the real overlay and then to
  the platform animation facility. Breaking that target connection left the
  overlay at the release point instead of the known slot. Landing position is a
  user-visible promise, distinct from successful persistence or callback counts.
- Poisoning task descriptions before a helper call demonstrated that expected
  data read after execution can self-confirm corruption. It did not establish a
  requirement for input-object immutability or a historical user-facing bug.

The first two conclusions came from actual component paths with external storage,
layout and animation timing simulated. They are not real native-host acceptance.
The third supports independent expected values, not another internal defensive
test. Preserving an old assertion or killing more mutants is never the goal.

Put the reachability and consumer-effect gate in the main skill, and keep these
examples here. Do not turn this review into rules requiring tests for every guard,
geometric helper or internal mutation. The evaluation scenarios now include
unreachable UI actions and harmless internal changes; these remain proposed
behavioral evaluations, not a measured blind-agent reliability benchmark.
