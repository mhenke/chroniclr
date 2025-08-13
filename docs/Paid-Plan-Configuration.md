# GitHub Models Paid Plan Configuration

## Setting Up Your Paid Plan Status

Since you're on the GitHub Models paid plan, you should configure the system to understand your higher rate limits.

### Option 1: Environment Variable (Recommended)

Add this to your GitHub Repository Secrets:

```
GITHUB_MODELS_PAID_PLAN=true
```

### Option 2: Local Development (.env file)

For local testing, add to your `.env` file:

```bash
GITHUB_MODELS_PAID_PLAN=true
```

## What This Changes

### ✅ **With Paid Plan Detection:**

- More appropriate error messages when limits are hit
- Recognition that 429 errors on paid plans are unusual
- Suggestions to check billing dashboard instead of upgrade prompts
- Better troubleshooting guidance

### ❌ **Without Paid Plan Detection:**

- System assumes free tier limits (50 requests/24h)
- Shows upgrade prompts unnecessarily
- Less helpful error messages

## Paid Plan vs Free Tier Limits

| Feature                 | Free Tier           | Paid Plan                     |
| ----------------------- | ------------------- | ----------------------------- |
| **Requests/minute**     | 10                  | Up to 1,000                   |
| **Tokens/minute**       | 8,000 in, 4,000 out | Up to 400,000                 |
| **Concurrent requests** | 2                   | Up to 300                     |
| **Daily limits**        | 50 requests         | Very high/unlimited           |
| **Billing**             | Free                | Pay per token unit ($0.00001) |

## Troubleshooting Paid Plan Rate Limits

If you're still hitting daily limits on the paid plan:

1. **Check Billing Dashboard**: Ensure your paid plan is active
2. **Verify Budget Settings**: Make sure you haven't hit spending limits
3. **Contact GitHub Support**: Daily limits on paid plans are unusual
4. **Monitor Usage**: Check if you're making unexpectedly high API calls

## Current Detection Logic

The system detects daily limits by looking for:

- HTTP Status `429` (Too Many Requests)
- Error text containing `"UserByModelByDay"`

With paid plan detection, you'll get more appropriate guidance when this happens.

---

_Updated: 2025-01-27_  
_Note: Add `GITHUB_MODELS_PAID_PLAN=true` to your secrets to enable paid plan features_
