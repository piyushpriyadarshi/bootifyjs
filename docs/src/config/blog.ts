/**
 * Blog Configuration
 * 
 * Configure your CMS API endpoint here.
 * This file is used by the dynamic blog pages.
 */

// API Configuration
export const BLOG_CONFIG = {
    // Your CMS API endpoint
    // Examples:
    // - Strapi: 'https://your-strapi.com/api/posts'
    // - WordPress: 'https://your-site.com/wp-json/wp/v2/posts'
    // - Custom: 'https://your-api.com/api/blog/posts'
    apiEndpoint: process.env.REACT_APP_BLOG_API || 'https://your-cms.com/api/posts',

    // Number of posts per page
    pageSize: 10,

    // Enable fallback to static posts when API fails
    enableFallback: true,

    // Cache duration in milliseconds (5 minutes)
    cacheDuration: 5 * 60 * 1000,
};

// API Response Types
export interface Author {
    name: string;
    avatar?: string;
    bio?: string;
    social?: {
        twitter?: string;
        github?: string;
        linkedin?: string;
    };
}

export interface BlogPost {
    id: string;
    slug: string;
    title: string;
    content: string;
    excerpt: string;
    author: Author;
    tags: string[];
    publishedAt: string;
    updatedAt?: string;
    image?: string;
    readingTime?: number;
    draft?: boolean;
}

export interface BlogListResponse {
    posts: BlogPost[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

// API Helper Functions
export async function fetchBlogPosts(page = 1): Promise<BlogListResponse> {
    const { apiEndpoint, pageSize } = BLOG_CONFIG;

    const response = await fetch(
        `${apiEndpoint}?page=${page}&pageSize=${pageSize}&status=published`
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
    }

    const data = await response.json();

    // Normalize response (handle different API formats)
    if (Array.isArray(data)) {
        return {
            posts: data,
            total: data.length,
            page,
            pageSize,
            hasMore: data.length === pageSize,
        };
    }

    return {
        posts: data.posts || data.data || [],
        total: data.total || data.meta?.total || 0,
        page: data.page || page,
        pageSize: data.pageSize || pageSize,
        hasMore: data.hasMore ?? (data.posts?.length === pageSize),
    };
}

export async function fetchBlogPost(slug: string): Promise<BlogPost> {
    const { apiEndpoint } = BLOG_CONFIG;

    const response = await fetch(`${apiEndpoint}/${slug}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Post not found');
        }
        throw new Error(`Failed to fetch post: ${response.status}`);
    }

    const data = await response.json();
    return data.post || data.data || data;
}

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

export async function fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>
): Promise<T> {
    const cached = cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < BLOG_CONFIG.cacheDuration) {
        return cached.data as T;
    }

    const data = await fetcher();
    cache.set(key, { data, timestamp: now });
    return data;
}
