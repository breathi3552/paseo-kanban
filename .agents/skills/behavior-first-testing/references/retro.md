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
