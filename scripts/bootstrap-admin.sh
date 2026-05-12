#!/usr/bin/env bash
# bootstrap-admin.sh — create the first invite-only user in Cognito and put
# them in the `admin` group. Phase 0.3 adds an in-app invite flow that
# replaces this script for subsequent users; for the very first admin
# (the AWS account owner), this is the bootstrap path.
#
# Usage:
#   AWS_PROFILE=speediance USER_POOL_ID=us-west-2_… \
#     ./scripts/bootstrap-admin.sh you@example.com
#
# What it does (idempotent):
#   1. Creates the `admin` group if it doesn't exist.
#   2. AdminCreateUser with the email (MessageAction=SUPPRESS — no welcome email).
#   3. Prompts for a permanent password and AdminSetUserPassword.
#   4. AdminAddUserToGroup → admin.
#
# What it doesn't do:
#   - Register MFA. Cognito requires MFA enrolment to happen via a signed-in
#     session, which means doing the MFA_SETUP challenge dance after the
#     password is set. The easiest path is the AWS Console:
#       Cognito → User pools → {pool} → Users → {email} → "Multi-factor authentication"
#         → Add MFA → Authenticator app → scan QR with 1Password/Authy
#     Phase 0.3 (admin invite) bakes this into the web UI for new users.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <email>" >&2
  exit 1
fi
EMAIL="$1"

if [ -z "${USER_POOL_ID:-}" ]; then
  echo "✖ USER_POOL_ID must be set (look up via: sst output --stage dev userPoolId)." >&2
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "✖ aws CLI not found." >&2
  exit 1
fi

REGION="${AWS_REGION:-us-west-2}"
GROUP_NAME="admin"

echo "→ Pool:   ${USER_POOL_ID}"
echo "→ Region: ${REGION}"
echo "→ Email:  ${EMAIL}"
echo

# 1. Group ------------------------------------------------------------------
if aws cognito-idp get-group --group-name "${GROUP_NAME}" --user-pool-id "${USER_POOL_ID}" --region "${REGION}" >/dev/null 2>&1; then
  echo "✓ Group '${GROUP_NAME}' exists"
else
  echo "→ Creating group '${GROUP_NAME}'…"
  aws cognito-idp create-group \
    --group-name "${GROUP_NAME}" \
    --user-pool-id "${USER_POOL_ID}" \
    --region "${REGION}" \
    --description "Admin users: can invite others, view admin pages, and bypass cost gates." \
    >/dev/null
  echo "✓ Group created"
fi

# 2. User -------------------------------------------------------------------
if aws cognito-idp admin-get-user --user-pool-id "${USER_POOL_ID}" --username "${EMAIL}" --region "${REGION}" >/dev/null 2>&1; then
  echo "✓ User '${EMAIL}' exists — skipping admin-create-user"
else
  echo "→ Creating user '${EMAIL}'…"
  aws cognito-idp admin-create-user \
    --user-pool-id "${USER_POOL_ID}" \
    --username "${EMAIL}" \
    --user-attributes Name=email,Value="${EMAIL}" Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --region "${REGION}" \
    >/dev/null
  echo "✓ User created"
fi

# 3. Password ---------------------------------------------------------------
echo
echo "Enter a permanent password (≥12 chars, mixed case, number, symbol):"
read -s -r PASSWORD
echo
if [ -z "${PASSWORD}" ]; then
  echo "✖ Password cannot be empty." >&2
  exit 1
fi

aws cognito-idp admin-set-user-password \
  --user-pool-id "${USER_POOL_ID}" \
  --username "${EMAIL}" \
  --password "${PASSWORD}" \
  --permanent \
  --region "${REGION}"
unset PASSWORD
echo "✓ Permanent password set"

# 4. Group membership -------------------------------------------------------
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "${USER_POOL_ID}" \
  --username "${EMAIL}" \
  --group-name "${GROUP_NAME}" \
  --region "${REGION}"
echo "✓ Added to group '${GROUP_NAME}'"

echo
echo "==================================================================="
echo "Almost done — register MFA before first sign-in."
echo
echo "AWS Console path:"
echo "  Cognito → User pools → ${USER_POOL_ID} → Users → ${EMAIL}"
echo "    → 'Multi-factor authentication' → 'Add MFA factor'"
echo "    → Authenticator app → scan QR with 1Password / Authy / Google Auth"
echo
echo "Then sign in at:"
echo "  https://\${WEB_URL}/login   (sst output --stage dev webUrl)"
echo "==================================================================="
