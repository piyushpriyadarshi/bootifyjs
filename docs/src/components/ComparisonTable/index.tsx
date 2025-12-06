import clsx from "clsx";
import { type ReactNode } from "react";
import styles from "./styles.module.css";

type FeatureValue = boolean | string | "partial";

interface Feature {
  name: string;
  values: FeatureValue[];
  description?: string;
}

interface ComparisonTableProps {
  frameworks: string[];
  features: Feature[];
  highlightColumn?: number;
  caption?: string;
  showLegend?: boolean;
  className?: string;
}

/**
 * ComparisonTable component for side-by-side framework comparisons.
 * Displays features across multiple frameworks with visual indicators.
 */
export default function ComparisonTable({
  frameworks,
  features,
  highlightColumn = 0,
  caption,
  showLegend = true,
  className,
}: ComparisonTableProps): ReactNode {
  return (
    <div className={clsx(styles.comparisonContainer, className)}>
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th className={styles.featureHeader}>Feature</th>
            {frameworks.map((framework, index) => (
              <th
                key={framework}
                className={clsx(
                  styles.frameworkHeader,
                  index === highlightColumn && styles.highlightedColumn
                )}
              >
                {framework}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.name}>
              <td className={styles.featureName} title={feature.description}>
                {feature.name}
              </td>
              {feature.values.map((value, index) => (
                <td
                  key={index}
                  className={clsx(
                    styles.valueCell,
                    index === highlightColumn && styles.highlightedColumn
                  )}
                >
                  <ValueDisplay value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {showLegend && (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={clsx(styles.checkIcon, styles.legendIcon)}>
              <CheckIcon />
            </span>
            Supported
          </span>
          <span className={styles.legendItem}>
            <span className={clsx(styles.partialIcon, styles.legendIcon)}>
              <PartialIcon />
            </span>
            Partial
          </span>
          <span className={styles.legendItem}>
            <span className={clsx(styles.crossIcon, styles.legendIcon)}>
              <CrossIcon />
            </span>
            Not Supported
          </span>
        </div>
      )}
      {caption && <div className={styles.caption}>{caption}</div>}
    </div>
  );
}

function ValueDisplay({ value }: { value: FeatureValue }): ReactNode {
  if (value === true) {
    return (
      <span className={styles.checkIcon}>
        <CheckIcon />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className={styles.crossIcon}>
        <CrossIcon />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className={styles.partialIcon}>
        <PartialIcon />
      </span>
    );
  }
  return <span className={styles.textValue}>{value}</span>;
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PartialIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
