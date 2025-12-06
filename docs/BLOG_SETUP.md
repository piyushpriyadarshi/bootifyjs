# Blog Setup Guide

This documentation site supports two blog modes:

## Option 1: Static Blog (Default - Docusaurus Built-in)

The default Docusaurus blog that uses markdown files in the `/blog` folder.

**Pros:**

- SEO-friendly (pre-rendered HTML)
- Fast page loads
- RSS/Atom feeds built-in
- Works offline

**Cons:**

- Requires rebuild to publish new posts
- Need to commit markdown files to repo

**Files:**

- `blog/*.md` - Blog post markdown files
- `blog/authors.yml` - Author definitions
- `blog/tags.yml` - Tag definitions

## Option 2: Dynamic Blog (Client-Side Fetching)

Custom React pages that fetch posts from your CMS API at runtime.

**Pros:**

- No rebuild needed for new posts
- Publish directly from your CMS
- Real-time updates

**Cons:**

- Slightly slower initial load (API call)
- Less SEO-friendly (content loaded via JS)
- No RSS feeds (unless you build them)

**Files:**

- `src/pages/blog/index.tsx` - Blog list page
- `src/pages/blog/[slug].tsx` - Individual post page
- `src/config/blog.ts` - API configuration

---

## Choosing Your Setup

### Use Static Blog If:

- SEO is critical
- You don't publish frequently
- You want RSS/Atom feeds
- You're okay with rebuild-on-publish workflow

### Use Dynamic Blog If:

- You publish frequently
- You have an existing CMS
- You need real-time updates
- SEO is less critical (or you use SSR)

---

## Switching to Dynamic Blog

To use only the dynamic blog:

1. **Disable static blog** in `docusaurus.config.ts`:

```typescript
presets: [
  [
    'classic',
    {
      // ... other options
      blog: false, // Disable static blog
    },
  ],
],
```

2. **Configure your API** in `src/config/blog.ts`:

```typescript
export const BLOG_CONFIG = {
  apiEndpoint: "https://your-cms.com/api/posts",
  pageSize: 10,
};
```

3. **Delete static blog files** (optional):

```bash
rm -rf blog/
```

---

## API Requirements

Your CMS API should support these endpoints:

### List Posts

```
GET /api/posts?page=1&pageSize=10&status=published
```

Response:

```json
{
  "posts": [
    {
      "id": "1",
      "slug": "my-post",
      "title": "My Post Title",
      "excerpt": "Short description...",
      "content": "Full markdown content...",
      "author": {
        "name": "Author Name",
        "avatar": "https://..."
      },
      "tags": ["tutorial", "typescript"],
      "publishedAt": "2024-12-01T00:00:00Z",
      "image": "/img/post-cover.jpg",
      "readingTime": 5
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 10,
  "hasMore": true
}
```

### Get Single Post

```
GET /api/posts/:slug
```

Response:

```json
{
  "post": {
    "id": "1",
    "slug": "my-post",
    "title": "My Post Title",
    "content": "Full markdown content..."
    // ... same fields as list
  }
}
```

---

## Hybrid Approach

You can also use both:

- Static blog for important, SEO-critical posts
- Dynamic pages for news/updates from CMS

The dynamic pages are at `/blog/` and will override the static blog route.

---

## Improving SEO for Dynamic Blog

For better SEO with the dynamic blog, consider:

1. **Server-Side Rendering (SSR)** - Deploy on Vercel/Netlify with SSR
2. **Pre-rendering** - Use the build-time plugin to generate static pages
3. **Sitemap** - Generate sitemap from your CMS API
4. **Meta tags** - Ensure proper Open Graph tags are set
