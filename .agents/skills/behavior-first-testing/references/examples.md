# Worked examples

## Locale adaptation

**Promise:** The plugin displays Chinese for either Simplified or Traditional
Chinese upstream language, and English for other languages. It can follow the
system language. An explicit user selection takes precedence over the system.

**Functional boundary:** Supply host settings and system language, load the real
plugin, and inspect its rendered text. A simulated host SDK is acceptable; the
plugin's detection, translation, hooks, and rendering remain real.

One data-driven test can cover representative inputs:

| Upstream selection  | System language                     | Expected plugin text |
| ------------------- | ----------------------------------- | -------------------- |
| Simplified Chinese  | English                             | Chinese              |
| Traditional Chinese | English                             | Chinese              |
| English             | Chinese                             | English              |
| Japanese            | Chinese                             | English              |
| Follow system       | Chinese, with English page defaults | Chinese              |
| Follow system       | English                             | English              |

Use known title or statistics text as the output. A statistics example can also
verify interpolation; it does not require another synthetic formatting example.
Do not stack separate tests of normalization, each source probe, lookup, and
rendering for the same examples.

Live language updates are a separate behavior: change the upstream setting through
the supported host event, then inspect the already-open plugin. State the event
being simulated. An internal override does not prove host-event handling.

For localized validation, perform one representative invalid user action and
inspect the visible error in each supported plugin language. Testing every business
error again is unnecessary unless those errors have independently specified
localization requirements.

## Reusable parser

**Promise:** `parseDuration(text)` returns a duration or a specified error.

The public function is the full functional boundary. Table-driven tests of its
documented syntax and errors are appropriate. There is no reason to mount a UI.
Do not add tests of its tokenizer merely because parsing uses a tokenizer, unless
the tokenizer itself is an independently supported public API.

## Payment idempotency

**Promise:** Retrying the same payment request cannot charge the customer twice.

Two repeated requests and the observed charge count or payment state express a
distinct contract. Keep this protection even if an existing checkout test covers
one successful payment. Different promised outcomes justify separate scenarios;
different helper functions do not.

## Keeping a structural guarantee

Dictionary-key equality can catch omissions that a few rendered examples cannot.
It is a separate quality guarantee, rather than a second proof of locale mapping.
Keep it when that guarantee is wanted, or explicitly acknowledge its removal.
Do not invent a compiler guarantee that the current types do not actually enforce.

## Pending save and a reachable edit

**Promise:** The user must not see a changed task title disappear when a pending
save completes. Confirm the product's intended editing policy before testing it.

Mount the real modal with a pending external save. Inspect whether its title input
is editable, then enter text through that input. Compare the visible value during
the save with the submitted content and the result after completion or failure.
Keep the session and persistence conversion real. This exercises the input,
subscription, draft and save connection; it is not a test of every setter guard.

If the UI disables editing, firing its callback anyway does not demonstrate a user
scenario. A removed internal guard may then be harmless at this boundary. Do not
restore a lower-level test solely because its old assertion detects that change.

## Landing position and an external animation clock

**Promise:** Releasing a dragged card over a valid slot animates it to that slot,
then commits its placement.

Use real card input, target selection and overlay code with known platform layout.
Make the release point differ from the slot. Substitute the platform clock if
needed, while observing the rendered endpoint or the position requested from the
external animation facility. Merely firing completion and checking persistence
does not protect the visible landing position.

A synthetic break that makes the overlay stay at the release point demonstrates
a functional seam failure. It does not justify separate tests for every geometric
helper or require pinning the current spring parameters.

## Mutable inputs and a synthetic corruption

**Promise:** Moving a task preserves its title, description and steps. Observe
the displayed or persisted content after the real move path, or use the API boundary
if that API is independently promised to consumers.

Construct expected content from a fixture captured before the move. Reading a
possibly modified input afterwards can make actual and expected share the same
corruption. This is an assertion-quality issue, not proof that the product must
return new objects. An in-place implementation with identical promised results
is not a regression unless immutability itself is a documented consumer contract.

Arbitrarily poisoning a helper's data is a synthetic probe, not a reported user
bug. Trace its effect through the chosen functional boundary before calling it lost
feature coverage; otherwise reject it as grounds for another defensive test.
