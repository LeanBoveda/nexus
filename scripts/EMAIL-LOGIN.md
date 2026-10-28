# Nexo email login

Runtime secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `MAIL_ENCRYPTION_KEY`
(32 random bytes encoded as hex), `EMAIL_SETUP_TOKEN` (32 random bytes as hex).
`GMAIL_SENDER` is the exact authorized sender. Never rotate the encryption key
without reauthorizing Gmail; persisted refresh tokens are AES-GCM encrypted.

Initial setup uses `/api/admin/email/connect?setup=<EMAIL_SETUP_TOKEN>`.
This capability works only before the first Gmail connection. Open it privately,
authorize only the designated sender, and remove the setup secret afterwards.
Further connections require a logged-in platform administrator.
Exception: `/recuperar-correo` can renew only the already-configured sender via
Google OAuth without a Nexo session. The state binds the existing sender, has a
10-minute TTL and is bound to a secure HttpOnly browser cookie. Callback verifies
the Google-confirmed email and send scope, then conditionally updates that sender's
encrypted refresh token. It never inserts a different sender or issues a Nexo session.
Recovery initiations are rate-limited. Google consent remains a human-owned step.
The registered callback is `/api/admin/email/callback` on the production origin.
OAuth requests `openid`, `email`, and `gmail.send`; mailbox reading is not requested.
Google consent-screen Testing mode is not a durable production configuration:
complete the appropriate Google production/personal-use configuration before
relying on unattended delivery. Monitor Gmail limits and revoked/expired grants.

The login defaults to email and password. First access requests a mailbox link,
then creates a 15-minute restricted `password_setup` session. This session can
only configure the initial password; protected pages and APIs reject it.
Password creation requires matching 10–128-character values, stores a salted
hash, conditionally claims `password_configured_at`, revokes all previous sessions,
and issues a new normal session. Concurrent setup cannot replace the winning password.
Existing users must complete this flow before using password login; existing
normal sessions are preserved. The activation-code bootstrap is still available
only before email is configured. Managed-account random hashes are not usable passwords.
After password creation no further login links are sent or redeemed for that user.
Password recovery is not part of this first-access flow. Gmail authorization must
work for first access; there is no verification bypass on delivery failure.

Email links expire in 15 minutes. The secret is in the URL fragment, removed from
browser history on the confirmation page, and redeemed only on an explicit POST.
Only token hashes are stored. Redemption uses a conditional SQL UPDATE RETURNING.
Account, tenant, athlete status, and email ownership are checked again at redemption.
No general public registration: existing users and matching active athlete records
are eligible. The explicitly designated admin email can bootstrap its own
platform-only identity after proving mailbox access. A verified athlete email can
link multiple profiles across trainers; the athlete chooses a trainer in
`/mis-profesores`, and data remains isolated by profile. Legacy coach invitations
redirect to the login without creating a session or authorizing a global password.
Changing an athlete email revokes that profile's contextual access without disabling
the shared identity or the athlete's profiles with other trainers.

Tests: `node scripts/test-email-login.mjs` (fresh in-memory SQLite, mocked Gmail).
Also run `node scripts/test-password-onboarding.mjs` for the complete first-access
and password flow, session restrictions, one-use race, CSRF and multi-PF routing.
Also run TypeScript and production build. End-to-end delivery needs the human-owned
Google consent and a real inbox check; mocked tests do not prove deliverability.
