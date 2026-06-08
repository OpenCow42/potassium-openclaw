# Security Policy

## Supported Branches

Security fixes are handled on `main`.

## Reporting Vulnerabilities

Please report security vulnerabilities privately through GitHub Security Advisories if they are enabled for this repository. If advisories are not available, contact the repository owner through GitHub before opening a public issue.

Do not include Infomaniak bearer tokens, live credentials, or private account data in public issues, pull requests, logs, screenshots, or test fixtures.

## Project Security Expectations

- Keep Infomaniak credentials in `INFOMANIAK_TOKEN` or the configured `tokenEnvName`; never pass `--token` to `pot`.
- Keep mutation tools disabled by default and covered by tests before enabling them in any environment.
- Use fake `pot` binaries in the default test suite; do not call live Infomaniak APIs from CI.
- Treat `pot` as a prebuilt executable discovered on `PATH` or configured through `potPath`.
