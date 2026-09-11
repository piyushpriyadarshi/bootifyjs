import { BootifyError } from '../core/errors'
import type { ZodIssue } from 'zod'

/** Thrown when application configuration fails Zod validation at startup. */
export class ConfigValidationError extends BootifyError {
  readonly issues: ZodIssue[]

  constructor(message: string, issues: ZodIssue[] = []) {
    super(message, 'CONFIG_VALIDATION')
    this.issues = issues
  }
}
