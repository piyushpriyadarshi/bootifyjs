# Blog Source Plugin

A custom Docusaurus plugin that fetches blog posts from your CMS/API at build time.

## Setup

### 1. Enable the Plugin

Add to your `docusaurus.config.ts`:

```typescript
plugins: [
  [
    './plugins/blog-source-plugin',
    {
      apiEndpoint: 'https://your-cms.com/api/posts',
      apiKey: process.env.BLOG_API_KEY,
      enabled: true,
    },
  ],
],
```

### 2. Environment Variables

Create a `.env` file or set these in your CI/CD:

```bash
BLOG_CMS_ENABLED=true
BLOG_API_ENDPOINT=https://your-cms.com/api/posts
BLOG_API_KEY=your-api-key
```

## API Response Format

Your API should return posts in this format:

```json
{
  "posts": [
    {
      "id": "unique-id",
      "slug": "my-blog-post",
      "title": "My Blog Post Title",
      "content": "Full markdown content of the post...",
      "excerpt": "Short summary shown before 'Read more'",
      "author": "piyush",
      "tags": ["tutorial", "typescript"],
      "publishedAt": "2024-12-01T00:00:00Z",
      "updatedAt": "2024-12-02T00:00:00Z",
      "image": "/img/blog/my-post.png",
      "draft": false
    }
  ]
}
```

Or as a simple array:

```json
[
  { "id": "...", "title": "...", ... }
]
```

## Field Mappings

| CMS Field     | Docusaurus Field    | Required      |
| ------------- | ------------------- | ------------- |
| `id`          | Used for filename   | Yes (or slug) |
| `slug`        | URL slug            | No            |
| `title`       | Post title          | Yes           |
| `content`     | Markdown body       | Yes           |
| `excerpt`     | Truncated preview   | No            |
| `author`      | Author ID           | No            |
| `authors`     | Array of author IDs | No            |
| `tags`        | Tag IDs             | No            |
| `publishedAt` | Publish date        | No            |
| `image`       | Social/header image | No            |
| `draft`       | Draft status        | No            |

## Configuration Options

```typescript
{
  // Your CMS API endpoint
  apiEndpoint: 'https://your-cms.com/api/posts',

  // API key for authentication
  apiKey: 'your-api-key',

  // Output directory (relative to site root)
  outputDir: 'blog',

  // Clear existing CMS posts before fetching
  clearExisting: false,

  // Prefix for generated files
  filePrefix: 'cms-',

  // Enable/disable the plugin
  enabled: true,
}
```

## Customizing for Your CMS

Edit `index.js` to adapt the field mappings in `convertToMarkdown()` to match your CMS schema.

### Example: WordPress REST API

```javascript
function convertToMarkdown(post) {
  return {
    slug: post.slug,
    title: post.title.rendered,
    content: post.content.rendered,
    excerpt: post.excerpt.rendered,
    publishedAt: post.date,
    author: post.author,
    tags: post.tags,
  };
}
```

### Example: Strapi

```javascript
function convertToMarkdown(post) {
  const { attributes } = post;
  return {
    slug: attributes.slug,
    title: attributes.title,
    content: attributes.content,
    excerpt: attributes.excerpt,
    publishedAt: attributes.publishedAt,
    author: attributes.author?.data?.attributes?.name,
    tags: attributes.tags?.data?.map((t) => t.attributes.name) || [],
  };
}
```

## Triggering Rebuilds

When you publish a new post in your CMS, trigger a rebuild:

### Vercel

Set up a Deploy Hook and call it from your CMS webhook.

### Netlify

Use Build Hooks to trigger rebuilds.

### GitHub Actions

Trigger a workflow dispatch from your CMS webhook.

Example webhook handler in your CMS:

```javascript
// When a post is published
await fetch("https://api.vercel.com/v1/integrations/deploy/xxx", {
  method: "POST",
});
```

## Local Development

For local testing, you can mock the API:

```bash
# Start a mock server
npx json-server --watch mock-posts.json --port 3001

# Set environment
BLOG_API_ENDPOINT=http://localhost:3001/posts npm start
```
