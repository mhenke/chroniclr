# Generate Documentation

Generate comprehensive documentation for the current project state based on all available discussions, issues, and project context.

## Usage
`/generate-docs [document-type]`

## Options
- `summary` - Generate project overview and current status
- `roadmap` - Create project roadmap from planned issues and discussions  
- `architecture` - Generate technical architecture documentation
- `onboarding` - Create new team member onboarding guide
- `all` - Generate all document types (default)

## Examples  
- `/generate-docs` - Generate all documentation
- `/generate-docs summary` - Generate only project summary
- `/generate-docs roadmap` - Create project roadmap

## What it does:
1. Scans repository for discussions, issues, and PRs
2. Analyzes project structure and codebase  
3. Identifies key stakeholders and contributors
4. Generates comprehensive documentation set
5. Creates organized documentation structure
6. Updates existing documents or creates new ones

## Output
- Complete documentation in `docs/` directory
- Updated README if needed  
- Cross-referenced document links
- Generated table of contents