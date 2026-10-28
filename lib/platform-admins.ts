// Explicitly authorized accounts. Mailbox ownership must still be verified by login.
export const PLATFORM_ADMIN_EMAILS = [
  'nexo.cuenta.oficial@gmail.com',
  'leandroboveda@gmail.com',
] as const;

export function isPlatformAdminEmail(email: string) {
  return PLATFORM_ADMIN_EMAILS.some(
    (allowed) => allowed === email.trim().toLowerCase(),
  );
}
