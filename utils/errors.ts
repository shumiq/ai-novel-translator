export class ProhibitedContentError extends Error {
  constructor() {
    super("Prohibited content detected and skipped.");
    this.name = "ProhibitedContentError";
  }
}

export class HighDemandError extends Error {
  constructor() {
    super("High demand detected and skipped.");
    this.name = "HighDemandError";
  }
}
