// create a task for moving Chroniclr generated docs into \_output/ai-generated-folder-name/

- name: Move AI Generated Docs
  run: |
  mkdir -p \_output/ai-generated
  mv src/\_generated/\*.md \_output/ai-generated/

  // should we have PR discovery as well?

- name: Discover Related PRs
- functionality: PR Discovery uses multiple stragegies to find Jira issues related to a PR if JIRA is enabled
