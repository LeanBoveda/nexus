declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    NEXO_BOOTSTRAP_CODE?: string;
  }
}
