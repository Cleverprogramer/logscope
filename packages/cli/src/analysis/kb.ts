/**
 * Offline known-error knowledge base: pattern → targeted hint.
 * Deliberately dumb and deterministic — no AI, just accumulated
 * "we've seen this a thousand times" engineering wisdom.
 */

export interface KbRule {
  id: string;
  /** Case-insensitive regex matched against the raw message. */
  pattern: RegExp;
  category: "network" | "disk" | "memory" | "config" | "auth" | "process" | "data";
  hint: string;
}

export const KB_RULES: KbRule[] = [
  {
    id: "conn-refused",
    pattern: /ECONNREFUSED|connection refused/i,
    category: "network",
    hint: "Target host/port isn't accepting connections — service down, wrong port, or firewall. Check the upstream process first.",
  },
  {
    id: "conn-reset",
    pattern: /ECONNRESET|socket hang up|connection reset by peer/i,
    category: "network",
    hint: "Peer closed the connection abruptly — look for upstream crashes, LB idle timeouts, or payload-size limits.",
  },
  {
    id: "etimedout",
    pattern: /ETIMEDOUT|connect(?:ion)? timeout/i,
    category: "network",
    hint: "Network path too slow or dead — verify latency to the dependency and current timeout budget.",
  },
  {
    id: "dns",
    pattern: /ENOTFOUND|getaddrinfo|EAI_AGAIN|name resolution/i,
    category: "network",
    hint: "DNS resolution failing — check resolver config, VPC DNS limits, or a recently changed hostname.",
  },
  {
    id: "enospac",
    pattern: /ENOSPC|no space left on device/i,
    category: "disk",
    hint: "Disk is full — rotate/clean logs (ironically), check temp dirs, and set up disk alerts.",
  },
  {
    id: "eacces",
    pattern: /EACCES|permission denied/i,
    category: "disk",
    hint: "Filesystem permission problem — user mismatch after deploy, missing capability, or read-only mount.",
  },
  {
    id: "enoent-file",
    pattern: /\bENOENT\b/i,
    category: "disk",
    hint: "A referenced file/path doesn't exist — config path typo, working-directory change, or missing mount.",
  },
  {
    id: "emfile",
    pattern: /EMFILE|ENFILE|too many open files/i,
    category: "process",
    hint: "File-descriptor exhaustion — leak (unclosed sockets/files) or raise the ulimit.",
  },
  {
    id: "eaddrinuse",
    pattern: /EADDRINUSE|address already in use/i,
    category: "process",
    hint: "Port already bound — previous instance didn't shut down cleanly or two instances raced startup.",
  },
  {
    id: "oom",
    pattern: /out of memory|OOMKilled|heap out of memory|ENOMEM/i,
    category: "memory",
    hint: "Memory exhausted — profile for leaks, raise container limits, or reduce batch/cache sizes.",
  },
  {
    id: "rate-limit",
    pattern: /\b429\b|rate limit|too many requests/i,
    category: "network",
    hint: "Being throttled by an upstream — add/inspect backoff, respect Retry-After, request a quota bump.",
  },
  {
    id: "unauthorized",
    pattern: /\b401\b|unauthorized|invalid (?:api )?key|token expired/i,
    category: "auth",
    hint: "Credentials rejected or expired — rotate the secret and check clock skew for JWT-style tokens.",
  },
  {
    id: "forbidden",
    pattern: /\b403\b|forbidden|access denied/i,
    category: "auth",
    hint: "AuthN ok but AuthZ failed — the identity lacks the permission/scope for this operation.",
  },
  {
    id: "cert-expired",
    pattern: /certificate (?:has )?expired|CERT_HAS_EXPIRED|self[- ]signed certificate/i,
    category: "auth",
    hint: "TLS certificate problem — renew the cert, update the trust store, or fix SNI/CA configuration.",
  },
  {
    id: "json-parse",
    pattern: /unexpected token .* in JSON|SyntaxError: JSON|invalid json/i,
    category: "data",
    hint: "Malformed JSON input — log the offending payload; check content-types, truncation, or encoding issues.",
  },
  {
    id: "null-ref",
    pattern: /cannot read (?:propert\w+|property) of (?:undefined|null)|is not a function/i,
    category: "data",
    hint: "Null/undefined dereference — an upstream contract changed; find where the expected field went missing.",
  },
  {
    id: "deadlock-db",
    pattern: /deadlock (?:detected|found)|lock wait timeout/i,
    category: "data",
    hint: "Database lock contention — inspect long transactions and unify lock ordering across writers.",
  },
  {
    id: "dup-key",
    pattern: /duplicate key value|unique constraint|E11000 duplicate key/i,
    category: "data",
    hint: "Unique-constraint violation — either retry-with-idempotency is missing or concurrent writers race.",
  },
];

/** All rules whose pattern matches the message (deduped by rule id). */
export function matchKnowledge(message: string): KbRule[] {
  const seen = new Set<string>();
  const hits: KbRule[] = [];
  for (const rule of KB_RULES) {
    if (!seen.has(rule.id) && rule.pattern.test(message)) {
      seen.add(rule.id);
      hits.push(rule);
    }
  }
  return hits;
}
