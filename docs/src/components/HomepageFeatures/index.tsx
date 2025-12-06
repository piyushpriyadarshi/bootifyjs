import Heading from "@theme/Heading";
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<"svg">>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Decorator-Driven Development",
    Svg: require("@site/static/img/feature-decorators.svg").default,
    description: (
      <>
        Write clean, self-documenting code with powerful decorators for
        controllers, services, routing, and dependency injection. Less
        boilerplate, more productivity.
      </>
    ),
  },
  {
    title: "Powerful Dependency Injection",
    Svg: require("@site/static/img/feature-di.svg").default,
    description: (
      <>
        Full-featured DI container with constructor and property injection,
        interface binding, scopes, and eager loading. Build loosely coupled,
        testable applications.
      </>
    ),
  },
  {
    title: "Event-Driven Architecture",
    Svg: require("@site/static/img/feature-events.svg").default,
    description: (
      <>
        Built-in async event bus with automatic retries, dead-letter queue, and
        high-performance buffered processing with worker threads.
      </>
    ),
  },
  {
    title: "Built on Fastify",
    Svg: require("@site/static/img/feature-performance.svg").default,
    description: (
      <>
        Leverage the incredible performance of Fastify, one of the fastest web
        frameworks for Node.js, with full access to its rich plugin ecosystem.
      </>
    ),
  },
  {
    title: "Type-Safe Configuration",
    Svg: require("@site/static/img/feature-typesafe.svg").default,
    description: (
      <>
        Schema-driven configuration with Zod validation at startup. Catch errors
        early and enjoy fully typed config objects throughout your application.
      </>
    ),
  },
  {
    title: "Pluggable Caching",
    Svg: require("@site/static/img/feature-caching.svg").default,
    description: (
      <>
        Decorator-driven caching system with in-memory store out-of-the-box.
        Easily extend to Redis or other backends for distributed caching.
      </>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
