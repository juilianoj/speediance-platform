// Phase 0.3 wires up the admin invite flow.
// Phase 0.2 creates the empty pool + a single client so the Web stack can
// reference IDs and the Api stack can install a JWT authorizer.

export function Auth() {
  const userPool = new sst.aws.CognitoUserPool('UserPool', {
    usernames: ['email'],
    // TOTP-based MFA (no SMS — cost, SIM-swap risk). Required for all users
    // since this group holds health/training data for a small known set.
    mfa: 'on',
    softwareToken: true,
    transform: {
      userPool: {
        // Invite-only platform — no public signup.
        adminCreateUserConfig: {
          allowAdminCreateUserOnly: true,
        },
        autoVerifiedAttributes: ['email'],
        // Compromised-credential checking, IP-based risk scoring, etc.
        // Costs ~$0.05/MAU. Worth it for a family of ~5.
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
