#!/usr/bin/env node

/**
 * Validate GitHub discussion data for Chroniclr processing
 * Used by GitHub Actions workflow to ensure discussion has required fields
 */

const core = require('@actions/core');

function validateDiscussion(discussion) {
  const errors = [];

  if (!discussion.number) {
    errors.push('Discussion number is required');
  }
  // Only require number; skip other fields if number is present

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function main() {
  try {
    const discussionData = {
      number: process.env.DISCUSSION_NUMBER,
      title: process.env.DISCUSSION_TITLE,
      body: process.env.DISCUSSION_BODY,
      user: {
        login: process.env.DISCUSSION_AUTHOR,
      },
      html_url: process.env.DISCUSSION_URL,
    };

    const validation = validateDiscussion(discussionData);

    if (!validation.isValid) {
      core.setFailed(
        `Discussion validation failed: ${validation.errors.join(', ')}`
      );
      process.exit(1);
    }

    core.info('Discussion validation passed');
    core.setOutput('validated', 'true');
  } catch (error) {
    core.setFailed(`Validation error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateDiscussion };
