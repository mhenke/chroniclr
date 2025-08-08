# /create-brief Command

Create an initiative brief from a GitHub discussion.

## Usage
```
/create-brief [discussion-url]
```

## Parameters
- `discussion-url` (required): Full URL to the GitHub discussion

## Description
This command analyzes a GitHub discussion and creates an initiative brief document including:

- Problem statement and context
- Proposed solution approach
- Success criteria and acceptance criteria
- Timeline and milestones
- Resource requirements and team members
- Risks and dependencies

## Example
```
/create-brief https://github.com/owner/repo/discussions/456
```

## Implementation
1. Parse discussion URL and fetch content
2. Use Content Analyzer to extract initiative-specific information
3. Identify problem statement, proposed solutions, and requirements
4. Generate brief using Initiative Brief template
5. Save to `docs/initiatives/{initiative-name}-brief.md`

## Output
- Creates initiative brief document
- Extracts timeline and resource information
- Identifies stakeholders and decision makers
- Provides structured approach to initiative planning