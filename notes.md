# Chroniclr Documentation Generator

## Module-Specific Document Types

Chroniclr generates different types of documentation based on the module being used:

### Discussion Module

- **summary** - Project overview, objectives, current status
- **initiative-brief** - Problem statement, solution approach, timeline
- **meeting-notes** - Agendas, decisions, action items
- **changelog** - Version history, features, fixes

### Jira Module

- **sprint-report** - Current sprint progress and metrics
- **epic-summary** - Epic overview and contained stories
- **project-dashboard** - Project-level reporting and status

### Pull Request Module

- **release-notes** - Version release documentation
- **change-impact-report** - Analysis of code changes

### Correlation Module

- **feature-completion** - Cross-platform feature status tracking

## Template Locations

All document templates are stored in `src/templates/` directory with standard variable syntax:

- `{title}`, `{date}`, `{discussionNumber}` - Basic metadata
- `{participants}`, `{stakeholders}` - People involved
- `{objectives}`, `{decisions}`, `{actionItems}` - Content sections

## Workflow Integration

Configure module usage in GitHub Actions workflow:

```yaml
uses: actions/github-script@v7
with:
  # Select modules via workflow_dispatch
  USE_MODULES: ${{ github.event.inputs.use || 'discussion,ai' }}
```

### Running the Workflow Manually

You can trigger the workflow with specific modules using GitHub CLI:

```bash
# Run workflow with Jira and Discussion modules for discussion #1
gh workflow run chroniclr.yml -f discussion_number=1 -f use=jira,discussion

# Run workflow with all modules for discussion #42
gh workflow run chroniclr.yml -f discussion_number=42 -f use=jira,discussion,pr,correlation,ai

# Run workflow with just AI document generation
gh workflow run chroniclr.yml -f discussion_number=123 -f use=ai
```

## Running Locally

Test document generation with specific module:

```bash
DOC_TYPE=summary DISCUSSION_NUMBER=123 npm run generate-document
```

For more information, see [README.md](README.md) and [CLAUDE.md](CLAUDE.md).
