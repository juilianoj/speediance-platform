// Phase 0.3 wires up the admin invite flow.
// Phase 0.2 creates the empty pool + a single client so the Web stack can
// reference IDs and the Api stack can install a JWT authorizer.

// SES identity ARN used for Cognito invite / password-reset / MFA emails.
// Must already be verified in us-west-2 (see scripts/bootstrap-ses or
// `aws ses verify-email-identity --email-address jeffjinkc@gmail.com`).
// We could vary this per stage but the same Gmail-based sender works for
// both dev and prod — Cognito's own user-pool isolation handles the rest.
const SES_SENDER = 'jeffjinkc@gmail.com';
const SES_FROM_DISPLAY = 'Speediance Platform';
const AWS_ACCOUNT = '657014345871';
const SES_REGION = 'us-west-2';
const SES_IDENTITY_ARN = `arn:aws:ses:${SES_REGION}:${AWS_ACCOUNT}:identity/${SES_SENDER}`;

// Public sign-in URL embedded in the invite email. Stage-scoped — the prod
// URL is unknown until first deploy, so prod uses a placeholder; after the
// first deploy we update this and redeploy. The dev URL is stable.
const SIGN_IN_URLS: Record<string, string> = {
  dev: 'https://d2wtidficpq5l9.cloudfront.net/login',
  prod: 'https://d13plgksrb5db.cloudfront.net/login',
};

export function Auth() {
  const signInUrl = SIGN_IN_URLS[$app.stage] ?? SIGN_IN_URLS.dev;
  const userPool = new sst.aws.CognitoUserPool('UserPool', {
    usernames: ['email'],
    // TOTP-based MFA (no SMS — cost, SIM-swap risk). Optional per-user:
    // workout data isn't HIPAA-sensitive and the friction of MFA on every
    // sign-in during early dogfooding was rough. Users can still opt in
    // via /profile → Enable MFA. Existing users with MFA already enrolled
    // keep it until they disable it.
    mfa: 'optional',
    softwareToken: true,
    transform: {
      userPool: {
        // Self-service signup: anyone can register at /signup; Cognito
        // emails a 6-digit verification code (via SES, per
        // verificationMessageTemplate). Admin-create still works for
        // back-channel invites from /admin.
        adminCreateUserConfig: {
          allowAdminCreateUserOnly: false,
          // Branded invite email — replaces Cognito's default which looks
          // like phishing. Uses {username} and {####} placeholders (Cognito
          // substitutes email and temp password respectively).
          inviteMessageTemplate: {
            emailSubject: "You're invited to speediance",
            emailMessage: [
              'Hi {username},',
              '',
              "You've been invited to the speediance platform — a private dashboard that pulls your training history from the Speediance app and shows progress, recommendations, and a personal AI coach.",
              '',
              `Sign in: ${signInUrl}`,
              'Temporary password: {####}',
              '',
              "You'll be prompted to set a new password on first sign-in. After that, head to Profile and connect your Speediance account so your training history can sync.",
              '',
              '— Speediance Platform',
            ].join('<br>'),
            // Cognito requires smsMessage even when SMS isn't configured.
            // The invite-template variant must contain BOTH {username} and
            // {####} placeholders or the API rejects it. We never actually
            // send SMS — this is purely to satisfy the platform check.
            smsMessage: 'Hi {username}, your speediance temp password is {####}',
          },
        },
        autoVerifiedAttributes: ['email'],
        // Branded verification / password-reset email. Cognito uses this
        // template whenever it sends a code via email (ForgotPassword and
        // email-attribute verification).
        verificationMessageTemplate: {
          defaultEmailOption: 'CONFIRM_WITH_CODE',
          emailSubject: 'Your speediance verification code',
          emailMessage: [
            'Your speediance verification code is: <strong>{####}</strong>',
            '',
            'It expires in 15 minutes. If you didn&apos;t request this, you can safely ignore the email.',
            '',
            '— Speediance Platform',
          ].join('<br>'),
          // Same Cognito quirk as inviteMessageTemplate: smsMessage must be
          // present even when SMS is not used.
          smsMessage: 'Speediance verification code: {####}',
        },
        // Send Cognito emails (invites, password resets, MFA codes) via
        // SES instead of the default no-reply@verificationemail.com —
        // better deliverability and a branded display name. The SES
        // identity must be verified in us-west-2 before this deploys.
        emailConfiguration: {
          emailSendingAccount: 'DEVELOPER',
          sourceArn: SES_IDENTITY_ARN,
          // The Pulumi/TF resource key is `fromEmailAddress` (not `from`);
          // using `from` fails with "Invalid or unknown key".
          fromEmailAddress: `${SES_FROM_DISPLAY} <${SES_SENDER}>`,
          replyToEmailAddress: SES_SENDER,
        },
        // PLUS tier is required for Cognito Threat Protection (compromised
        // credentials, IP risk scoring). ~$0.05/MAU, so ~$0.25/mo for a
        // family of 5 — well within budget. ESSENTIALS (the default) rejects
        // `userPoolAddOns.advancedSecurityMode: 'ENFORCED'` with
        // FeatureUnavailableInTierException.
        userPoolTier: 'PLUS',
        userPoolAddOns: { advancedSecurityMode: 'ENFORCED' },
        passwordPolicy: {
          minimumLength: 12,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSymbols: true,
          temporaryPasswordValidityDays: 7,
        },
        // Even if the SST app removal policy is "remove" on dev/staging,
        // the user pool stays — losing it loses every enrolled MFA device.
        deletionProtection: 'ACTIVE',
      },
    },
  });

  // Name must be unique across the whole SST app — `Web` collides with the
  // Nextjs site declared in stacks/Web.ts.
  const userPoolClient = userPool.addClient('WebClient', {
    transform: {
      client: {
        // No Hosted UI / OAuth — we authenticate via the Cognito API directly
        // from Next.js (SRP). Forces tokens out of URL fragments and gives us
        // control over token storage (HTTP-only cookie set server-side).
        allowedOauthFlows: [],
        allowedOauthScopes: [],
        allowedOauthFlowsUserPoolClient: false,
        explicitAuthFlows: [
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
          'ALLOW_USER_PASSWORD_AUTH', // permitted only for the admin-invite first-login flow; remove once MFA challenge handshake is in place
        ],
        // Returns generic auth errors instead of "user does not exist" / "wrong password".
        preventUserExistenceErrors: 'ENABLED',
        // Short access/id tokens, longer refresh. Refresh is what the user
        // actually keeps locally; the others rotate constantly.
        accessTokenValidity: 60,
        idTokenValidity: 60,
        refreshTokenValidity: 30,
        tokenValidityUnits: {
          accessToken: 'minutes',
          idToken: 'minutes',
          refreshToken: 'days',
        },
        enableTokenRevocation: true,
        // No PKCE-only flag at the client level (this lives on the app);
        // documenting expectation that the web app must use SRP + refresh.
      },
    },
  });

  return { userPool, userPoolClient };
}

export type AuthStack = ReturnType<typeof Auth>;
