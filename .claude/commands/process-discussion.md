# Process Discussion

Process a specific GitHub discussion and generate appropriate documentation.

## Usage
`/process-discussion <discussion-url>`

## Description
This command takes a GitHub discussion URL and generates relevant documentation based on the discussion content, participants, and context. It automatically detects the appropriate document type and applies the best template.

## Examples
- `/process-discussion https://github.com/owner/repo/discussions/123`
- `/process-discussion https://github.com/myorg/project/discussions/45`

## What it does:
1. Fetches discussion data from GitHub API
2. Analyzes content to determine document type (summary, brief, changelog, etc.)
3. Gathers relevant project context
4. Generates documentation using appropriate template
5. Creates a pull request with the generated document
6. Posts summary comment on the original discussion

## Output
- Generated document in `docs/` directory
- Pull request for review
- Status update on original discussion