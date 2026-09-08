# Security

The supported integration target is stock Harness 0.1.2-rc.1 on Node.js 24.
Older release combinations and custom patched Harness builds are not covered by
the current compatibility tests.

## Reporting

Use the repository's **Security → Report a vulnerability** form if available.
Do not file exploit details, credentials or private workspace data in a public
issue. If private reporting is unavailable, ask the repository maintainer for
a private reporting channel without posting the sensitive details.

Include the affected version, installation path (standalone or dsh-env), operating
system, minimal reproduction, impact and redacted logs. Do not include API keys,
Harness startup authentication tokens, credential files or private session data.

## Execution boundaries

OMO intentionally exposes local filesystem and shell tools. Only install trusted
artifacts, review enabled tools, and use Harness permission controls. Companion
mutation tools are denied to read-only OMO roles. Missing companion capabilities
must not be mistaken for successful execution.

The standalone installer refuses to overwrite foreign files and managed profile
links. Never bypass that check by deleting another install's data. Update managed
releases through their owning dsh-env installation.
