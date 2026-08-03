import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type {
  GitCommitDetail,
  GitCommitFileChange,
  GitCommitInfo,
  GitFileStatusKind,
  GitLogResponse,
} from "./git-types";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_LOG_MAX_BUFFER = 32 * 1024 * 1024;

const LOG_SEPARATOR = "\x1e";
const LOG_META_SEPARATOR = "\x1f";
const LOG_FIELD_SEPARATOR = "\x1d";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_LOG_MAX_BUFFER,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

async function findRepositoryRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim() || null;
  } catch {
    return null;
  }
}

function toGitPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function mapLogStatus(status: string): GitFileStatusKind {
  switch (status) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "renamed";
    default:
      return "modified";
  }
}

interface RawCommitMeta {
  hash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  refs: string;
  parents: string[];
}

function splitMetaFields(raw: string): string[] {
  return raw.split(LOG_FIELD_SEPARATOR);
}

function parseCommitRecord(record: string, hasBody: boolean): RawCommitMeta | null {
  const firstSep = record.indexOf(LOG_META_SEPARATOR);
  if (firstSep < 0) return null;
  const metaPart = record.slice(0, firstSep);
  const body = hasBody ? record.slice(firstSep + 1) : "";
  const [hash, subject, authorName, authorEmail, authorDate, refs, parents = ""] = splitMetaFields(metaPart);
  return {
    hash,
    subject,
    body: body.trim(),
    authorName,
    authorEmail,
    authorDate,
    refs,
    parents: parents.split(" ").filter(Boolean),
  };
}

export async function getGitLog(cwd: string, maxCount = 30): Promise<GitLogResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot) {
    return {
      isGitRepository: false,
      repositoryRoot: null,
      branch: null,
      commits: [],
    };
  }

  const format = [
    `%H${LOG_FIELD_SEPARATOR}%s${LOG_FIELD_SEPARATOR}%an${LOG_FIELD_SEPARATOR}%ae${LOG_FIELD_SEPARATOR}%aI${LOG_FIELD_SEPARATOR}%D${LOG_FIELD_SEPARATOR}%P`,
  ].join("");
  const args = [
    "log",
    "--no-color",
    `--format=${format}${LOG_META_SEPARATOR}%b${LOG_SEPARATOR}`,
    `--max-count=${Math.max(1, Math.floor(maxCount))}`,
  ];
  let output: string;
  try {
    output = await git(repositoryRoot, args);
  } catch {
    return { isGitRepository: true, repositoryRoot, branch: null, commits: [] };
  }

  const branch = await getCurrentBranch(repositoryRoot);
  const records = output.split(LOG_SEPARATOR).filter(Boolean);
  const commits: GitCommitInfo[] = records
    .map((record) => parseCommitRecord(record, true))
    .filter((commit): commit is RawCommitMeta => commit !== null)
    .map((commit) => ({
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      subject: commit.subject,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authorDate: commit.authorDate,
      refs: commit.refs,
    }));

  return { isGitRepository: true, repositoryRoot, branch, commits };
}

async function getCurrentBranch(repositoryRoot: string): Promise<string | null> {
  try {
    const branch = (await git(repositoryRoot, ["branch", "--show-current"])).trim();
    return branch || null;
  } catch {
    return null;
  }
}

export async function getGitCommitDetail(cwd: string, hash: string): Promise<GitCommitDetail | null> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot) return null;
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) return null;

  const format = [
    `%H${LOG_FIELD_SEPARATOR}%s${LOG_FIELD_SEPARATOR}%an${LOG_FIELD_SEPARATOR}%ae${LOG_FIELD_SEPARATOR}%aI${LOG_FIELD_SEPARATOR}%D${LOG_FIELD_SEPARATOR}%P`,
  ].join("");
  const metaArgs = [
    "show",
    "--no-color",
    "--no-patch",
    `--format=${format}${LOG_META_SEPARATOR}%b${LOG_SEPARATOR}`,
    hash,
  ];

  let metaOutput: string;
  try {
    metaOutput = await git(repositoryRoot, metaArgs);
  } catch {
    return null;
  }

  const record = metaOutput.split(LOG_SEPARATOR)[0] ?? "";
  const meta = parseCommitRecord(record, true);
  if (!meta) return null;

  let statOutput = "";
  try {
    statOutput = await git(repositoryRoot, [
      "show",
      "--no-color",
      "--no-ext-diff",
      "--numstat",
      "--format=",
      hash,
    ]);
  } catch {
    statOutput = "";
  }

  let nameStatusOutput = "";
  try {
    nameStatusOutput = await git(repositoryRoot, [
      "show",
      "--no-color",
      "--name-status",
      "--format=",
      hash,
    ]);
  } catch {
    nameStatusOutput = "";
  }

  const files = parseNumstat(statOutput, parseNameStatus(nameStatusOutput));

  let patch = "";
  try {
    patch = await git(repositoryRoot, [
      "show",
      "--no-color",
      "--no-ext-diff",
      "--unified=3",
      "--format=",
      hash,
    ]);
  } catch {
    patch = "";
  }

  return {
    hash: meta.hash,
    shortHash: meta.hash.slice(0, 7),
    subject: meta.subject,
    body: meta.body,
    authorName: meta.authorName,
    authorEmail: meta.authorEmail,
    authorDate: meta.authorDate,
    refs: meta.refs,
    parentCount: meta.parents.length,
    files,
    patch,
  };
}

function parseNumstat(output: string, statusByPath: Map<string, GitFileStatusKind>): GitCommitFileChange[] {
  const files: GitCommitFileChange[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const [addedRaw, deletedRaw, ...nameParts] = line.split("\t");
    const gitPath = nameParts.join("\t").trim();
    if (!gitPath) continue;
    const additions = addedRaw === "-" ? 0 : Number(addedRaw);
    const deletions = deletedRaw === "-" ? 0 : Number(deletedRaw);
    files.push({
      filePath: toGitPath(gitPath),
      status: statusByPath.get(gitPath) ?? "modified",
      additions,
      deletions,
    });
  }
  return files;
}

function parseNameStatus(output: string): Map<string, GitFileStatusKind> {
  const map = new Map<string, GitFileStatusKind>();
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("diff ") || trimmed.startsWith("index ") || trimmed.startsWith("---") || trimmed.startsWith("+++")) continue;
    if (line.startsWith("\t")) continue;
    const statusCode = trimmed[0];
    if (!statusCode || trimmed[1] !== "\t") continue;
    const pathPart = trimmed.slice(2);
    const gitPath = pathPart.split(/\t/)[0];
    if (!gitPath) continue;
    map.set(toGitPath(gitPath), mapLogStatus(statusCode));
  }
  return map;
}


