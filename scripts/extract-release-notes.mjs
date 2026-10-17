#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * Extracts a specific version's release notes section from CHANGELOG.md content.
 *
 * @param {string} changelogContent
 * @param {string} rawVersion - Version string with or without leading 'v'
 * @returns {string} The markdown text for the specified version
 */
export function extractReleaseNotes(changelogContent, rawVersion) {
  const version = rawVersion.replace(/^v/, "").trim();
  if (!version) {
    throw new Error("Target version must not be empty");
  }

  const escapedVersion = version.replace(/\./g, "\\.");
  const versionHeaderRegex = new RegExp(
    `(^|\\n)##\\s+\\[?${escapedVersion}\\]?(?:\\s+-\\s+[^\\n]*)?\\n`,
  );
  const match = changelogContent.match(versionHeaderRegex);
  if (!match || match.index === undefined) {
    throw new Error(`Version [${version}] not found in changelog`);
  }

  const startIndex = match.index + match[0].length;
  const remaining = changelogContent.slice(startIndex);
  const nextSectionMatch = remaining.match(/\n##\s+\[?\d+\.\d+\.\d+/);
  const sectionContent =
    nextSectionMatch && nextSectionMatch.index !== undefined
      ? remaining.slice(0, nextSectionMatch.index)
      : remaining;

  const trimmed = sectionContent.trim();
  if (!trimmed) {
    throw new Error(`Release notes for version [${version}] are empty`);
  }
  return trimmed;
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const versionArg = process.argv[2];
  if (!versionArg) {
    console.error("Usage: node scripts/extract-release-notes.mjs <version>");
    process.exit(1);
  }

  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) {
    console.error(`Error: CHANGELOG.md not found at ${changelogPath}`);
    process.exit(1);
  }

  try {
    const changelogContent = fs.readFileSync(changelogPath, "utf8");
    const notes = extractReleaseNotes(changelogContent, versionArg);
    process.stdout.write(notes + "\n");
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
