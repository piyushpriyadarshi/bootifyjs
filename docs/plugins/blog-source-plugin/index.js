/**
 * Custom Docusaurus Plugin: Blog Source from External API
 *
 * This plugin fetches blog posts from your CMS/API at build time
 * and generates markdown files for Docusaurus to process.
 *
 * Configure your API endpoint in docusaurus.config.ts
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_OPTIONS = {
  // Your CMS API endpoint
  apiEndpoint:
    process.env.BLOG_API_ENDPOINT || "https://your-cms.com/api/posts",
  // API key for authentication (optional)
  apiKey: process.env.BLOG_API_KEY || "",
  // Output directory for generated blog posts
  outputDir: "blog",
  // Whether to clear existing posts before fetching
  clearExisting: false,
  // Prefix for generated files to distinguish from manual posts
  filePrefix: "cms-",
  // Enable/disable the plugin
  enabled: process.env.BLOG_CMS_ENABLED === "true",
};

/**
 * Fetch blog posts from your CMS API
 */
async function fetchBlogPosts(options) {
  const { apiEndpoint, apiKey } = options;

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(apiEndpoint, { headers });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    // Adapt this based on your API response structure
    // Expected format: { posts: [...] } or just [...]
    return Array.isArray(data) ? data : data.posts || data.data || [];
  } catch (error) {
    console.error("[blog-source-plugin] Failed to fetch posts:", error.message);
    return [];
  }
}

/**
 * Convert a blog post from your CMS format to Docusaurus markdown
 */
function convertToMarkdown(post) {
  // Adapt these field mappings to match your CMS schema
  const {
    id,
    slug,
    title,
    content,
    excerpt,
    author,
    authors,
    tags = [],
    publishedAt,
    updatedAt,
    image,
    draft = false,
  } = post;

  // Build frontmatter
  const frontmatter = {
    slug: slug || id,
    title,
    ...(authors ? { authors } : author ? { authors: [author] } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(image ? { image } : {}),
    ...(draft ? { draft: true } : {}),
    ...(updatedAt ? { last_update: { date: updatedAt } } : {}),
  };

  // Convert frontmatter to YAML
  const frontmatterYaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: [${value
          .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
          .join(", ")}]`;
      }
      if (typeof value === "object") {
        return `${key}:\n${Object.entries(value)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n")}`;
      }
      return `${key}: ${
        typeof value === "string" && value.includes(":") ? `"${value}"` : value
      }`;
    })
    .join("\n");

  // Build the full markdown content
  let markdown = `---\n${frontmatterYaml}\n---\n\n`;

  // Add excerpt as truncated content if provided
  if (excerpt) {
    markdown += `${excerpt}\n\n<!-- truncate -->\n\n`;
  }

  markdown += content;

  return markdown;
}

/**
 * Generate filename from post data
 */
function generateFilename(post, options) {
  const date = post.publishedAt
    ? new Date(post.publishedAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const slug = post.slug || post.id || "untitled";

  return `${options.filePrefix}${date}-${slug}.md`;
}

/**
 * Main plugin function
 */
module.exports = function blogSourcePlugin(context, options) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    name: "blog-source-plugin",

    async loadContent() {
      if (!opts.enabled) {
        console.log(
          "[blog-source-plugin] Plugin disabled. Set BLOG_CMS_ENABLED=true to enable."
        );
        return { posts: [] };
      }

      console.log("[blog-source-plugin] Fetching blog posts from CMS...");

      const posts = await fetchBlogPosts(opts);

      if (posts.length === 0) {
        console.log("[blog-source-plugin] No posts fetched from CMS.");
        return { posts: [] };
      }

      console.log(
        `[blog-source-plugin] Fetched ${posts.length} posts from CMS.`
      );

      // Generate markdown files
      const outputDir = path.join(context.siteDir, opts.outputDir);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Optionally clear existing CMS-generated posts
      if (opts.clearExisting) {
        const existingFiles = fs.readdirSync(outputDir);
        for (const file of existingFiles) {
          if (file.startsWith(opts.filePrefix)) {
            fs.unlinkSync(path.join(outputDir, file));
          }
        }
      }

      // Write new posts
      for (const post of posts) {
        const filename = generateFilename(post, opts);
        const filepath = path.join(outputDir, filename);
        const markdown = convertToMarkdown(post);

        fs.writeFileSync(filepath, markdown, "utf-8");
        console.log(`[blog-source-plugin] Generated: ${filename}`);
      }

      return { posts };
    },
  };
};
