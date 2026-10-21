declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    NEXO_BOOTSTRAP_CODE?: string;
    NEXO_PASSWORD_PEPPER?: string;
    GMAIL_CLIENT_ID?: string;
    GMAIL_CLIENT_SECRET?: string;
    GMAIL_SENDER?: string;
    MAIL_ENCRYPTION_KEY?: string;
    EMAIL_SETUP_TOKEN?: string;
  }
}
