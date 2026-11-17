interface AcceptMediaRange {
  type: string;
  q: number;
}

function parseAcceptHeader(header: string): AcceptMediaRange[] {
  return header
    .split(",")
    .map((part) => {
      const segments = part.trim().split(";").map((segment) => segment.trim());
      const type = segments[0]?.toLowerCase() ?? "";
      if (!type) return null;

      let q = 1.0;
      for (const segment of segments.slice(1)) {
        const [key, value] = segment.split("=").map((item) => item.trim());
        if (key?.toLowerCase() === "q" && value !== undefined) {
          const parsed = Number.parseFloat(value);
          if (!Number.isNaN(parsed)) {
            q = Math.min(1, Math.max(0, parsed));
          }
        }
      }

      return { type, q };
    })
    .filter((entry): entry is AcceptMediaRange => entry !== null);
}

/**
 * Returns true when an HTTP client explicitly prefers `text/markdown`
 * (for example AI agents performing Markdown content negotiation) rather
 * than a standard browser `Accept: text/html,...` request.
 */
export function isMarkdownPreferred(acceptHeader: string | null | undefined): boolean {
  if (!acceptHeader) return false;
  const normalized = acceptHeader.toLowerCase();
  if (!normalized.includes("text/markdown")) return false;

  const ranges = parseAcceptHeader(acceptHeader);
  const markdownRange = ranges.find((entry) => entry.type === "text/markdown");
  if (!markdownRange || markdownRange.q <= 0) {
    return false;
  }

  const htmlRange = ranges.find((entry) => entry.type === "text/html");
  if (!htmlRange) {
    return true;
  }

  return markdownRange.q >= htmlRange.q;
}
