// Handle env vars here to avoid handling
// missing env vars in the application code.
// Let's just crash before starting if missing
// values.
const REQUIRED_ENV_VARS = {
  DISCORD_TOKEN: {
    sensitive: true,
  },
  DATABASE_URL: {
    sensitive: true,
  },
  // Required only in development: the guild where core commands are registered
  // instantly instead of globally (see command-loader).
  ...(process.env.NODE_ENV === "development"
    ? { DEV_GUILD_ID: { sensitive: false } }
    : {}),
};

// --- Functions ---

function exitIfMissing(envVarName) {
  const envVar = process.env[envVarName];
  if (envVar === undefined || envVar.length === 0) {
    console.error(`Missing required environment variable '${envVarName}'`);
    process.exit(1);
  }
}

function displayEnvironmentVariables() {
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
