#!/usr/bin/env bash
# bootstrap-ses.sh — one-time SES setup for bounce + complaint handling.
#
# What this does (all idempotent — safe to re-run):
#   1. Enable SES account-level suppression list for BOUNCE + COMPLAINT.
#      Bounced/complained addresses are auto-added and SES refuses future
#      sends to them. Required by AWS before they grant production access.
#   2. Create the `speediance-platform` SES configuration set if missing.
#   3. Create an SNS topic `speediance-ses-events` for bounce/complaint
#      notifications, and wire SES to publish to it.
#   4. (Optional) Subscribe an email address to the topic so you get
#      notified when a bounce/complaint happens. Pass NOTIFY_EMAIL=...
#      to enable.
#
# Run once per AWS account:
#   ./scripts/bootstrap-ses.sh
#
# To also subscribe yourself to bounce notifications:
#   NOTIFY_EMAIL=jeff@example.com ./scripts/bootstrap-ses.sh
#
# After this completes you'll need to:
#   - Open the AWS SES console → "Request production access"
#   - Reference this account-level suppression + the configuration set as
#     your bounce/complaint handling story
#   - Sending region is us-west-2 (matches the SES_REGION in Auth.ts).

set -euo pipefail

SES_REGION="${SES_REGION:-us-west-2}"
CONFIG_SET="${CONFIG_SET:-speediance-platform}"
SNS_TOPIC_NAME="${SNS_TOPIC_NAME:-speediance-ses-events}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

echo "▶ SES region: ${SES_REGION}"
echo "▶ Configuration set: ${CONFIG_SET}"
echo "▶ SNS topic: ${SNS_TOPIC_NAME}"
echo

# 1. Account-level suppression — global per account+region.
echo "1) Enabling account-level suppression for BOUNCE + COMPLAINT…"
aws sesv2 put-account-suppression-attributes \
  --suppressed-reasons BOUNCE COMPLAINT \
  --region "${SES_REGION}"
echo "   ✓ Suppression enabled"
echo

# 2. Configuration set — idempotent create.
echo "2) Creating configuration set '${CONFIG_SET}' (idempotent)…"
if aws sesv2 get-configuration-set \
  --configuration-set-name "${CONFIG_SET}" \
  --region "${SES_REGION}" >/dev/null 2>&1; then
  echo "   ✓ Already exists"
else
  aws sesv2 create-configuration-set \
    --configuration-set-name "${CONFIG_SET}" \
    --reputation-options ReputationMetricsEnabled=true \
    --sending-options SendingEnabled=true \
    --region "${SES_REGION}"
  echo "   ✓ Created"
fi
echo

# 3. SNS topic + SES event destination.
echo "3) Creating SNS topic '${SNS_TOPIC_NAME}' (idempotent)…"
TOPIC_ARN=$(aws sns create-topic \
  --name "${SNS_TOPIC_NAME}" \
  --region "${SES_REGION}" \
  --query TopicArn --output text)
echo "   ✓ Topic ARN: ${TOPIC_ARN}"

echo "   Attaching SES event destination publishing to SNS…"
EVENT_DEST_NAME="bounces-and-complaints"
if aws sesv2 get-configuration-set-event-destinations \
  --configuration-set-name "${CONFIG_SET}" \
  --region "${SES_REGION}" \
  --query "EventDestinations[?Name=='${EVENT_DEST_NAME}']" \
  --output text | grep -q "${EVENT_DEST_NAME}"; then
  aws sesv2 update-configuration-set-event-destination \
    --configuration-set-name "${CONFIG_SET}" \
    --event-destination-name "${EVENT_DEST_NAME}" \
    --event-destination "Enabled=true,MatchingEventTypes=BOUNCE,COMPLAINT,REJECT,DELIVERY_DELAY,SnsDestination={TopicArn=${TOPIC_ARN}}" \
    --region "${SES_REGION}"
  echo "   ✓ Event destination updated"
else
  aws sesv2 create-configuration-set-event-destination \
    --configuration-set-name "${CONFIG_SET}" \
    --event-destination-name "${EVENT_DEST_NAME}" \
    --event-destination "Enabled=true,MatchingEventTypes=BOUNCE,COMPLAINT,REJECT,DELIVERY_DELAY,SnsDestination={TopicArn=${TOPIC_ARN}}" \
    --region "${SES_REGION}"
  echo "   ✓ Event destination created"
fi
echo

# 4. Optional email subscription.
if [[ -n "${NOTIFY_EMAIL}" ]]; then
  echo "4) Subscribing ${NOTIFY_EMAIL} to ${SNS_TOPIC_NAME}…"
  aws sns subscribe \
    --topic-arn "${TOPIC_ARN}" \
    --protocol email \
    --notification-endpoint "${NOTIFY_EMAIL}" \
    --region "${SES_REGION}" >/dev/null
  echo "   ✓ Subscription created — check ${NOTIFY_EMAIL} and click the AWS confirmation link"
else
  echo "4) Skipping email subscription (set NOTIFY_EMAIL=... to enable)"
fi
echo

cat <<EOF
Done. Next steps:

  1. (If needed) verify the SES sender identity:
     aws ses verify-email-identity --email-address jeffjinkc@gmail.com --region ${SES_REGION}

  2. Open AWS console → SES → "Request production access". When asked:
       - Mail type:           Transactional
       - Website URL:         <your CloudFront URL>
       - Use case:            Self-hosted fitness dashboard. Sends only
                              account verification, password reset, and
                              MFA codes via Cognito → SES.
       - Bounce/complaint:    Account-level suppression list is enabled
                              for BOUNCE + COMPLAINT. Configuration set
                              '${CONFIG_SET}' publishes bounce/complaint
                              events to SNS topic '${SNS_TOPIC_NAME}'
                              for audit + alerting.
       - Mailing list mgmt:   Transactional only — no marketing lists.
       - Compliance:          We do not send to addresses we do not own
                              or that have not signed up.

  3. After deploy, Cognito will pass configurationSet='${CONFIG_SET}' to
     SES when sending invite/verification emails so events flow through
     the destination above.
EOF
