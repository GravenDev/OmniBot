# CLAUDE.md

The guidance for this repository lives in [AGENTS.md](AGENTS.md), which every
agent reads. This file only imports it, so there is a single source to keep up
to date.

It used to be a symlink to `AGENTS.md`. Portainer's git client refuses to clone
a repository containing one — "repository contains a symlink, which is not
allowed for security reasons" — which broke deployment from a git-backed stack.

@AGENTS.md
