# Chroniclr - Development Prompts

## Project Setup Complete ✅

The Chroniclr system is now fully implemented with:
- GitHub Actions workflow
- Claude Code agents and templates  
- Node.js utilities for workflow support
- Complete documentation

## Development Prompts

Use these prompts for extending and customizing Chroniclr:

## Enhancement Prompts

### Document Generation Engine
```
"Build the core document processor that can:
1. Parse GitHub discussion JSON data
2. Extract key information (objectives, stakeholders, timeline)
3. Apply document templates with intelligent content generation
4. Handle multiple output formats (markdown, HTML)
5. Include error handling and validation

Create this as a modular Node.js system that Claude Code can orchestrate."
```

### GitHub Integration
```
"Create the GitHub integration components:
1. Webhook handler for discussion events  
2. GitHub API client for fetching discussion data
3. Automatic PR creation for generated documents
4. Comment posting with document summaries
5. Integration with existing issue/PR workflows

Focus on reliability and proper error handling."
```

### Smart Context Gathering
```
"Build an intelligent context system that:
1. Analyzes related issues, PRs, and commits
2. Identifies relevant stakeholders from Git history
3. Extracts technical requirements from code changes
4. Builds comprehensive project timelines
5. Suggests document improvements based on patterns

This should enhance the quality of generated documentation."
```

### Template Enhancement
```
"Improve the document templates with:
1. Conditional sections based on project type
2. Dynamic stakeholder identification
3. Automatic cross-referencing between documents  
4. Version history tracking
5. Custom formatting options for different audiences

Make the templates intelligent and adaptive."
```

### Testing & Validation
```
"Create a comprehensive testing system:
1. Unit tests for document processing logic
2. Integration tests with mock GitHub data
3. End-to-end workflow testing
4. Document quality validation
5. Performance benchmarks

Include sample test data and automated test runs."
```

## Quick Start Commands

After setup, use these commands in Claude Code:

```bash
# Process a specific discussion
/process-discussion https://github.com/owner/repo/discussions/123

# Generate documentation for current project state
/generate-docs

# Update all existing documentation
/update-docs

# Create a new document type
/new-template initiative-brief

# Review and improve existing documents  
/review-docs
```

## Pro Tips

1. **Start Simple**: Begin with basic summary generation, then add complexity
2. **Use Real Data**: Test with actual GitHub discussions from your projects  
3. **Iterate Fast**: Use Claude Code's conversation continuity with `--continue`
4. **Template First**: Perfect your document templates before automating
5. **Monitor Quality**: Review generated documents and refine prompts accordingly

The system will learn your preferences and improve over time through iterative development with Claude Code!
