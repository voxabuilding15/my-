/** A failure retrying cannot fix (corrupt file, too many pages…). The code is shown to the user. */
export class PermanentError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'PermanentError';
  }
}
