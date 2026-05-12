export type AppConfig = {
  cognitoAuthority: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
};

export function loadAppConfig(): AppConfig {
  const cognitoAuthority = process.env.COGNITO_AUTHORITY;
  const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;

  const missing: string[] = [];
  if (!cognitoAuthority) missing.push('COGNITO_AUTHORITY');
  if (!cognitoUserPoolId) missing.push('COGNITO_USER_POOL_ID');
  if (!cognitoClientId) missing.push('COGNITO_CLIENT_ID');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return {
    cognitoAuthority: cognitoAuthority as string,
    cognitoUserPoolId: cognitoUserPoolId as string,
    cognitoClientId: cognitoClientId as string,
  };
}
