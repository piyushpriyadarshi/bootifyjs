import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import Layout from "@theme/Layout";
import clsx from "clsx";
import type { ReactNode } from "react";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroContent}>
        <div className={styles.badge}>
          <svg
            className={styles.badgeIcon}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </svg>
          Built on Fastify • TypeScript First
        </div>

        <h1 className={styles.heroTitle}>{siteConfig.title}</h1>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>

        <div className={styles.buttons}>
          <Link className={styles.primaryButton} to="/docs/intro">
            Get Started
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            className={styles.secondaryButton}
            to="https://github.com/bootifyjs/bootifyjs"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View on GitHub
          </Link>
        </div>

        <div className={styles.codeExampleWrapper}>
          <div className={styles.codeExample}>
            <div className={styles.codeHeader}>
              <span className={clsx(styles.codeDot, styles.codeDotRed)} />
              <span className={clsx(styles.codeDot, styles.codeDotYellow)} />
              <span className={clsx(styles.codeDot, styles.codeDotGreen)} />
              <span className={styles.codeFileName}>user.controller.ts</span>
            </div>
            <pre className={styles.codeContent}>
              <code>
                <span className={styles.decorator}>@Controller</span>(
                <span className={styles.string}>'/api/users'</span>){"\n"}
                <span className={styles.keyword}>export class</span>{" "}
                <span className={styles.className}>UserController</span> {"{"}
                {"\n"}
                {"  "}
                <span className={styles.decorator}>@Get</span>(
                <span className={styles.string}>'/'</span>){"\n"}
                {"  "}
                <span className={styles.method}>getUsers</span>() {"{"}
                {"\n"}
                {"    "}
                <span className={styles.keyword}>return</span> [{"{"}{" "}
                <span className={styles.property}>id</span>:{" "}
                <span className={styles.number}>1</span>,{" "}
                <span className={styles.property}>name</span>:{" "}
                <span className={styles.string}>'John'</span> {"}"}];{"\n"}
                {"  }"}
                {"\n"}
                {"\n"}
                {"  "}
                <span className={styles.decorator}>@Post</span>(
                <span className={styles.string}>'/'</span>){"\n"}
                {"  "}
                <span className={styles.method}>createUser</span>(
                <span className={styles.decorator}>@Body</span>(){" "}
                <span className={styles.property}>data</span>:{" "}
                <span className={styles.className}>CreateUserDto</span>) {"{"}
                {"\n"}
                {"    "}
                <span className={styles.keyword}>return</span>{" "}
                <span className={styles.keyword}>this</span>.
                <span className={styles.property}>userService</span>.
                <span className={styles.method}>create</span>(
                <span className={styles.property}>data</span>);{"\n"}
                {"  }"}
                {"\n"}
                {"}"}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Modern Node.js Framework`}
      description="A modern, declarative Node.js framework built on Fastify with powerful dependency injection, event-driven architecture, and decorator-driven development."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
