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
