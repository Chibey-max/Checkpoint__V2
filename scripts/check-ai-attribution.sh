#!/usr/bin/env bash
# Team rule: no AI tool or agent is credited as an author or co-author.
# Fails if a commit message (a file, or every commit in a git range) carries a
# Co-Authored-By trailer or a "Generated with" line for an AI tool.
#   scripts/check-ai-attribution.sh --file .git/COMMIT_EDITMSG   (commit-msg hook)
#   scripts/check-ai-attribution.sh --range origin/main..HEAD   (CI)
set -euo pipefail
PATTERN='^(co-authored-by:.*(claude|anthropic|copilot|openai|chatgpt|codex|gemini|cursor|devin|codeium|windsurf|tabnine|amazon q|aider|noreply@anthropic\.com))|generated (with|by) .*(claude|copilot|chatgpt|codex|gemini|cursor|ai)'

check_text() { grep -inE "$PATTERN" || true; }

case "${1:-}" in
  --file)
    hits=$(check_text < "$2")
    if [ -n "$hits" ]; then
      echo "commit-msg: AI attribution is not allowed in this repo (team rule). Remove this line:" >&2
      echo "$hits" >&2
      exit 1
    fi ;;
  --range)
    bad=0
    for c in $(git rev-list "$2"); do
      hits=$(git log -1 --format=%B "$c" | check_text)
      if [ -n "$hits" ]; then echo "$(git log -1 --format='%h %s' "$c"):"; echo "  $hits"; bad=1; fi
    done
    if [ $bad = 1 ]; then echo "AI co-author or attribution lines found. Reword those commits (git rebase -i) and push again." >&2; exit 1; fi
    echo "no AI attribution in $2" ;;
  *) echo "usage: $0 --file <msg> | --range <a..b>" >&2; exit 2 ;;
esac
