# Commercial Bank of Ethiopia (CBE) Integration — Research Record & Status

Companion to `docs/TELEBIRR_INTEGRATION.md` — same discipline applies: no
guessed endpoints, fields, or signature schemes.

## Research attempt — 2026-08-15

A web search for "Commercial Bank of Ethiopia CBE merchant payment API
developer documentation" returned:

- `github.com/topics/cbe` and third-party repos (e.g. `jayvhaile/cbe-verifier`,
  a screenshot-parsing utility — not an official API client).
- CBE's mobile banking apps on the App Store.
- **`merchantapp.cbe.com.et`** — a real CBE-branded login page ("Merchant
  App(Pow. By CBEBirr)"), indicating CBE has a merchant-facing product
  called **CBEBirr** with some kind of merchant application. Attempting to
  fetch this URL directly from this environment failed
  (`ECONNREFUSED` — the host may geo-restrict, rate-limit, or simply not be
  reachable from wherever this sandbox's outbound requests originate).
- No publicly indexed API specification, developer portal, or SDK
  documentation was found for either "CBE" directly or "CBEBirr".
- A separate third-party aggregator, **WeBirr**, was mentioned as offering
  its own payment gateway API/SDK/webhooks — this is a different company,
  not CBE itself, and integrating through an aggregator (vs. CBE directly)
  is a business decision (merchant agreement, fee structure) outside the
  scope of an engineering choice. Noted here for completeness, not acted on.

**Conclusion: unchanged from the original assessment — no official,
publicly accessible CBE merchant/payment API specification exists for this
project to implement against.** `CBEProvider` remains a fully-shaped
`PaymentProvider` implementation with every method failing closed via
`ProviderNotConfiguredError`, and `isConfigured` hardcoded to `false` (there
is no "supply these env vars and it works" path, unlike Telebirr, because
there's no known API to configure credentials against).

## What is needed to actually finish this integration

1. A business decision on integration path: direct CBE/CBEBirr merchant
   agreement, vs. a third-party aggregator (e.g. WeBirr) that already
   integrates with CBE — **this is the "official provider documentation
   requires a business decision" case** flagged as a legitimate reason to
   pause and ask, per project instructions.
2. Whichever path is chosen, obtain the real API/webhook specification from
   that party.
3. Implement `CBEProvider`'s four methods against that specification,
   exactly the same way `TelebirrProvider` is intended to be finished.

## Current status

```
CBE
Adapter: Implemented (structure only)
Official API specification: NOT AVAILABLE — see research log above
isConfigured: hardcoded false (no known credential path yet)
Sandbox: NOT AVAILABLE
Live payment test: NOT YET VERIFIED
Production status: PENDING (blocked on a business decision, not engineering)
```
