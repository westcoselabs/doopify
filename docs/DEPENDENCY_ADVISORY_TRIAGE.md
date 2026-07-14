# Dependency Advisory Triage

Reviewed: July 14, 2026

## Safe updates applied

- `next` moved from `16.2.6` to `16.2.10` (same major/minor patch line).
- `@vercel/blob` moved from `2.4.0` to `2.6.1` (compatible v2 range), allowing the lockfile to use `undici@6.27.0`.
- Root overrides pin transitive `undici@6.27.0` and `fast-xml-builder@1.3.0`; both are compatible updates within their existing major lines.

These updates remove the reported production-path advisories for `undici` (via
`@vercel/blob`) and `fast-xml-builder` (via `minio`). They were verified by
the full unit, coverage, integration, migration, browser, and production-build
gates.

## Remaining advisories

- `nodemailer@7.0.13` is a direct production dependency. The available fix is
  `9.0.3`, a major upgrade. It remains a deployment concern because Doopify can
  send SMTP mail. Do not use unreviewed raw-message options; schedule a focused
  Nodemailer v9 compatibility and security pass rather than applying a breaking
  audit fix in this remediation.
- `next`/`postcss` is still reported by the audit metadata after the supported
  `16.2.10` patch update, but the suggested fix is an unrelated older major
  version. No safe automated fix is available; monitor the Next.js advisory and
  update when a supported fixed release is published.
- `prisma` pulls `@prisma/dev`, Hono, and `fast-uri` into the local tooling
  graph. These are Prisma CLI/dev-server dependencies, not Doopify request
  handlers. The audit's proposed Prisma replacement is a breaking downgrade,
  so it was not applied. Reassess when Prisma publishes a compatible release.

No `npm audit fix --force` was used.
