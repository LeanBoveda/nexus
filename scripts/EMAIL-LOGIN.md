# Nexo email login

Runtime secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `MAIL_ENCRYPTION_KEY`
(32 random bytes encoded as hex), `EMAIL_SETUP_TOKEN` (32 random bytes as hex).
`GMAIL_SENDER` is the exact authorized sender. Never rotate the encryption key
without reauthorizing Gmail; persisted refresh tokens are AES-GCM encrypted.

Initial setup uses `/api/admin/email/connect?setup=<EMAIL_SETUP_TOKEN>`.
This capability works only before the first Gmail connection. Open it privately,
authorize only the designated sender, and remove the setup secret afterwards.
Further connections require a logged-in platform administrator.
The registered callback is `/api/admin/email/callback` on the production origin.
OAuth requests `openid`, `email`, and `gmail.send`; mailbox reading is not requested.
Google consent-screen Testing mode is not a durable production configuration:
complete the appropriate Google production/personal-use configuration before
relying on unattended delivery. Monitor Gmail limits and revoked/expired grants.

Before connection the existing password login remains available. Once connected,
the login page uses email only and the password POST endpoint is disabled.
No automatic password fallback is enabled on delivery failure. Existing sessions
and coach-created athlete links are preserved.

Email links expire in 15 minutes. The secret is in the URL fragment, removed from
browser history on the confirmation page, and redeemed only on an explicit POST.
Only token hashes are stored. Redemption uses a conditional SQL UPDATE RETURNING.
Account, tenant, athlete status, and email ownership are checked again at redemption.
No general public registration: existing users and uniquely matched active athlete
records are eligible. The explicitly designated admin email can bootstrap its own
platform-only identity after proving mailbox access. Duplicate athlete emails need
manual resolution; no cross-tenant identity is selected arbitrarily.

Tests: `node scripts/test-email-login.mjs` (fresh in-memory SQLite, mocked Gmail).
Also run TypeScript and production build. End-to-end delivery needs the human-owned
Google consent and a real inbox check; mocked tests do not prove deliverability.
