# Copilot Instructions for Chroniclr

## Project Architecture

- Chroniclr is an AI-powered documentation and communication automation system, operating exclusively via GitHub Actions and the GitHub Models API (GPT-4o).
- All document generation is triggered by GitHub Actions workflows (`update-docs.yml`). No local CLI or server processes are used in production.
- The system processes four data sources: GitHub Discussions, Issues, Pull Requests, and optionally Jira (if secrets are set).
- Data is collected using simple API clients in `src/utils/` (e.g., `pr-client.js`, `issues-client.js`, `jira-client.js`).
- AI-powered document generation and organization is handled in `src/generators/ai-document-generator.js` using templates from `src/templates/`.
- Generated documents are saved in `generated/YYYY-MM-DD-topic/` folders, with topics determined by AI analysis of content.

## Developer Workflows

- Install dependencies with `npm install`.
- Key npm scripts:
  - `npm run validate-discussion` — Validates discussion data for processing.
  - `npm run process-labels` — Maps discussion labels to document types using `chroniclr.config.json`.
  - `npm run generate-document` — Runs the main AI document generator (requires env vars for source selection).
- To trigger documentation generation, use the GitHub Actions workflow (`update-docs.yml`). Example:
  - `gh workflow run update-docs.yml -f discussion_number=123`
  - See README for more CLI examples.

## Project Conventions & Patterns

- All configuration for production runs is via GitHub Secrets. `.env` is only used for local testing.
- Document templates use `{variableName}` syntax for substitution. Always include a metadata footer referencing the source (e.g., discussion number).
- Label-to-document-type mapping is defined in `chroniclr.config.json`.
- AI generation failures automatically fall back to structured templates.
- Generated folders are named by date and AI-generated topic (not by source type).
- Automatic versioning is used for same-day topic conflicts (e.g., `-2`, `-3`).

## Integration Points

- Jira integration is optional and enabled only if secrets are set. See `src/utils/jira-client.js` and README for details.
- All external API calls are rate-limited and queued using `src/utils/request-queue.js`.
- Pull Request creation for generated docs is handled by the workflow using `peter-evans/create-pull-request`.

## Key Files & Directories

- `.github/workflows/update-docs.yml` — Main automation workflow.
- `src/generators/ai-document-generator.js` — Core AI document generation logic.
- `src/templates/` — Markdown templates for all document types.
- `src/utils/` — API clients and utility modules.
- `chroniclr.config.json` — Label mappings and template configuration.
- `generated/` — Output folder for all generated documentation.

## Production Guidelines

- Keep solutions simple and direct; avoid unnecessary abstraction.
- All error handling and logging should be visible in GitHub Actions output.
- If adding new document types, create a template, update config, and test via workflow.
- Always provide a fallback to templates if AI generation fails.

---

For more details, see README.md and CLAUDE.md. If any conventions or workflows are unclear, ask for clarification or examples from the user.
