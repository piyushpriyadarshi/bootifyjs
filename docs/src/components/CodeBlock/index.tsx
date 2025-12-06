import clsx from "clsx";
import { useCallback, useState, type ReactNode } from "react";
import styles from "./styles.module.css";

interface CodeBlockProps {
  children: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

/**
 * Enhanced CodeBlock component with copy functionality and file name display.
 * Provides a better code viewing experience with syntax highlighting support.
 */
export default function CodeBlock({
  children,
  language = "typescript",
  title,
  showLineNumbers = false,
  highlightLines = [],
}: CodeBlockProps): ReactNode {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [children]);

  const lines = children.split("\n");

  return (
    <div className={styles.codeBlockContainer}>
      {title && (
        <div className={styles.codeBlockTitle}>
          <span className={styles.fileName}>{title}</span>
          <span className={styles.languageBadge}>{language}</span>
        </div>
      )}
      <div className={styles.codeBlockWrapper}>
        <button
          className={clsx(styles.copyButton, copied && styles.copied)}
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className={styles.copyText}>{copied ? "Copied!" : "Copy"}</span>
        </button>
        <pre className={clsx(styles.codeBlock, `language-${language}`)}>
          <code>
            {lines.map((line, index) => (
              <div
                key={index}
                className={clsx(
                  styles.codeLine,
                  highlightLines.includes(index + 1) && styles.highlighted
                )}
              >
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
      width="16"
      height="16"
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
      width="16"
      height="16"
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
