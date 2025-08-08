# /update-changelog Command

Update the project changelog based on release discussions or version information.

## Usage
```
/update-changelog [version] [discussion-url]
```

## Parameters
- `version` (required): Version number (e.g., 1.2.0, v2.1.3)
- `discussion-url` (optional): URL to release discussion or changelog source

## Description
This command updates the project changelog with new version information including:

- Added features and enhancements
- Changed functionality and breaking changes
- Fixed bugs and issues
- Security updates and patches
- Deprecated and removed features

## Examples
```
/update-changelog 1.5.0
/update-changelog v2.0.0 https://github.com/owner/repo/discussions/789
```

## Implementation
1. If discussion URL provided, fetch and analyze release notes
2. If no URL, prompt for version changes interactively
3. Parse existing changelog to maintain format consistency
4. Generate new version entry using Changelog template
5. Update `CHANGELOG.md` or create `docs/changelogs/CHANGELOG-v{version}.md`

## Output
- Updates main changelog file
- Creates version-specific changelog if configured
- Follows Keep a Changelog format
- Maintains semantic versioning compliance