# /generate-summary Command

Generate a project summary document from a GitHub discussion.

## Usage
```
/generate-summary [discussion-url]
```

## Parameters
- `discussion-url` (required): Full URL to the GitHub discussion

## Description
This command analyzes a GitHub discussion and generates a comprehensive project summary document including:

- Project overview and objectives
- Current status and progress
- Key stakeholders and participants  
- Recent updates and changes
- Action items and next steps

## Example
```
/generate-summary https://github.com/owner/repo/discussions/123
```

## Implementation
1. Parse the discussion URL to extract repository and discussion number
2. Fetch discussion content using GitHub API
3. Analyze content using the Content Analyzer agent
4. Generate summary document using Summary template
5. Save to `docs/summaries/project-summary-{discussion-number}.md`

## Output
- Creates summary document in docs directory
- Provides link to generated document
- Shows key information extracted from discussion