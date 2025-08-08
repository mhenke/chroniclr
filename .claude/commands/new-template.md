# Create New Template

Create a new document template for a specific document type or use case.

## Usage
`/new-template <template-name> [--type=<base-type>] [--example=<discussion-url>]`

## Parameters
- `<template-name>` - Name for the new template (e.g., "incident-report", "feature-spec")
- `--type=<base-type>` - Base template to extend (summary, brief, changelog, meeting-notes)
- `--example=<discussion-url>` - Example discussion to use for template development

## Examples
- `/new-template incident-report --type=summary`
- `/new-template feature-spec --type=brief --example=https://github.com/org/repo/discussions/42`
- `/new-template quarterly-review`

## What it does:
1. Creates template file in `.claude/templates/`
2. Generates base structure based on type
3. If example provided, analyzes discussion to suggest sections
4. Creates template documentation and usage guide
5. Adds template to configuration files
6. Sets up validation rules for the new template

## Template Structure Created:
```
.claude/templates/
├── <template-name>/
│   ├── template.hbs          # Handlebars template
│   ├── config.yml           # Template configuration
│   ├── validation.js        # Quality validation rules
│   └── README.md            # Usage documentation
```

## Configuration Options
- Required sections and optional sections
- Target audience settings  
- Output format preferences
- Stakeholder role mappings
- Custom template variables

## Output
- New template files created
- Updated template registry
- Usage documentation and examples