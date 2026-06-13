# Security Policy

## Supported Versions

Security fixes target the current `0.1.x` development line until this package has a broader release policy.

## Reporting a Vulnerability

Report vulnerabilities privately to the repository owner before opening a public issue.

## Credential Handling

- Never store or print Infomaniak bearer tokens.
- Keep Infomaniak credentials in `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not ask users to paste bearer tokens into chat.
- Do not include token values in tests, docs, fixtures, logs, filenames, or tool-result summaries.

## Test Boundary

- Default tests must not call live Infomaniak APIs.
- Use mocked plugin registration and metadata checks.
- Keep mutation tools blocked by default and covered by tests.
