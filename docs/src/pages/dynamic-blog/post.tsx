import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";
import Layout from "@theme/Layout";
import { useEffect, useState } from "react";
import styles from "./post.module.css";

// Configure your API endpoint
const API_ENDPOINT = "https://your-cms.com/api/posts";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  author: {
    name: string;
    avatar?: string;
  };
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  image?: string;
  readingTime?: number;
}

export default function DynamicBlogPost(): JSX.Element {
  const location = useLocation();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const slug = searchParams.get("slug");

  useEffect(() => {
    if (slug) {
      fetchPost(slug);
    } else {
      setError("No post specified");
      setLoading(false);
    }
  }, [slug]);

  async function fetchPost(postSlug: string) {
    try {
      setLoading(true);
      console.log(`Fetching post: ${API_ENDPOINT}/${postSlug}`);

      const response = await fetch(`${API_ENDPOINT}/${postSlug}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Post not found");
        }
        throw new Error("Failed to fetch post");
      }

      const data = await response.json();
      setPost(data.post || data);
      setError(null);
    } catch (err) {
      console.error("Error fetching post:", err);
      setError(err instanceof Error ? err.message : "Failed to load post");
      const fallback = FALLBACK_POSTS.find((p) => p.slug === postSlug);
      if (fallback) {
        setPost(fallback);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <Layout title="Loading...">
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading post...</p>
        </div>
      </Layout>
    );
  }

  if (error && !post) {
    return (
      <Layout title="Post Not Found">
        <div className={styles.error}>
          <h1>Post Not Found</h1>
          <p>{error}</p>
          <Link to="/dynamic-blog" className={styles.backLink}>
            ← Back to News
          </Link>
        </div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout title="Post Not Found">
        <div className={styles.error}>
          <h1>Post Not Found</h1>
          <Link to="/dynamic-blog" className={styles.backLink}>
            ← Back to News
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={post.title} description={post.excerpt}>
      <article className={styles.postContainer}>
        <header className={styles.postHeader}>
          <Link to="/dynamic-blog" className={styles.backLink}>
            ← Back to News
          </Link>

          <div className={styles.tags}>
            {post.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>

          <h1 className={styles.postTitle}>{post.title}</h1>

          <div className={styles.postMeta}>
            <div className={styles.author}>
              {post.author.avatar && (
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className={styles.authorAvatar}
                />
              )}
              <div className={styles.authorInfo}>
                <span className={styles.authorName}>{post.author.name}</span>
                <span className={styles.postDate}>
                  {formatDate(post.publishedAt)}
                  {post.readingTime && ` · ${post.readingTime} min read`}
                </span>
              </div>
            </div>
          </div>

          {post.image && (
            <div className={styles.featuredImage}>
              <img src={post.image} alt={post.title} />
            </div>
          )}
        </header>

        <div
          className={styles.postBody}
          dangerouslySetInnerHTML={{ __html: parseMarkdown(post.content) }}
        />

        <footer className={styles.postFooter}>
          {post.updatedAt && (
            <p className={styles.updatedAt}>
              Last updated: {formatDate(post.updatedAt)}
            </p>
          )}
          <Link to="/dynamic-blog" className={styles.backToBlogs}>
            ← View all posts
          </Link>
        </footer>
      </article>
    </Layout>
  );
}

function parseMarkdown(markdown: string): string {
  return markdown
    .replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>'
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^\- (.*$)/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hpuol]|<li|<pre|<code)(.+)$/gm, "<p>$1</p>");
}

const FALLBACK_POSTS: BlogPost[] = [
  {
    id: "1",
    slug: "introducing-bootifyjs",
    title: "Introducing BootifyJS",
    excerpt: "A modern Node.js framework.",
    content: `## Welcome!\n\nThis is a fallback post shown when the API is unavailable.\n\nConfigure your API endpoint in the source code.`,
    author: { name: "BootifyJS Team" },
    tags: ["announcement"],
    publishedAt: "2024-12-01T00:00:00Z",
    readingTime: 2,
  },
];
