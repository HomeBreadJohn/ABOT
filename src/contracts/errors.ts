/** Thrown when a value passes its shape but fails a cross-reference contract rule. */
export class ContractError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`Contract violation at ${path}: ${reason}`);
    this.name = "ContractError";
    this.path = path;
    this.reason = reason;
  }
}
