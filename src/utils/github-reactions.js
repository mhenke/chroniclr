/**
 * GitHub Reactions API utility for Chroniclr
 * Fetches and processes reaction data from discussions and comments
 */

const core = require('@actions/core');

class GitHubReactionsClient {
  constructor(token) {
    this.token = token || process.env.GITHUB_TOKEN;
    this.baseURL = 'https://api.github.com';
  }

  async fetchWithAuth(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      core.error(`API request failed for ${url}: ${error.message}`);
      throw error;
    }
  }

  async fetchDiscussionReactions(owner, repo, discussionNumber) {
    try {
      // Sanitize owner and repo to allow only valid GitHub names (alphanumeric, -, _)
      const safeOwner = String(owner).replace(/[^a-zA-Z0-9-_]/g, '');
      const safeRepo = String(repo).replace(/[^a-zA-Z0-9-_]/g, '');
      const safeDiscussionNumber = Number(discussionNumber);

      const discussionQuery = `
        query {
          repository(owner: "${safeOwner}", name: "${safeRepo}") {
            discussion(number: ${safeDiscussionNumber}) {
              id
              reactions(first: 100) {
                nodes {
                  content
                  user { login }
                }
                totalCount
              }
            }
          }
        }
      `;
                nodes {
                  content
                  user { login }
                }
                totalCount
              }
            }
          }
        }
      `;
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: discussionQuery })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        core.error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        return { nodes: [], totalCount: 0 };
      }

      const reactions = data.data?.repository?.discussion?.reactions || { nodes: [], totalCount: 0 };
  async fetchCommentReactions(owner, repo, discussionNumber) {
    try {
      // Sanitize owner and repo to allow only valid GitHub names (alphanumeric, -, _)
      const safeOwner = String(owner).replace(/[^a-zA-Z0-9-_]/g, '');
      const safeRepo = String(repo).replace(/[^a-zA-Z0-9-_]/g, '');
      const safeDiscussionNumber = Number(discussionNumber);

      const commentsQuery = `
        query {
          repository(owner: "${safeOwner}", name: "${safeRepo}") {
            discussion(number: ${safeDiscussionNumber}) {
              comments(first: 100) {
                nodes {
                  id
                  body
                  author { login }
                  reactions(first: 50) {
                    nodes {
                      content
                      user { login }
                    }
                    totalCount
                  }
                  replies(first: 50) {
                    nodes {
                      id
                      body
                      author { login }
                      reactions(first: 30) {
                        nodes {
                          content
                          user { login }
                        }
                        totalCount
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
                          content
                          user { login }
                        }
                        totalCount
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: commentsQuery })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        core.error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        return [];
      }

      const comments = data.data?.repository?.discussion?.comments?.nodes || [];
      core.info(`Found ${comments.length} comments to analyze for reactions`);
      return comments;
    } catch (error) {
      core.error(`Failed to fetch comment reactions: ${error.message}`);
      return [];
    }
  }

  processReactionData(reactions) {
    if (!reactions || !reactions.nodes) {
      return {
        totalReactions: 0,
        reactionBreakdown: {},
        engagementScore: 0,
        sentiment: 'neutral',
        controversy: 0
      };
    }

    const reactionBreakdown = {};
    
    reactions.nodes.forEach(reaction => {
      const content = reaction.content;
      reactionBreakdown[content] = (reactionBreakdown[content] || 0) + 1;
    });

    const totalReactions = reactions.totalCount || reactions.nodes.length;
    
    // Calculate engagement score (total reactions normalized)
    const engagementScore = Math.min(totalReactions / 5, 10); // Scale 0-10

    // Calculate sentiment (positive vs negative reactions)
    const positive = (reactionBreakdown.THUMBS_UP || 0) + 
                    (reactionBreakdown.HEART || 0) + 
                    (reactionBreakdown.HOORAY || 0) + 
                    (reactionBreakdown.ROCKET || 0);
    
    const negative = (reactionBreakdown.THUMBS_DOWN || 0) + 
                    (reactionBreakdown.CONFUSED || 0);

    let sentiment = 'neutral';
    if (positive > negative * 2) sentiment = 'positive';
    else if (negative > positive * 2) sentiment = 'negative';

    // Calculate controversy (mixed reactions)
    const controversy = negative > 0 && positive > 0 ? 
      Math.min(negative / positive, positive / negative) : 0;

    return {
      totalReactions,
      reactionBreakdown,
      engagementScore: Math.round(engagementScore * 10) / 10,
      sentiment,
      controversy: Math.round(controversy * 100) / 100,
      positive,
      negative
    };
  }

  async getDiscussionEngagementData(owner, repo, discussionNumber) {
    try {
      core.info(`Fetching engagement data for discussion #${discussionNumber}`);

      const [discussionReactions, comments] = await Promise.all([
        this.fetchDiscussionReactions(owner, repo, discussionNumber),
        this.fetchCommentReactions(owner, repo, discussionNumber)
      ]);

      // Process main discussion reactions
      const mainDiscussion = this.processReactionData(discussionReactions);

      // Process comment reactions
      const commentEngagement = comments.map(comment => {
        const commentData = this.processReactionData(comment.reactions);
        
        // Process reply reactions
        const replies = comment.replies?.nodes || [];
        const replyEngagement = replies.map(reply => ({
          id: reply.id,
          author: reply.author?.login,
          body: reply.body.substring(0, 100),
          ...this.processReactionData(reply.reactions)
        }));

        return {
          id: comment.id,
          author: comment.author?.login,
          body: comment.body.substring(0, 100),
          ...commentData,
          replies: replyEngagement
        };
      });

      // Calculate overall engagement metrics
      const totalEngagement = mainDiscussion.totalReactions + 
        commentEngagement.reduce((sum, c) => sum + c.totalReactions, 0);

      // Find most engaged comments
      const topComments = commentEngagement
        .filter(c => c.totalReactions > 0)
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, 5);

      // Find controversial content (mixed reactions)
      const controversialContent = [
        mainDiscussion.controversy > 0.3 ? { type: 'discussion', ...mainDiscussion } : null,
        ...commentEngagement.filter(c => c.controversy > 0.3)
          .map(c => ({ type: 'comment', ...c }))
      ].filter(Boolean);

      const result = {
        mainDiscussion,
        comments: commentEngagement,
        summary: {
          totalEngagement,
          averageEngagement: totalEngagement / (1 + commentEngagement.length),
          topComments,
          controversialContent,
          overallSentiment: mainDiscussion.sentiment,
          participationLevel: totalEngagement > 10 ? 'high' : totalEngagement > 3 ? 'medium' : 'low'
        }
      };

      core.info(`Engagement analysis complete: ${totalEngagement} total reactions, ${result.summary.participationLevel} participation`);
      return result;

    } catch (error) {
      core.error(`Failed to get engagement data: ${error.message}`);
      return {
        mainDiscussion: this.processReactionData(null),
        comments: [],
        summary: {
          totalEngagement: 0,
          averageEngagement: 0,
          topComments: [],
          controversialContent: [],
          overallSentiment: 'neutral',
          participationLevel: 'none'
        }
      };
    }
  }
}

module.exports = { GitHubReactionsClient };