# Intelligent Document Update System

The Chroniclr Document Update System automatically detects and updates documentation based on code changes. It helps maintain accurate and up-to-date documentation with minimal manual effort.

## Overview

This system provides:

1. **Change Detection** - Identifies what documentation needs updating
2. **Smart Updates** - Updates only what's needed while preserving manual edits
3. **Version Tracking** - Monitors document versions and modification history
4. **Impact Analysis** - Assesses how code changes affect documentation

## Components

The document update system consists of these main components:

### Document Update Manager

The core component responsible for:

- Tracking document metadata
- Detecting changes and outdated documentation
- Smart merging of updated content
- Preserving manual edits
- Generating update reports

### File Analyzer Integration

Leverages the existing file analyzer to:

- Analyze code changes from PRs
- Determine impact on documentation
- Identify related documentation files
- Assess documentation effort needed

### Command-Line Interface

Provides a simple CLI interface to:

- Update documents based on PR changes
- Force update all documentation
- Check for outdated documents
- Generate update reports

## How It Works

### Document Registration

When a document is created or modified, it's registered in the document registry with:

- Content hash (for change detection)
- Version number
- Last update timestamp
- Source references
- Topic classifications

### Smart Change Detection

The system detects when documents need updating:

- Based on document age (configurable threshold)
- When related code changes are detected
- When manually requested

### Intelligent Updates

When updating documents, the system:

1. Analyzes the document's structure
2. Preserves sections with manual edit markers
3. Updates auto-generated sections
4. Maintains document history
5. Updates document metadata

### Manual Edit Preservation

The system recognizes manual edits using special HTML comment markers:

```markdown
<!-- manual-edit -->

This content will be preserved during updates.

<!-- preserve -->

<!-- do not update -->

This section will not be modified.

<!-- custom content -->
```

## Usage Examples

### Update Documents Based on a PR

```bash
npm run update-documents -- --pr=123
```

This will:

1. Analyze PR #123 for code changes
2. Identify affected documentation
3. Update relevant documents
4. Generate an update report

### Force Update All Documents

```bash
npm run update-documents -- --force
```

This will update all registered documents regardless of their current status.

### Check What Needs Updating

```bash
npm run update-documents -- --dry-run
```

This shows what documents would be updated without making any changes.

### Update Recent Documents

```bash
npm run update-documents -- --since=2025-01-01
```

This updates only documents affected by changes since January 1st, 2025.

## Configuration

The document update system uses the standard Chroniclr configuration file:

```json
{
  "documents": {
    "outputDir": "docs",
    "updateThreshold": 30,
    "preserveMarkers": [
      "<!-- manual-edit -->",
      "<!-- preserve -->",
      "<!-- do not update -->",
      "<!-- custom content -->"
    ]
  }
}
```

## Integration with Workflows

The document update system integrates with GitHub Actions workflows:

```yaml
- name: Update Affected Documentation
  run: npm run update-documents -- --pr=${{ github.event.pull_request.number }}

- name: Create PR with Documentation Updates
  uses: peter-evans/create-pull-request@v5
  with:
    commit-message: 'docs: update documentation based on PR #${{ github.event.pull_request.number }}'
    title: 'Update documentation for PR #${{ github.event.pull_request.number }}'
    body: 'This PR updates documentation affected by changes in PR #${{ github.event.pull_request.number }}'
    branch: docs-update-pr-${{ github.event.pull_request.number }}
```

## Best Practices

1. **Mark Custom Sections**: Always use comment markers to indicate manually edited sections
2. **Regular Updates**: Schedule regular document updates (e.g., monthly)
3. **PR Integration**: Include document updates as part of your PR workflow
4. **Review Reports**: Always review update reports to catch any issues
