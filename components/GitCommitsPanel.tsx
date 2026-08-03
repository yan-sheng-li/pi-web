"use client";

import { useEffect, useState } from "react";
import type { GitCommitInfo, GitLogResponse } from "@/lib/git-types";
import { useI18n } from "@/hooks/useI18n";

const MAX_COMMITS = 50;

async function fetchGitLog(cwd: string): Promise<GitLogResponse> {
  const params = new URLSearchParams({ cwd, maxCount: String(MAX_COMMITS) });
  const res = await fetch(`/api/git/log?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load Git log (HTTP ${res.status})`);
  return res.json() as Promise<GitLogResponse>;
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

function getActiveRef(refs: string): string | null {
  if (!refs) return null;
  const headMatch = refs.match(/(?:HEAD ->\s*)([^,]+)/);
  if (headMatch) return headMatch[1].trim();
  const first = refs.split(",")[0]?.trim();
  return first || null;
}

function CommitRow({
  commit,
  onOpen,
}: {
  commit: GitCommitInfo;
  onOpen: (commit: GitCommitInfo) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeRef = getActiveRef(commit.refs);
  return (
    <div
      onClick={() => onOpen(commit)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(commit); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${commit.subject} (${commit.hash})`}
      style={{
        display: "flex", alignItems: "center", gap: 6, paddingLeft: 10, paddingRight: 8, height: 26,
        cursor: "pointer", borderRadius: 4, userSelect: "none",
        background: hovered ? "var(--bg-hover)" : "transparent",
      }}
    >
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
  );
}

interface GitCommitsPanelProps {
  cwd: string;
  refreshKey: number;
  onOpenCommit: (commit: GitCommitInfo) => void;
}

export function GitCommitsPanel({ cwd, refreshKey, onOpenCommit }: GitCommitsPanelProps) {
  const { t } = useI18n();
  const [response, setResponse] = useState<GitLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
          <CommitRow key={commit.hash} commit={commit} onOpen={onOpenCommit} />
        ))
      )}
    </div>
  );
}
