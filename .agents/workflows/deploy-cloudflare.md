---
description: How to deploy the Next.js app to Cloudflare Pages
---

# Cloudflare Pages Deployment Workflow

This workflow describes how to deploy the `next-app` to Cloudflare Pages using `@cloudflare/next-on-pages`.

## Prerequisites

1. Ensure the GAS (Google Apps Script) is deployed as a Web App and you have the URL.
2. Cloudflare account and `wrangler` CLI logged in.

## Steps

### 1. Build for Cloudflare

Run the build script that generates the `.vercel/output` for Cloudflare.

```bash
cd next-app && npm run pages:build
```

### 2. Local Preview (Optional but recommended)

Verify it works in the Cloudflare local runtime.

```bash
npx wrangler pages dev .vercel/output/static
```

### 3. Deploy to Cloudflare Pages

// turbo
3. Deploy to a new or existing project.

```bash
npx wrangler pages deploy .vercel/output/static --project-name video-library-next
```

## Note for Automation

If you have a GitHub repository, linking it to Cloudflare Pages is recommended for automatic deployments on push.
