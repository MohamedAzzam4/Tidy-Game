#!/usr/bin/env bash
# Push the two v3 checkpoint branches to the Tidy-Game repo.
# Usage:  ./push_v3_checkpoints.sh            (reuses token in .secrets/askpass.sh)
#         NEW_GITHUB_TOKEN=<token> ./push_v3_checkpoints.sh   (updates token first)
# Never echoes the token; only exit codes and redacted output.
set -euo pipefail
cd /home/z/my-project

# 1) optionally refresh the stored token
if [ -n "${NEW_GITHUB_TOKEN:-}" ]; then
  umask 077
  cat > .secrets/askpass.sh <<EOF
#!/usr/bin/env bash
case "\$1" in
  Username*) echo "mohamedazzam4" ;;
  Password*) echo "${NEW_GITHUB_TOKEN}" ;;
esac
EOF
  chmod 700 .secrets/askpass.sh
  unset NEW_GITHUB_TOKEN
fi

[ -x .secrets/askpass.sh ] || { echo "missing .secrets/askpass.sh" >&2; exit 1; }
export GIT_ASKPASS=/home/z/my-project/.secrets/askpass.sh
export GIT_TERMINAL_PROMPT=0
REPO=https://github.com/mohamedazzam4/Tidy-Game.git

# 2) verify the credential before pushing (clear error instead of a cryptic git failure)
TOKEN=$(sed -n 's/.*Password\*) echo "\(.*\)".*/\1/p' .secrets/askpass.sh | head -1)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" https://api.github.com/user)
if [ "$CODE" != "200" ]; then
  echo "TOKEN INVALID (GitHub API /user -> HTTP $CODE). Generate a new fine-grained PAT:"
  echo "  GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained"
  echo "  Repository access: mohamedazzam4/Tidy-Game; Permissions: Contents -> Read and write"
  echo "  Then rerun:  NEW_GITHUB_TOKEN=<new token> $0"
  exit 2
fi
echo "token verified (HTTP 200)"

# 3) push the checkpoints, each on its own branch
#    v3-planning = efd7225 (spec/plan/tasks/review)
#    v3-fixes    = HEAD    (playtest fixes build; includes this helper)
PLANNING=$(git rev-parse --short efd7225)
FIXES=$(git rev-parse --short HEAD)
echo "pushing v3-planning ($PLANNING) and v3-fixes ($FIXES)..."
git push "$REPO" efd7225:refs/heads/v3-planning HEAD:refs/heads/v3-fixes 2>&1 \
  | sed -E 's#github_pat_[A-Za-z0-9_]+#[TOKEN]#g'

# 4) confirm both branches landed
echo "--- remote check ---"
git ls-remote "$REPO" refs/heads/v3-planning refs/heads/v3-fixes \
  | awk '{print substr($1,1,7), $2}'
echo "done"
