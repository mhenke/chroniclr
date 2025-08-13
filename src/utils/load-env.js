const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function loadEnv() {
  // Load .env file if it exists
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    console.log('Loading environment from .env file');
    dotenv.config({ path: envPath });
  }
  // Warn if required variables are missing
  const requiredEnvVars = [
    'JIRA_BASE_URL',
    'JIRA_USER_EMAIL',
    'JIRA_API_TOKEN',
    'JIRA_PROJECT',
  ];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ Missing environment variables: ${missing.join(', ')}`);
  }
}

module.exports = loadEnv;
