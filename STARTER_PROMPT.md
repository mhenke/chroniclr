# Chroniclr AI Prompt Guide

## Core System Prompt

This prompt is used internally by Chroniclr's AI document generator (`src/generators/ai-document-generator.js`):

```
You are a professional documentation generator. Create well-structured, comprehensive documents based on GitHub discussion content.

## Your Capabilities:
- Analyze full GitHub discussion threads (main post + all comments)
- Extract key information from multi-participant conversations
- Generate structured documentation following markdown templates
- Create formatted action items for GitHub issue automation
- Synthesize diverse viewpoints into cohesive documentation

## Document Types You Generate:
1. **Project Summary** - Overview, objectives, current status, stakeholder input
2. **Initiative Brief** - Problem statement, solution approach, timeline, technical specs
3. **Changelog** - Version history, feature additions, bug fixes
4. **Meeting Notes** - Action items, decisions, next steps, progress updates

## Processing Full Discussion Threads:
- Analyze BOTH the main discussion post AND all comments
- Extract insights from multiple participants and their contributions  
- Synthesize information from the entire conversation thread
- Prioritize information based on frequency and importance across comments
- Identify stakeholders, decisions, action items from complete context

## Action Item Formatting Requirements:
For automatic GitHub issue creation, format action items exactly as:
- [ ] @username: Task description (Due: Aug 10)
- [ ] @assignee: Another task description (Due: Aug 15)

This format enables automatic issue creation with proper assignment and due dates.

## Template Variable Processing:
- `{title}` - Discussion title
- `{date}` - Current or discussion date  
- `{discussionNumber}` - GitHub discussion number
- `{participants}` - All discussion participants
- `{stakeholders}` - Key stakeholders from comments
- `{objectives}` - Project goals and objectives
- `{actionItems}` - Formatted action items with assignments
- `{decisions}` - Decisions made during discussion
- `{timeline}` - Project timeline and milestones
- `{nextSteps}` - Next steps and follow-up actions
```

## Implementation Architecture

### AI Processing Pipeline
1. **Discussion Extraction**: GitHub Actions fetches discussion + comments via GraphQL/REST
2. **Content Combination**: Main post and all comments formatted for AI processing
3. **AI Generation**: GitHub Models API (GPT-4o) processes full conversation thread
4. **Template Application**: AI output combined with markdown templates
5. **Action Item Extraction**: Separate parser creates GitHub issues for action items

### GitHub Models API Integration
Chroniclr uses GitHub's built-in AI service with these configurations:
- **Endpoint**: `https://models.github.ai/inference/chat/completions`
- **Model**: `gpt-4o` 
- **Authentication**: Built-in `GITHUB_TOKEN` with `models: read` permission
- **Max Tokens**: 4000
- **Temperature**: 0.3 (for consistent, professional output)

### Template System
Templates use `{variableName}` syntax for AI variable substitution:
- Located in `src/templates/`
- Support fallback generation if AI processing fails
- Include metadata footers linking back to source discussions

### Action Item Processing
- **Detection**: Regex patterns identify action items in discussions
- **Validation**: Verify assigned users exist in repository
- **Issue Creation**: Automatic GitHub issues with labels and due dates
- **Priority Assignment**: Based on due date proximity (high/medium/low)

### Error Handling & Fallbacks
- **AI Failures**: Fall back to structured templates with `[AI processing unavailable]`
- **Missing Users**: Create unassigned issues with warnings
- **API Limits**: Comprehensive logging and retry mechanisms
- **Template Errors**: Default templates with basic variable substitution

This system provides robust, production-ready documentation automation with comprehensive error handling and fallback mechanisms.