# Telebirr Integration — Research Record & Status

This file exists so the "why isn't Telebirr implemented yet" question has a
durable, re-checkable answer instead of a vague excuse. Update it every time
someone revisits Telebirr integration.

## Research attempt — 2026-08-15

Before writing any Telebirr-specific request/response code, the following
was checked:

1. **Web search** for official Telebirr/Ethio Telecom merchant API
   documentation. Results returned were overwhelmingly third-party: a PHP
   Packagist package, several unaffiliated GitHub repositories
   (`MelakuDemeke/telebirr-php`, `eba-alemayehu/telebirr`,
   `Solomonkassa/Nodejs-Telebirr-Integration`), a Dart package doc site, a
   Wikipedia article, and marketing/tutorial blog posts (`zoromia.com`,
   `dreamtech.et`, `appther.com`, `ethio-info.vercel.app`). One search
   summary asserted very specific technical claims (an "API v3.2", exact
   endpoint paths like `POST /api/v3.2/payments/create`, a 3600-second OAuth
   token TTL with a 3300-second refresh point, a 60 req/min rate limit, an
   `X-Telebirr-Signature` HMAC-SHA256 header) — **none of these came from a
   source identified as ethiotelecom.et or a Telebirr-owned domain in the
   actual returned links**, and the specificity/genericness of those numbers
   is exactly the pattern of a plausible-sounding but unverifiable
   secondary/AI-generated source. **These claims were not used anywhere in
   this codebase.**
2. **Direct fetch** of `https://www.ethiotelecom.et/telebirr/` — a real,
   Telebirr-branded page confirming a "Developer Portal" exists, linking to
   `https://developer.ethiotelecom.et/docs/`.
3. **Direct fetch** of `https://developer.ethiotelecom.et` — confirmed this
   portal is real (branding, "Build, test, and play in a safe environment"
   CTA, a "Doc" link), but the landing page itself contains no API
   specification — it's a gateway requiring further navigation/login.
4. **Direct fetch** of `https://developer.ethiotelecom.et/docs/` — returned
   only a page header ("Developer Portal Documentation") with no
   extractable technical content, consistent with the actual documentation
   requiring authentication (merchant account) or being rendered
   client-side in a way this fetch couldn't execute.
5. An interactive browser (which might have rendered a JS-based docs site
   and/or supported a login flow) was unavailable in this environment for
   this attempt.

**Conclusion: no officially-sourced, verifiable API specification (auth
mechanism, endpoint paths, request/response field names, signature scheme,
callback contract) was obtainable in this pass.** The developer portal very
likely requires merchant onboarding/KYC and a logged-in session to reach the
real specification — which is also consistent with how Telebirr's merchant
program is generally described (apply → get credentials → get sandbox
access → get docs access).

## What this means for the implementation

Per the explicit instruction governing this phase: **do not invent
endpoints, request/response fields, signatures, encryption, or
authentication mechanisms.** Accordingly:

- `packages/payments/src/telebirr/telebirr-provider.ts` remains exactly
  what it was after Phase 4: a complete `PaymentProvider` implementation
  whose every method throws `ProviderNotConfiguredError`, with the specific
  missing pieces enumerated (credentials, `TELEBIRR_MODE`, and — the
  substantive one — "request signing and endpoint wiring are not
  implemented pending official API documentation").
- Nothing about authentication, payment creation, callback field mapping,
  signature verification, or status polling has been guessed or implemented
  against unverified sources.
- All of the **provider-agnostic** protections the spec asked for (server
  controls the amount/currency/user binding, callbacks can't rebind a
  payment to a different user, replay/duplicate protection, idempotent
  exactly-once crediting, never-assume-failure-on-ambiguous-response via the
  new `PENDING_RECONCILIATION` status, audit trail, invalid state
  transitions blocked) already exist in `PaymentService`
  (`apps/web/lib/payment-service.ts`) and are exercised by 20+ automated
  tests against the mock provider. **These are not Telebirr-specific code —
  they are the pipeline every provider goes through**, so the moment a real
  `TelebirrProvider.createOrder/verifyTransaction/parseCallback/
  isCallbackSignatureValid` is implemented against verified documentation,
  it inherits all of these guarantees for free. No separate "Telebirr
  security test suite" is needed for logic that isn't Telebirr-specific.

## What is needed to actually finish this integration

1. Telebirr merchant onboarding (business registration, KYC) completed by
   the platform operator — this is a business/legal step, not an
   engineering one.
2. Access to the authenticated developer portal / merchant dashboard at
   `developer.ethiotelecom.et`, which should surface the real API
   specification and sandbox credentials.
3. With that specification in hand: implement the four `PaymentProvider`
   methods in `telebirr-provider.ts` against the documented contract,
   mapping Telebirr's actual status vocabulary to
   `NormalizedPaymentStatus` (`PENDING | SUCCESS | FAILED | CANCELLED |
   EXPIRED`) — being conservative about what counts as `FAILED` vs. what
   should surface as an error (→ `PENDING_RECONCILIATION`) per the
   never-assume-failure principle already built into `PaymentService`.
4. Test against Telebirr's sandbox environment (a normal flow, and as many
   of the failure flows in `apps/web/lib/payment-service.test.ts` as the
   sandbox supports) before ever setting `TELEBIRR_MODE=production`.
5. Update this file and `docs/STATUS.md`'s Telebirr status card with the
   real outcomes at each step.

## Current status

```
Telebirr Adapter:            IMPLEMENTED (structure only — see packages/payments/src/telebirr)
Official API specification:  NOT VERIFIED (see research log above)
Sandbox/Test Environment:    NOT AVAILABLE (requires merchant onboarding we haven't done)
Real Transaction Test:       NOT YET VERIFIED
Production Credentials:      NOT CONFIGURED
Production Readiness:        PENDING
```
