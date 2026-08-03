"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { GitCommitDetail } from "@/lib/git-types";
import { useI18n } from "@/hooks/useI18n";
type Translate = ReturnType<typeof useI18n>["t"];

async function fetchCommitDetail(cwd: string, hash: string): Promise<GitCommitDetail> {
  const params = new URLSearchParams({ cwd, hash });
  const res = await fetch(`/api/git/commit?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load commit (HTTP ${res.status})`);
  return res.json() as Promise<GitCommitDetail>;
}

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

const FILE_STATUS_COLORS: Record<string, string> = {
  added: "#4ade80",
  deleted: "#f87171",
  modified: "#d6a84b",
  renamed: "#60a5fa",
};

function DiffLineView({ patch, t }: { patch: string; t: Translate }) {
  if (!patch.trim()) {
    return <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-dim)" }}>{t("git.noDiffContent")}</div>;
  }
  const lines = patch.split(/\r?\n/);
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        borderRadius: 6,
        overflow: "auto",
        maxHeight: "100%",
      }}
    >
      {lines.map((line, index) => {
        const style: CSSProperties = {
          display: "block",
          padding: "0 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre",
          minWidth: "max-content",
          boxSizing: "border-box",
        };
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
          style.paddingTop = 8;
        }
        return (
          <div key={index}>
            <span style={style}>{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

interface GitCommitViewProps {
  cwd: string;
  commitHash: string;
}

export function GitCommitView({ cwd, commitHash }: GitCommitViewProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchCommitDetail(cwd, commitHash)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [cwd, commitHash]);

  if (error) {
    return <div style={{ padding: "16px", fontSize: 12, color: "#f87171" }}>{error}</div>;
  }

  if (!detail) {
    return <div style={{ padding: "16px", fontSize: 12, color: "var(--text-dim)" }}>{t("git.loadingCommit")}</div>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "16px 20px", borderBottom: "1px solid var(--border)", overflowY: "auto", maxHeight: "40%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>
            {detail.shortHash}
          </span>
          {detail.refs && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{detail.refs}</span>
          )}
        </div>
        <h2 style={{ margin: "12px 0 6px", fontSize: 18, fontWeight: 600, color: "var(--text)", overflowWrap: "anywhere" }}>
          {detail.subject}
        </h2>
        {detail.body && (
          <pre style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>
            {detail.body}
          </pre>
        )}
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {detail.authorName}{detail.authorEmail ? ` <${detail.authorEmail}>` : ""} · {formatFullDate(detail.authorDate)}
        </div>
        {detail.files.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
              {detail.files.length} {detail.files.length === 1 ? t("git.file") : t("git.files")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {detail.files.map((file) => (
                <span
                  key={file.filePath}
                  title={file.filePath}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 11, fontFamily: "var(--font-mono)", padding: "2px 8px", borderRadius: 4,
                    background: "var(--bg-selected)", color: "var(--text-muted)", whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: FILE_STATUS_COLORS[file.status] ?? "var(--text-dim)", width: 12, flexShrink: 0 }}>
                    {file.status === "added" ? "A" : file.status === "deleted" ? "D" : file.status === "renamed" ? "R" : "M"}
                  </span>
                  {file.filePath}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px", minHeight: 0 }}>
        <DiffLineView patch={detail.patch} t={t} />
      </div>
    </div>
  );
}
