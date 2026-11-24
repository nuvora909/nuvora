# Account and billing setup

## Included in this build

- Email/password registration and sign-in; passwords are stored as salted PBKDF2 hashes and sessions use HTTP-only cookies.
- Two free chat answers per account, enforced by the API (not by browser state). The Yogas, Ashtakavarga, and birth-time sensitivity data are withheld from free chart responses; the report view shows a short preview and section explanations until a pass is active.
- Two free Tarot readings per account, enforced on the server. Each reading uses a random 1-, 3-, or 7-card spread plus one extra clarifier; the configured AI reader is used only after per-reading consent.
- One saved Kundli slot is included. Each additional saved chart is a one-time ₹111 add-on in India or £1 in the UK; the account database tracks chart IDs and slot entitlement, while birth details remain in browser storage.
- Prediction language can be English or Hindi when an AI reader is configured. Offline answers remain English and show a notice when Hindi is selected.
- One-time month pass (one calendar month) and annual pass (12 calendar months). Neither renews automatically.
- PayPal Orders API checkout for GBP, including the one-time saved-Kundli add-on. Order totals are selected and verified server-side.
- INR pricing is shown for India, but checkout remains disabled. YouPI-PG is not deployed or reconciled in this environment; do not accept UPI or grant access until a trusted deployment, verified settlement reconciliation, and merchant setup are ready.
- Birth details and Kundli records remain in account-namespaced browser storage, not in the account database. The server stores account-scoped Kundli IDs only to enforce saved-chart slots. Chart calculation requests go to this server. AI processing is opt-in per chart; when enabled, relevant chart context and the user question are sent to the configured AI provider. Chat sessions are process-memory-only today.

## Configure PayPal

Merge the PayPal settings from `.env.example` into the existing server `.env` or set them in the server environment. Do not replace the existing `.env`, because it may contain the astrology reader configuration.

1. Start with `PAYPAL_MODE=sandbox` and sandbox client ID/secret.
2. Run test purchases for both the one-month and annual amounts; confirm cancellation does not grant access and successful captures do.
3. Only after the merchant account and end-to-end testing are ready, set `PAYPAL_MODE=live` and install the live credentials in the server environment.
4. Keep the client secret server-side. Only the client ID is sent to the browser.

PayPal currently does not support INR in its REST payment currency list, and PayPal India cannot receive domestic payments. India checkout is intentionally unavailable until a YouPI merchant service is configured and independently reviewed.

## YouPI-PG integration status

The app has server-side YouPI order creation, raw-body HMAC and timestamp-bound V2 signature validation, delivery-ID deduplication, and account activation only after a matching `RECONCILED` UPI event. An observed bank alert is not payment confirmation. Checkout remains disabled by default (`YOUPI_CHECKOUT_ENABLED=false`) and the required merchant endpoint and secrets are not configured here.

YouPI-PG describes itself as an experimental research project, not a certified or production-ready payment gateway. Do not enable real customer payments solely because the integration code is present. Before any live use, independently review the service and its deployment, confirm requirements with the bank/acquirer and qualified advisers, and test reconciliation, duplicate events, refunds, disputes, and failures. The app must never grant access on browser callbacks or `OBSERVED_SUCCESS`.

## Region detection

When deployed behind a trusted edge that overwrites `CF-IPCountry`, `X-Vercel-IP-Country`, or `CloudFront-Viewer-Country`, set `NUVORA_TRUST_GEO_HEADERS=true`. Restrict direct access to the origin first, so visitors cannot spoof those headers. Otherwise, signup uses the browser-language hint or the country selector, with `NUVORA_DEFAULT_COUNTRY` as the final fallback. No precise GPS location is requested.

## Deployment cautions

- Serve over HTTPS and persist the SQLite file configured by `NUVORA_AUTH_DB`; back it up and keep it outside the static directory.
- The current build does not include email verification or password reset. Privacy and methodology disclosures are available in the UI; review them against the laws and retention duties that apply to your deployment before launch.
- Account deletion is available from Profile. It removes account-scoped records, report entitlements, saved chart references, and cached answers; the browser removes that account's locally saved chart data. Payment processors may retain their own transaction records.
- Digital report access appears in Reports after payment verification. PayPal access follows capture; UPI access follows confirmed bank reconciliation. Publish the exact refund/cancellation policy and a real support email in `NUVORA_REFUND_POLICY_TEXT` and `NUVORA_SUPPORT_EMAIL` before enabling any live checkout. The checkout API and UI remain blocked until both are valid. Refund requests are sent to that published contact with the order details; there is no in-app ticket tracker.
- The refund policy text must state the actual eligibility and request window you intend to honor; it is displayed on both Plans and Reports. Include a clear process for delivery failures and name the support contact. Do not use sample or placeholder wording in production.
- Login throttling is process-local. For a multi-worker or high-volume deployment, use a shared rate limiter and review session/database operations for that topology.
- Keep `.env`, live credentials, and the generated account database out of source control.
