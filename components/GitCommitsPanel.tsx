"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { GitCommitDetail, GitCommitInfo, GitLogResponse } from "@/lib/git-types";
import { useI18n } from "@/hooks/useI18n";
type Translate = ReturnType<typeof useI18n>["t"];

const MAX_COMMITS = 50;

async function fetchGitLog(cwd: string): Promise<GitLogResponse> {
  const params = new URLSearchParams({ cwd, maxCount: String(MAX_COMMITS) });
  const res = await fetch(`/api/git/log?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load Git log (HTTP ${res.status})`);
  return res.json() as Promise<GitLogResponse>;
}

async function fetchCommitDetail(cwd: string, hash: string): Promise<GitCommitDetail> {
  const params = new URLSearchParams({ cwd, hash });
  const res = await fetch(`/api/git/commit?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load commit (HTTP ${res.status})`);
  return res.json() as Promise<GitCommitDetail>;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function getActiveRef(refs: string): string | null {
  if (!refs) return null;
  const headMatch = refs.match(/(?:HEAD ->\s*)([^,]+)/);
  if (headMatch) return headMatch[1].trim();
  const first = refs.split(",")[0]?.trim();
  return first || null;
}

function DiffView({ patch, t }: { patch: string; t: Translate }) {
  if (!patch.trim()) {
    return <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim)" }}>{t("git.noDiffContent")}</div>;
  }
  const lines = patch.split(/\r?\n/);
  return (
    <pre
      style={{
        margin: 0,
        padding: "6px 10px",
        maxHeight: 360,
        overflow: "auto",
        fontSize: 11,
        lineHeight: 1.5,
        fontFamily: "var(--font-mono)",
        whiteSpace: "pre",
        overflowX: "auto",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 4,
      }}
    >
      {lines.map((line, index) => {
        const style: CSSProperties = { display: "block", minWidth: "max-content" };
        if (line.startsWith("+") && !line.startsWith("+++")) {
          style.background = "rgba(74,222,128,0.14)";
          style.color = "#4ade80";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          style.background = "rgba(248,113,113,0.12)";
          style.color = "#f87171";
        } else if (line.startsWith("@@")) {
          style.color = "#60a5fa";
          style.fontWeight = 600;
        } else if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) {
          style.color = "var(--text-dim)";
          style.fontWeight = 600;
        }
        return <span key={index} style={style}>{line || " "}</span>;
      })}
    </pre>
  );
}

function CommitDetailView({
  cwd,
  hash,
  onClose,
}: {
  cwd: string;
  hash: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchCommitDetail(cwd, hash)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [cwd, hash]);

  return (
    <div style={{ padding: "4px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px", gap: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {hash.slice(0, 7)}
        </span>
        <button
          type="button"
          onClick={onClose}
          title={t("git.close")}
          aria-label={t("git.close")}
          style={{
            border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer",
            display: "flex", alignItems: "center", padding: 2, borderRadius: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {error ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "#f87171" }}>{error}</div>
      ) : !detail ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim)" }}>{t("git.loadingCommit")}</div>
      ) : (
        <>
          {detail.subject && (
            <div style={{ padding: "0 10px 4px", fontSize: 12, color: "var(--text)", fontWeight: 600, overflowWrap: "anywhere" }}>
              {detail.subject}
            </div>
          )}
          {detail.body && (
            <div style={{ padding: "0 10px 4px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {detail.body}
            </div>
          )}
          <div style={{ padding: "0 10px 6px", fontSize: 10, color: "var(--text-dim)" }}>
            {detail.authorName}{detail.authorEmail ? ` <${detail.authorEmail}>` : ""} · {formatFullDate(detail.authorDate)}
          </div>
          {detail.files.length > 0 && (
            <div style={{ padding: "0 10px 4px", display: "flex", flexWrap: "wrap", gap: 4 }}>
              {detail.files.map((file) => (
                <span
                  key={file.filePath}
                  title={file.filePath}
                  style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", padding: "1px 6px", borderRadius: 3,
                    background: "var(--bg-selected)", color: "var(--text-muted)", whiteSpace: "nowrap",
                  }}
                >
                  {file.filePath}
                </span>
              ))}
            </div>
          )}
          <DiffView patch={detail.patch} t={t} />
        </>
      )}
    </div>
  );
}

function CommitRow({
  commit,
  cwd,
  expanded,
  onToggle,
}: {
  commit: GitCommitInfo;
  cwd: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const activeRef = getActiveRef(commit.refs);
  return (
    <div>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        title={`${commit.subject} (${commit.hash})`}
        style={{
          display: "flex", alignItems: "center", gap: 6, paddingLeft: 10, paddingRight: 8, height: 24,
          cursor: "pointer", borderRadius: 4, userSelect: "none", background: expanded ? "var(--bg-selected)" : "transparent",
        }}
      >
        <svg
          width="9" height="9" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, color: "var(--text-dim)" }}
        >
          <polyline points="3 2 7 5 3 8" />
        </svg>
        <span
          style={{
            flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)",
            background: "rgba(255,255,255,0.06)", padding: "0 4px", borderRadius: 3,
          }}
        >
          {commit.shortHash}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {commit.subject}
        </span>
        {activeRef && (
          <span style={{ fontSize: 9, color: "var(--accent)", border: "1px solid var(--border)", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>
            {activeRef}
          </span>
        )}
        <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-dim)" }}>{formatRelativeTime(commit.authorDate)}</span>
      </div>
      {expanded && <CommitDetailView cwd={cwd} hash={commit.hash} onClose={onToggle} />}
    </div>
  );
}

interface GitCommitsPanelProps {
  cwd: string;
  refreshKey: number;
}

export function GitCommitsPanel({ cwd, refreshKey }: GitCommitsPanelProps) {
  const { t } = useI18n();
  const [response, setResponse] = useState<GitLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedHash(null);
    fetchGitLog(cwd)
      .then((res) => { if (!cancelled) setResponse(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cwd, refreshKey]);

  if (!response?.isGitRepository) return null;

  return (
    <div style={{ padding: "2px 4px 4px" }}>
      {response.branch && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 22, padding: "0 10px", fontSize: 11 }}>
          <span style={{ color: "var(--text-dim)" }}>{t("git.branch")}</span>
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{response.branch}</span>
        </div>
      )}
      {loading ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim)" }}>{t("git.loadingCommits")}</div>
      ) : error ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "#f87171" }}>{error}</div>
      ) : response.commits.length === 0 ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim)" }}>{t("git.noCommits")}</div>
      ) : (
        response.commits.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            cwd={cwd}
            expanded={expandedHash === commit.hash}
            onToggle={() => setExpandedHash((cur) => (cur === commit.hash ? null : commit.hash))}
          />
        ))
      )}
    </div>
  );
}
