export type DomainParseErrorKind =
  | 'missing_section'
  | 'invalid_enum'
  | 'invalid_id'
  | 'invalid_role'
  | 'malformed';

export interface DomainParseErrorOptions {
  kind: DomainParseErrorKind;
  path?: string;
  section?: string;
  details?: unknown;
}

export class DomainParseError extends Error {
  readonly kind: DomainParseErrorKind;
  readonly path?: string;
  readonly section?: string;
  readonly details?: unknown;

  constructor(message: string, options: DomainParseErrorOptions) {
    super(message);
    this.name = 'DomainParseError';
    this.kind = options.kind;
    this.path = options.path;
    this.section = options.section;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
