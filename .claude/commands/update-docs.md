# Update Documentation

Update all existing Chroniclr-generated documentation to reflect current project state and recent changes.

## Usage
`/update-docs [--force] [--since=<date>]`

## Options
- `--force` - Update all documents regardless of age
- `--since=<date>` - Only update documents based on changes since specified date
- `--dry-run` - Show what would be updated without making changes

## Examples
- `/update-docs` - Update documents that need refreshing
- `/update-docs --force` - Update all documents
- `/update-docs --since=2024-01-01` - Update based on changes since January 1st

## What it does:
1. Identifies documents that need updating based on:
   - New discussions or issues
   - Recent commits or PRs
   - Project structure changes
   - Stakeholder changes
2. Refreshes context and project analysis
3. Regenerates outdated sections
4. Maintains document history and changelog
5. Creates pull request with updates

## Smart Update Logic
- Preserves manual edits and customizations
- Updates only sections that have new information
- Maintains consistent formatting and style
- Cross-references related document updates

## Output
- Updated documentation files
- Pull request with change summary
- Update log showing what was modified