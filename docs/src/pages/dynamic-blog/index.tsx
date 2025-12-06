import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import { useEffect, useState } from "react";
import styles from "./blog.module.css";

// Configure your API endpoint
const API_ENDPOINT = "https://your-cms.com/api/posts";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  author: {
    name: string;
    avatar?: string;
  };
  tags: string[];
  publishedAt: string;
  image?: string;
  readingTime?: number;
}

interface ApiResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  pageSize: number;
}

export default function DynamicBlogList(): JSX.Element {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [page]);

  async function fetchPosts() {
    try {
      setLoading(true);
      console.log(
        `Fetching posts from: ${API_ENDPOINT}?page=${page}&pageSize=10`
      );

      const response = await fetch(`${API_ENDPOINT}?page=${page}&pageSize=10`);

      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }

      const data: ApiResponse = await response.json();
      const newPosts = Array.isArray(data) ? data : data.posts || [];

      if (page === 1) {
        setPosts(newPosts);
      } else {
        setPosts((prev) => [...prev, ...newPosts]);
      }

      setHasMore(newPosts.length === 10);
      setError(null);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setError(err instanceof Error ? err.message : "Failed to load posts");
      if (page === 1) {
        setPosts(FALLBACK_POSTS);
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

  return (
    <Layout
      title="News & Updates"
      description="Latest news and updates from BootifyJS"
    >
      <div className={styles.blogContainer}>
        <header className={styles.blogHeader}>
          <h1>News & Updates</h1>
          <p>Latest announcements, tutorials, and updates from the CMS</p>
          <div className={styles.blogNav}>
            <Link to="/blog" className={styles.navLink}>
              📝 Static Blog
            </Link>
            <span className={styles.navLinkActive}>🔄 Dynamic Blog</span>
          </div>
        </header>

        {error && (
          <div className={styles.errorBanner}>
            <p>⚠️ {error}. Showing cached content.</p>
          </div>
        )}

        <div className={styles.postsGrid}>
          {posts.map((post) => (
            <article key={post.id} className={styles.postCard}>
              {post.image && (
                <div className={styles.postImage}>
                  <img src={post.image} alt={post.title} loading="lazy" />
                </div>
              )}
              <div className={styles.postContent}>
                <div className={styles.postMeta}>
                  <span className={styles.postDate}>
                    {formatDate(post.publishedAt)}
                  </span>
                  {post.readingTime && (
                    <span className={styles.readingTime}>
                      {post.readingTime} min read
                    </span>
                  )}
                </div>
                <h2 className={styles.postTitle}>
                  <Link to={`/dynamic-blog/post?slug=${post.slug}`}>
                    {post.title}
                  </Link>
                </h2>
                <p className={styles.postExcerpt}>{post.excerpt}</p>
                <div className={styles.postFooter}>
                  <div className={styles.author}>
                    {post.author.avatar && (
                      <img
                        src={post.author.avatar}
                        alt={post.author.name}
                        className={styles.authorAvatar}
                      />
                    )}
                    <span>{post.author.name}</span>
                  </div>
                  <div className={styles.tags}>
                    {post.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading posts...</p>
          </div>
        )}

        {!loading && hasMore && posts.length > 0 && (
          <div className={styles.loadMore}>
            <button
              onClick={() => setPage((p) => p + 1)}
              className={styles.loadMoreButton}
            >
              Load More Posts
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

// Fallback posts when API is unavailable
const FALLBACK_POSTS: BlogPost[] = [
  {
    id: "1",
    slug: "introducing-bootifyjs",
    title: "Introducing BootifyJS - A Modern Node.js Framework",
    excerpt:
      "We're excited to announce BootifyJS, a modern, declarative Node.js framework built on top of Fastify.",
    author: { name: "Piyush Priyadarshi" },
    tags: ["announcement", "release"],
    publishedAt: "2024-12-01T00:00:00Z",
  },
  {
    id: "2",
    slug: "mastering-dependency-injection",
    title: "Mastering Dependency Injection in BootifyJS",
    excerpt:
      "Learn how to leverage the powerful DI container to build loosely coupled, testable applications.",
    author: { name: "BootifyJS Team" },
    tags: ["tutorial", "architecture"],
    publishedAt: "2024-12-02T00:00:00Z",
  },
];
