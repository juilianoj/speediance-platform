// Phase 0.3 wires up the admin invite flow and the JWT validation for Lambda.
// Phase 0.2 creates the empty pool + a single client so the Web stack can
// reference IDs and the Api stack can install a JWT authorizer.

export function Auth() {
  const userPool = new sst.aws.CognitoUserPool('UserPool', {
    usernames: ['email'],
    transform: {
      userPool: {
        // Invite-only platform — no public signup.
        adminCreateUserConfig: {
          allowAdminCreateUserOnly: true,
        },
        autoVerifiedAttributes: ['email'],
      },
    },
  });

  const userPoolClient = userPool.addClient('Web');

  return { userPool, userPoolClient };
}

export type AuthStack = ReturnType<typeof Auth>;
