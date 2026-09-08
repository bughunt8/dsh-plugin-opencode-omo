# Contributing

This fork maintains stock-Harness compatibility and both standalone and dsh-env
installation. Keep changes focused and preserve upstream attribution.

## Local development

Use Node.js 24 and Python 3.10+. From an existing checkout:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm run test:install
```

Commit source, tests and `package-lock.json`; do not commit `node_modules`, generated
`lib`, credentials, local profiles or test workspaces. The npm lockfile is
authoritative for this fork. Do not regenerate an unrelated local pnpm lockfile.

## Pull requests

Explain the problem, compatibility impact and exact verification performed.
Installer changes need empty-home, repeated-install, conflict and removal tests.
Tool changes need schema/execution tests and checks that other presets and
read-only roles remain isolated. Add regression coverage rather than weakening
assertions to accept a failure.

Use temporary HOME/DSH_HOME for live tests and a deterministic local model.
Never validate against someone else's live credentials or session store.
Report untested behavior explicitly. Check fork-specific UI behavior as well as
upstream tests before preparing a release.

## Release process

Build and test from the intended revision, run standalone packed-install and
dsh-env full-stack checks, then produce `npm pack --ignore-scripts`. Inspect its
file inventory, public declarations and attribution; record the artifact hash
and source revision. Resolve the license-notice gap in NOTICE.md before claiming
unrestricted redistribution. Update CHANGELOG.md and publish only the reviewed
artifact. Do not use a moving Git branch as an immutable release identity.
