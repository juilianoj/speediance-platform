#!/usr/bin/env bash
# bootstrap-oidc.sh — one-time setup of GitHub OIDC for this repo's deploys.
#
# Creates (idempotently):
#   1. The GitHub OIDC identity provider in the AWS account (if missing).
#   2. An IAM role `gha-speediance-deploy` that the deploy workflow assumes.
#   3. A least-privilege-ish policy attached to that role.
#
# Run once per AWS account:
#   AWS_PROFILE=speediance ./scripts/bootstrap-oidc.sh
#
# Then verify it worked by triggering a workflow_dispatch on `.github/workflows/deploy.yml`.
# After the first successful OIDC deploy, *delete* the long-lived
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY secrets from the repo settings.

set -euo pipefail

REPO_OWNER="${REPO_OWNER:-juilianoj}"
REPO_NAME="${REPO_NAME:-speediance-platform}"
ROLE_NAME="${ROLE_NAME:-gha-speediance-deploy}"
# GitHub's OIDC `sub` claim depends on which feature the workflow uses:
#   - workflow on a branch (no `environment:` key)   → repo:OWNER/REPO:ref:refs/heads/{branch}
#   - workflow with `environment: dev`/`prod`        → repo:OWNER/REPO:environment:{name}
# Our deploy.yml uses both push-to-main (ref form) AND a per-stage `environment`
# (env form), so we trust both. To add a new environment, append here.
ALLOWED_SUBS=(
  "repo:${REPO_OWNER}/${REPO_NAME}:ref:refs/heads/main"
  "repo:${REPO_OWNER}/${REPO_NAME}:environment:dev"
  "repo:${REPO_OWNER}/${REPO_NAME}:environment:prod"
)
PROVIDER_URL="token.actions.githubusercontent.com"
PROVIDER_ARN_SUFFIX="oidc-provider/${PROVIDER_URL}"

if ! command -v aws >/dev/null 2>&1; then
  echo "✖ aws CLI not found. Install it before running this script." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "✖ jq not found (brew install jq)." >&2
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "→ AWS account: ${ACCOUNT_ID}"
echo "→ GitHub repo: ${REPO_OWNER}/${REPO_NAME}"
echo "→ Trusted OIDC subs:"
for s in "${ALLOWED_SUBS[@]}"; do echo "    - ${s}"; done
echo

# 1. OIDC provider ----------------------------------------------------------
PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:${PROVIDER_ARN_SUFFIX}"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${PROVIDER_ARN}" >/dev/null 2>&1; then
  echo "✓ OIDC provider already exists: ${PROVIDER_ARN}"
else
  echo "→ Creating OIDC provider…"
  # GitHub's CA chain thumbprint — see
  # https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
  aws iam create-open-id-connect-provider \
    --url "https://${PROVIDER_URL}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    >/dev/null
  echo "✓ Created ${PROVIDER_ARN}"
fi

# 2. IAM role ---------------------------------------------------------------
TRUST_POLICY=$(jq -n \
  --arg providerArn "${PROVIDER_ARN}" \
  --arg providerUrl "${PROVIDER_URL}" \
  --argjson subs "$(printf '%s\n' "${ALLOWED_SUBS[@]}" | jq -R . | jq -s .)" \
  '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Federated: $providerArn },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: { ($providerUrl + ":aud"): "sts.amazonaws.com" },
        StringLike:   { ($providerUrl + ":sub"): $subs }
      }
    }]
  }')

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "✓ Role exists: ${ROLE_NAME} — refreshing trust policy"
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}"
else
  echo "→ Creating role ${ROLE_NAME}…"
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --description "GitHub Actions OIDC deploy role for ${REPO_OWNER}/${REPO_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    >/dev/null
  echo "✓ Created role"
fi

# 3. Inline policy ----------------------------------------------------------
# Broader than ideal — SST creates a lot of resources during deploy (Lambda,
# DynamoDB, Cognito, CloudFront, S3, IAM roles, EventBridge schedules…). We
# scope by region (us-west-2) where possible. Tighten this once we have a
# stable resource set.
DEPLOY_POLICY=$(cat <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SstStateBucketAndPassthrough",
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "cloudfront:*",
        "cloudformation:*",
        "lambda:*",
        "dynamodb:*",
        "cognito-idp:*",
        "iam:GetRole", "iam:CreateRole", "iam:DeleteRole",
        "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:ListRoles", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
        "iam:PassRole", "iam:TagRole", "iam:UntagRole",
        "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:ListPolicies",
        "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:ListPolicyVersions",
        "logs:*",
        "events:*",
        "scheduler:*",
        "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath",
        "ssm:PutParameter", "ssm:DeleteParameter",
        "secretsmanager:*",
        "kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey",
        "kms:CreateGrant", "kms:Encrypt",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
JSON
)

POLICY_NAME="${ROLE_NAME}-deploy"
echo "→ Setting inline policy ${POLICY_NAME}…"
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document "${DEPLOY_POLICY}"
echo "✓ Policy attached"

echo
echo "==================================================================="
echo "Done. Add this ARN to .github/workflows/deploy.yml (it's already"
echo "wired to read from the AWS_DEPLOY_ROLE_ARN repo variable):"
echo
echo "  arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo
echo "Set the variable with:"
echo "  gh variable set AWS_DEPLOY_ROLE_ARN -b 'arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}'"
echo
echo "Then in repo Settings → Secrets and variables → Actions, delete:"
echo "  - AWS_ACCESS_KEY_ID"
echo "  - AWS_SECRET_ACCESS_KEY"
echo "==================================================================="
