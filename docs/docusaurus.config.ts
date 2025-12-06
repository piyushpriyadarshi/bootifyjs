import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'BootifyJS',
  tagline: 'A Modern, Declarative Node.js Framework',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://bootifyjs.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'piyushpriyadarshi', // Usually your GitHub org/user name.
  projectName: 'bootifyjs', // Usually your repo name.

  // Warn about broken links instead of throwing errors (useful during incremental documentation)
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // Custom plugins
  plugins: [
    // Blog Source Plugin - Fetches posts from your CMS at build time
    // Enable by setting BLOG_CMS_ENABLED=true in your environment
    [
      './plugins/blog-source-plugin',
      {
        apiEndpoint: process.env.BLOG_API_ENDPOINT || 'https://your-cms.com/api/posts',
        apiKey: process.env.BLOG_API_KEY || '',
        enabled: process.env.BLOG_CMS_ENABLED === 'true',
        clearExisting: true,
        filePrefix: 'cms-',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Edit URL for documentation contributions
          editUrl:
            'https://github.com/piyushpriyadarshi/bootifyjs/edit/main/docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl:
            'https://github.com/piyushpriyadarshi/bootifyjs/edit/main/docs/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/bootifyjs-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'BootifyJS',
      logo: {
        alt: 'BootifyJS Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API Reference',
        },
        {
          type: 'docSidebar',
          sidebarId: 'templatesSidebar',
          position: 'left',
          label: 'Templates',
        },
        {
          type: 'dropdown',
          label: 'Blog',
          position: 'left',
          items: [
            { to: '/blog', label: '📝 Static Blog' },
            { to: '/dynamic-blog', label: '🔄 News (CMS)' },
          ],
        },
        {
          href: 'https://github.com/piyushpriyadarshi/bootifyjs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/intro',
            },
            {
              label: 'Tutorial',
              to: '/docs/tutorial-basics/create-a-document',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/piyushpriyadarshi/bootifyjs',
            },
            {
              label: 'Issues',
              href: 'https://github.com/piyushpriyadarshi/bootifyjs/issues',
            },
            {
              label: 'Discussions',
              href: 'https://github.com/piyushpriyadarshi/bootifyjs/discussions',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'News & Updates',
              to: '/dynamic-blog',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} BootifyJS. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['typescript', 'javascript', 'json', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
