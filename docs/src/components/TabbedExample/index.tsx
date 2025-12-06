import clsx from "clsx";
import { useCallback, useState, type ReactNode } from "react";
import styles from "./styles.module.css";

interface Tab {
  label: string;
  content: string;
  language?: string;
  description?: string;
}

interface TabbedExampleProps {
  tabs: Tab[];
  defaultTab?: number;
  showLineNumbers?: boolean;
  title?: string;
  className?: string;
}

/**
 * TabbedExample component for showing multiple implementation approaches in tabs.
 * Useful for demonstrating different ways to achieve the same result.
 */
export default function TabbedExample({
  tabs,
  defaultTab = 0,
  showLineNumbers = false,
  title,
  className,
}: TabbedExampleProps): ReactNode {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tabs[activeTab].content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [tabs, activeTab]);

  const currentTab = tabs[activeTab];
  const lines = currentTab.content.split("\n");

  return (
    <div className={clsx(styles.tabbedContainer, className)}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.tabsHeader}>
        <div className={styles.tabsList}>
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={clsx(
                styles.tab,
                index === activeTab && styles.activeTab
              )}
              onClick={() => setActiveTab(index)}
              aria-selected={index === activeTab}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          className={clsx(styles.copyButton, copied && styles.copied)}
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className={styles.copyText}>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      {currentTab.description && (
        <div className={styles.description}>{currentTab.description}</div>
      )}
      <div className={styles.codeWrapper}>
        <pre
          className={clsx(
            styles.codeBlock,
            `language-${currentTab.language || "typescript"}`
          )}
        >
          <code>
            {lines.map((line, index) => (
              <div key={index} className={styles.codeLine}>
                {showLineNumbers && (
                  <span className={styles.lineNumber}>{index + 1}</span>
                )}
                <span className={styles.lineContent}>{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
