---
'agent-notifier': patch
---

The published npm tarball now ships `README.md`, so npmjs.com renders the project page (heading, install snippet, badges, "How it works", etc.) instead of "no README provided." A `prepack` script in `packages/cli/` copies the repo-root README into the package directory before pack so the source of truth stays in one place.
