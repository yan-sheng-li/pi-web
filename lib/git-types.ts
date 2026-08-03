export type GitFileStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflict";

export interface GitFileStatus {
  filePath: string;
  status: GitFileStatusKind;
  code: "M" | "A" | "D" | "R" | "U" | "C";
  indexStatus: string;
  worktreeStatus: string;
}

export interface GitStatusResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: GitFileStatus[];
  additions: number;
  deletions: number;
}

export interface GitFileDiffResponse {
  supported: boolean;
  status?: GitFileStatusKind;
  patch?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  refs: string;
}

export interface GitCommitFileChange {
  filePath: string;
  status: GitFileStatusKind;
  additions: number;
  deletions: number;
}

export interface GitCommitDetail {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  refs: string;
  parentCount: number;
  files: GitCommitFileChange[];
  patch: string;
}

export interface GitLogResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  branch: string | null;
  commits: GitCommitInfo[];
}
