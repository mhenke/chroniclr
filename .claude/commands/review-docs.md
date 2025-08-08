# Review Documentation

Analyze existing documentation quality and suggest improvements based on project changes and best practices.

## Usage
`/review-docs [path] [--format=<output-format>] [--fix-issues]`

## Parameters
- `[path]` - Specific document or directory to review (defaults to all docs)
- `--format=<output-format>` - Output format: `summary`, `detailed`, `json` (default: summary)
- `--fix-issues` - Automatically fix identified issues where possible

## Examples
- `/review-docs` - Review all documentation
- `/review-docs docs/project-summary.md` - Review specific document
- `/review-docs --format=detailed --fix-issues` - Detailed review with auto-fixes

## What it analyzes:
### Content Quality
- **Completeness**: Missing sections or information
- **Accuracy**: Outdated information or broken links
- **Clarity**: Readability and structure issues
- **Consistency**: Style and format consistency across documents

### Project Alignment
- **Current State**: Documentation matches actual project status
- **Stakeholder Updates**: Team changes reflected in documents
- **Technical Changes**: Code changes impact on documentation
- **Process Evolution**: Updated workflows and procedures

### Best Practices
- **Structure**: Proper heading hierarchy and organization
- **Cross-References**: Appropriate linking between documents  
- **Formatting**: Consistent markdown formatting and style
- **Accessibility**: Clear language and inclusive terminology

## Review Output
```
📊 Documentation Review Summary
================================

📁 Documents Analyzed: 12
✅ High Quality: 8
⚠️  Needs Attention: 3  
❌ Issues Found: 1

🔍 Key Findings:
• Project summary outdated (last updated 3 months ago)
• 5 broken links found across documentation
• Stakeholder list missing 2 new team members
• Architecture docs don't reflect recent microservices migration

💡 Recommendations:
• Update project summary with Q4 progress
• Fix broken GitHub issue links in changelog
• Add new team members to stakeholder matrix
• Create microservices architecture overview
```

## Auto-Fix Capabilities
- Update broken internal links
- Fix markdown formatting issues
- Correct spelling and grammar
- Update timestamps and dates
- Refresh stakeholder information from Git history

## Output Options
- **Summary**: High-level overview with key issues
- **Detailed**: In-depth analysis with specific recommendations
- **JSON**: Machine-readable format for integration with other tools
- **Interactive**: Guided review with suggested fixes