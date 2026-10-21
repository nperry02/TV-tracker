import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pin official release archives so a compromised download cannot silently replace the scanner.
const VERSION = "8.30.1";
const ARCHIVES = {
  "darwin-arm64": { name: "darwin_arm64", sha256: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5" },
  "linux-x64": { name: "linux_x64", sha256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" },
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Download or reuse a release archive, verify its pinned hash, then extract only the scanner.
async function prepareScanner(directory) {
  const target = ARCHIVES[`${process.platform}-${process.arch}`];
  if (!target) throw new Error("Secret scanning currently supports Apple Silicon macOS and Linux x64.");
  const name = `gitleaks_${VERSION}_${target.name}.tar.gz`;
  let bytes;
  if (process.env.GITLEAKS_ARCHIVE) bytes = readFileSync(process.env.GITLEAKS_ARCHIVE);
  else {
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${name}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Scanner download failed (${response.status}).`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== target.sha256)
    throw new Error("Scanner checksum verification failed; nothing was executed.");
  const archive = join(directory, name);
  writeFileSync(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "-C", directory, "gitleaks"]);
  const binary = join(directory, "gitleaks");
  chmodSync(binary, 0o700);
  return binary;
}

// Report only locations and rule names, never secret values or matching source lines.
function scan(binary, args, report, label) {
  const result = spawnSync(binary, [...args, "--redact=100", "--ignore-gitleaks-allow", "--no-banner", "--no-color",
    "--log-level=error", "--report-format=json", `--report-path=${report}`], { cwd: ROOT, encoding: "utf8" });
  if (result.error || ![0, 1].includes(result.status))
    throw new Error(`${label} could not complete (scanner exit ${result.status ?? "unknown"}).`);
  const findings = JSON.parse(readFileSync(report, "utf8")) || [];
  console.log(`${label}: ${findings.length} potential secrets.`);
  for (const finding of findings)
    console.error(`${finding.File}:${finding.StartLine} [${finding.RuleID}]${finding.Commit ? ` commit ${finding.Commit.slice(0, 12)}` : ""}`);
  return result.status === 0 && findings.length === 0;
}

// Scan all fetched history plus current publishable files; ignored credentials and libraries stay out.
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "next-episode-secret-scan-"));
  try {
    const binary = await prepareScanner(directory);
    const historyClean = scan(binary, ["git", ROOT, "--log-opts=--all --full-history"], join(directory, "history.json"), "Git history");
    const snapshot = join(directory, "publishable-files");
    mkdirSync(snapshot);
    // Null-delimited Git paths keep unusual filenames intact without invoking a shell.
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" });
    for (const file of new Set(files.split("\0").filter(Boolean))) {
      const source = join(ROOT, file);
      if (!existsSync(source)) continue;
      const destination = join(snapshot, file);
      mkdirSync(dirname(destination), { recursive: true });
      // Scan link text without following a link into ignored credentials or private host files.
      if (lstatSync(source).isSymbolicLink()) writeFileSync(destination, readlinkSync(source));
      else copyFileSync(source, destination);
    }
    const filesClean = scan(binary, ["dir", snapshot], join(directory, "files.json"), "Publishable files");
    if (!historyClean || !filesClean) process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fail closed on download, checksum, Git, or scanner errors rather than claiming a clean audit.
try {
  await main();
} catch (error) {
  console.error(`Secret check failed: ${error.message}`);
  process.exitCode = 1;
}
