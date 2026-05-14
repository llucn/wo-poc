export type AppConfig = {
  cognitoAuthority: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
};

export function loadAppConfig(): AppConfig {
  const cognitoAuthority = process.env.COGNITO_AUTHORITY;
  const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const cognitoClientId = process.env.COGNITO_CLIENT_ID;
  const dbHost = process.env.DB_HOST;
  const dbPortRaw = process.env.DB_PORT;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;

  const missing: string[] = [];
  if (!cognitoAuthority) missing.push('COGNITO_AUTHORITY');
  if (!cognitoUserPoolId) missing.push('COGNITO_USER_POOL_ID');
  if (!cognitoClientId) missing.push('COGNITO_CLIENT_ID');
  if (!dbHost) missing.push('DB_HOST');
  if (!dbPortRaw) missing.push('DB_PORT');
  if (!dbUser) missing.push('DB_USER');
  if (dbPassword === undefined) missing.push('DB_PASSWORD');
  if (!dbName) missing.push('DB_NAME');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const dbPort = Number(dbPortRaw);
  if (Number.isNaN(dbPort)) {
    throw new Error(`Invalid DB_PORT: ${dbPortRaw} (must be a number)`);
  }

  return {
    cognitoAuthority: cognitoAuthority as string,
    cognitoUserPoolId: cognitoUserPoolId as string,
    cognitoClientId: cognitoClientId as string,
    db: {
      host: dbHost as string,
      port: dbPort,
      user: dbUser as string,
      password: dbPassword as string,
      name: dbName as string,
    },
  };
}
