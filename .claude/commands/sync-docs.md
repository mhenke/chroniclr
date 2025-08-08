# /sync-docs Command

Synchronize and update all project documentation.

## Usage
```
/sync-docs [options]
```

## Options
- `--force`: Force regeneration of all documents
- `--type=[document-type]`: Only sync specific document types (summary, brief, changelog, notes)
- `--since=[date]`: Only sync documents modified since date (YYYY-MM-DD)
- `--dry-run`: Preview changes without making updates

## Description
This command synchronizes all project documentation by:

- Scanning for recent discussions that need documentation
- Updating existing documents with new information
- Generating missing documentation for labeled discussions
- Cleaning up outdated or duplicate documents
- Updating cross-references and links

## Examples
```
/sync-docs
/sync-docs --type=summary --since=2024-01-01
/sync-docs --force --dry-run
```

## Implementation
1. Scan repository discussions for documentation-related labels
2. Compare last modification times with existing documents
3. Identify discussions needing documentation updates
4. Queue document generation tasks for out-of-date content
5. Execute updates using appropriate agents and templates
6. Generate summary report of changes made

## Output
- Lists all documents updated or created
- Shows statistics on documentation coverage
- Identifies discussions without documentation
- Provides summary of sync operation results