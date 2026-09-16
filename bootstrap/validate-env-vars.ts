// Handle env vars here to avoid handling
// missing env vars in the application code.
// Let's just crash before starting if missing
// values.
//
// Runs under tsx (see the `dev`/`start` scripts), so the single dev-mode
// definition in `#lib/env.js` can be imported instead of duplicating the
// "development" literal here.
import { isDevMode } from "#lib/env.js";

const REQUIRED_ENV_VARS: Record<string, { sensitive: boolean }> = {
  DISCORD_TOKEN: {
    sensitive: true,
  },
  DATABASE_URL: {
    sensitive: true,
  },
  // Required only in development: the guild where core commands are registered
  // instantly instead of globally (see command-loader).
  ...(isDevMode() ? { DEV_GUILD_ID: { sensitive: false } } : {}),
};

// --- Functions ---

function exitIfMissing(envVarName: string): void {
  const envVar = process.env[envVarName];
  if (envVar === undefined || envVar.length === 0) {
    console.error(`Missing required environment variable '${envVarName}'`);
    process.exit(1);
  }
}

function displayEnvironmentVariables(): void {
  console.log(
    "Starting the application with the following environment variables:"
  );

  Object.entries(REQUIRED_ENV_VARS).forEach(([envVarName, { sensitive }]) => {
    const value = sensitive ? "<REDACTED>" : process.env[envVarName];
    console.log(`- ${envVarName} = ${value}`);
  });
}

// --- Code ---

// Exit if any required environment variable is missing
Object.keys(REQUIRED_ENV_VARS).forEach(exitIfMissing);

// Display the environment variables being used
displayEnvironmentVariables();
console.log(); // separation with application logs
