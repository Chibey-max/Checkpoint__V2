# Rules for AI coding agents in this repo

- **Never add an AI tool or agent as an author or co-author.** That means no `Co-Authored-By: Claude …` (or any other AI) trailer, and no "Generated with …" line in commit messages, PR descriptions, issues or code comments. The team are the authors.
- The `commit-msg` hook and the CI `attribution` job reject commits that carry such lines. `.claude/settings.json` turns Claude Code's attribution off for this repo.
