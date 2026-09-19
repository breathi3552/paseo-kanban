#!/usr/bin/env node
/**
 * scripts/check-package.mjs
 *
 * Automated verification of the release package contents for Paseo Kanban.
 *
 * Checks:
 * 1. Package manifest (paseo-plugin.json) validity and semver requirements.
 * 2. Package metadata (package.json): valid SemVer version (not locked to 0.1.0),
 *    type module, files list, and ensuring host libraries remain in devDependencies.
 * 3. npm pack list: presence of both entrypoints (index.client.tsx, index.server.ts),
 *    manifest, package metadata, and client/shared source files.
 * 4. Guard against leaking tests, dev scripts, configs, and sensitive files (.env).
 * 5. Relative import closure via TypeScript AST: all relative imports/exports
 *    (including static dynamic imports and type-only imports) must resolve to files
 *    present in the package.
 *
 * Type-only references rationale:
 * Paseo plugins publish TypeScript source directly, which is compiled and type-checked
 * by the Paseo host. Type-only imports (e.g. `import type { Foo } from "./bar"`)
 * must point to files present in the package; otherwise the host compiler fails module
 * resolution during typecheck or compilation.
 *
 * Scope notice:
 * This script strictly verifies static package integrity. It does not load or execute
 * runtime host code, nor does it enforce entrypoint function names or flag safe DOM sniffing.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import semver from "semver";
import ts from "typescript";

export const DISALLOWED_PATTERNS = [
  // Tests
  {
    pattern: /(?:^|\/)(?:test|tests|__tests__)\//i,
    reason: "Test directory leaked",
  },
  { pattern: /\.(?:test|spec)\.[cm]?[jt]sx?$/i, reason: "Test file leaked" },
  // Tooling and dev scripts
  { pattern: /(?:^|\/)scripts\//i, reason: "Development scripts leaked" },
  { pattern: /(?:^|\/)\.github\//i, reason: "CI workflow leaked" },
  { pattern: /(?:^|\/)\.agents\//i, reason: "Agent files leaked" },
  { pattern: /(?:^|\/)skills\//i, reason: "Skill files leaked" },
  // Configuration files
  {
    pattern: /(?:^|\/)tsconfig(?:\..*)?\.json$/i,
    reason: "TypeScript configuration leaked",
  },
  {
    pattern: /(?:^|\/)eslint\.config\.[cm]?js$/i,
    reason: "ESLint configuration leaked",
  },
  {
    pattern: /(?:^|\/)\.eslintrc(?:\..*)?$/i,
    reason: "ESLint configuration leaked",
  },
  {
    pattern: /(?:^|\/)\.prettierrc(?:\..*)?$/i,
    reason: "Prettier configuration leaked",
  },
  { pattern: /(?:^|\/)\.prettierignore$/i, reason: "Prettier ignore leaked" },
  { pattern: /(?:^|\/)\.nvmrc$/i, reason: "Node version file leaked" },
  { pattern: /(?:^|\/)\.node-version$/i, reason: "Node version file leaked" },
  // Secrets and environment files
  {
    pattern: /(?:^|\/)\.env(?:\..*)?$/i,
    reason: "Environment/secret file leaked",
  },
  { pattern: /\.(?:pem|key)$/i, reason: "Private key/secret leaked" },
  // Editor / OS artifacts
  { pattern: /(?:^|\/)\.vscode\//i, reason: "VS Code config leaked" },
  { pattern: /(?:^|\/)\.idea\//i, reason: "IDE config leaked" },
  { pattern: /(?:^|\/)\.DS_Store$/i, reason: "macOS metadata leaked" },
  { pattern: /(?:^|\/)Thumbs\.db$/i, reason: "Windows metadata leaked" },
];

export const REQUIRED_PACK_FILES = [
  {
    // Note: Paseo universal spec requires at least one runtime entrypoint (client or server).
    // Requiring both index.client.tsx and index.server.ts is this repository's design convention,
    // as Paseo Kanban contributes both a client sidebar surface and server daemon settings registration.
    name: "Client Entrypoint (repository convention)",
    matches: (files) =>
      files.includes("index.client.tsx") || files.includes("index.client.ts"),
    description:
      "index.client.tsx or index.client.ts (repository convention: required by this plugin)",
  },
  {
    name: "Server Entrypoint (repository convention)",
    matches: (files) =>
      files.includes("index.server.ts") || files.includes("index.server.tsx"),
    description:
      "index.server.ts or index.server.tsx (repository convention: required by this plugin)",
  },
  {
    name: "Plugin Manifest",
    matches: (files) => files.includes("paseo-plugin.json"),
    description: "paseo-plugin.json",
  },
  {
    name: "Package Manifest",
    matches: (files) => files.includes("package.json"),
    description: "package.json",
  },
  {
    name: "Client Source Directory",
    matches: (files) => files.some((f) => f.startsWith("client/")),
    description: "At least one client source file in client/",
  },
  {
    name: "Shared Source Directory",
    matches: (files) => files.some((f) => f.startsWith("shared/")),
    description: "At least one shared source file in shared/",
  },
];

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      errors: ["Manifest (paseo-plugin.json) must be a JSON object"],
    };
  }

  if (typeof manifest.id !== "string" || manifest.id.trim() === "") {
    errors.push("Manifest 'id' is required and must be a non-empty string");
  } else if (!/^[a-z0-9][a-z0-9-_]*$/.test(manifest.id)) {
    errors.push(
      `Manifest 'id' "${manifest.id}" is invalid. Must consist of lowercase letters, numbers, hyphens, or underscores.`,
    );
  }

  if (!manifest.requirements || typeof manifest.requirements !== "object") {
    errors.push("Manifest 'requirements' object is required");
  } else if (
    typeof manifest.requirements.paseo !== "string" ||
    manifest.requirements.paseo.trim() === ""
  ) {
    errors.push("Manifest 'requirements.paseo' is required (e.g. '>=0.8.0')");
  } else if (!semver.validRange(manifest.requirements.paseo)) {
    errors.push(
      `Manifest 'requirements.paseo' "${manifest.requirements.paseo}" is not a valid semver range`,
    );
  }

  if (manifest.build !== undefined) {
    if (!Array.isArray(manifest.build)) {
      errors.push(
        "Manifest 'build' must be an array of command argv arrays if specified",
      );
    } else {
      for (let i = 0; i < manifest.build.length; i++) {
        const cmd = manifest.build[i];
        if (!Array.isArray(cmd) || cmd.some((arg) => typeof arg !== "string")) {
          errors.push(
            `Manifest 'build[${i}]' must be an array of string arguments`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validatePackageJson(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { valid: false, errors: ["package.json must be a JSON object"] };
  }

  if (typeof pkg.name !== "string" || pkg.name.trim() === "") {
    errors.push("package.json 'name' is required");
  }

  // Note: Do NOT lock version to 0.1.0; accept standard SemVer format
  if (typeof pkg.version !== "string" || !semver.valid(pkg.version)) {
    errors.push(
      `package.json 'version' "${pkg.version}" is not a valid SemVer format`,
    );
  }

  if (pkg.type !== "module") {
    errors.push("package.json 'type' must be 'module'");
  }

  if (!Array.isArray(pkg.files)) {
    errors.push("package.json 'files' must be an array");
  } else {
    const requiredInFiles = ["paseo-plugin.json", "client/", "shared/"];
    for (const req of requiredInFiles) {
      if (!pkg.files.includes(req)) {
        errors.push(`package.json 'files' must contain "${req}"`);
      }
    }
    const hasClientEntry =
      pkg.files.includes("index.client.tsx") ||
      pkg.files.includes("index.client.ts");
    const hasServerEntry =
      pkg.files.includes("index.server.ts") ||
      pkg.files.includes("index.server.tsx");
    if (!hasClientEntry) {
      errors.push(
        "package.json 'files' must include 'index.client.tsx' or 'index.client.ts'",
      );
    }
    if (!hasServerEntry) {
      errors.push(
        "package.json 'files' must include 'index.server.ts' or 'index.server.tsx'",
      );
    }
  }

  // Check dependencies strategy: host-provided libraries must NOT be placed in dependencies
  const HOST_PROVIDED_PACKAGES = [
    "@getpaseo/plugin",
    "react",
    "react-native",
    "zod",
  ];
  if (pkg.dependencies && typeof pkg.dependencies === "object") {
    for (const hostPkg of HOST_PROVIDED_PACKAGES) {
      if (Object.prototype.hasOwnProperty.call(pkg.dependencies, hostPkg)) {
        errors.push(
          `Host library "${hostPkg}" must not be placed in 'dependencies'. It is provided by Paseo runtime and belongs in 'devDependencies'.`,
        );
      }
    }
  }

  // Development baseline vs consumption: consumer should not have local dev Node engines restriction
  if (pkg.engines?.node && />=\s*24/.test(pkg.engines.node)) {
    errors.push(
      "package.json 'engines.node' must not restrict consumer to Node >=24 (dev baseline belongs in .nvmrc/.node-version)",
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validatePackFileList(rawFilePaths) {
  const errors = [];
  const files = rawFilePaths.map((p) => p.replace(/\\/g, "/"));
  const fileSet = new Set(files);

  // Check required files
  for (const req of REQUIRED_PACK_FILES) {
    if (!req.matches(files)) {
      errors.push(
        `Missing required file or directory in package: ${req.description}`,
      );
    }
  }

  // Check disallowed leaked files
  for (const file of files) {
    for (const disallowed of DISALLOWED_PATTERNS) {
      if (disallowed.pattern.test(file)) {
        errors.push(
          `Leaked non-distribution file found in package: "${file}" (${disallowed.reason})`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, files, fileSet };
}

export function extractImportsFromSource(filePath, sourceCode) {
  const imports = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  function visit(node) {
    // 1. import ... from "specifier"
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const isTypeOnly = Boolean(node.importClause?.isTypeOnly);
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        imports.push({
          kind: isTypeOnly ? "import-type" : "import",
          specifier: node.moduleSpecifier.text,
          isTypeOnly,
          line: line + 1,
        });
      }
    }
    // 2. export ... from "specifier"
    else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const isTypeOnly = Boolean(node.isTypeOnly);
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        imports.push({
          kind: isTypeOnly ? "export-type-from" : "export-from",
          specifier: node.moduleSpecifier.text,
          isTypeOnly,
          line: line + 1,
        });
      }
    }
    // 3. Dynamic import("specifier")
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        (ts.isStringLiteral(firstArg) ||
          ts.isNoSubstitutionTemplateLiteral(firstArg))
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        imports.push({
          kind: "dynamic-import",
          specifier: firstArg.text,
          isTypeOnly: false,
          line: line + 1,
        });
      }
    }
    // 4. import x = require("specifier")
    else if (ts.isImportEqualsDeclaration(node)) {
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        imports.push({
          kind: "import-equals",
          specifier: node.moduleReference.expression.text,
          isTypeOnly: false,
          line: line + 1,
        });
      }
    }
    // 5. type T = import("specifier").Type
    else if (ts.isImportTypeNode(node)) {
      let specifier = null;
      if (
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        specifier = node.argument.literal.text;
      }
      if (specifier) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        imports.push({
          kind: "type-query-import",
          specifier,
          isTypeOnly: true,
          line: line + 1,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

export function isRelativeSpecifier(specifier) {
  return (
    typeof specifier === "string" &&
    (specifier.startsWith("./") ||
      specifier.startsWith("../") ||
      specifier === "." ||
      specifier === "..")
  );
}

export function resolveRelativeImport(sourceFilePath, specifier, packFileSet) {
  const sourceDir = path.posix.dirname(sourceFilePath);
  const normalized = path.posix.normalize(
    path.posix.join(sourceDir, specifier),
  );

  // Cannot escape package root
  if (normalized.startsWith("../") || normalized === "..") {
    return null;
  }

  // 1. Exact match (e.g. file already has extension or explicit format)
  if (packFileSet.has(normalized)) {
    return normalized;
  }

  // 2. File extension candidates
  const extensions = [
    ".ts",
    ".tsx",
    ".d.ts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
  ];
  for (const ext of extensions) {
    const candidate = `${normalized}${ext}`;
    if (packFileSet.has(candidate)) {
      return candidate;
    }
  }

  // 3. Directory index candidates
  for (const ext of extensions) {
    const candidate = path.posix.join(normalized, `index${ext}`);
    if (packFileSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function validateSourceImports({ files, readFile }) {
  const errors = [];
  const fileSet = new Set(files);
  const sourceExtensions = /\.[cm]?[jt]sx?$/;
  let verifiedImportsCount = 0;

  for (const file of files) {
    if (!sourceExtensions.test(file)) {
      continue;
    }

    let code;
    try {
      code = readFile(file);
    } catch (err) {
      errors.push(`Failed to read source file "${file}": ${err.message}`);
      continue;
    }

    const imports = extractImportsFromSource(file, code);
    for (const imp of imports) {
      if (!isRelativeSpecifier(imp.specifier)) {
        // External or host-provided import
        continue;
      }

      verifiedImportsCount++;
      const resolved = resolveRelativeImport(file, imp.specifier, fileSet);
      if (!resolved) {
        const typeNote = imp.isTypeOnly ? " (type-only import)" : "";
        errors.push(
          `Missing relative import target in package: "${file}:${imp.line}" references "${imp.specifier}"${typeNote}, but target was not found in package contents`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, verifiedImportsCount };
}

export function validatePackage({
  packFilePaths,
  packageJson,
  manifestJson,
  readFile,
}) {
  const errors = [];

  // 1. Manifest
  const manifestResult = validateManifest(manifestJson);
  if (!manifestResult.valid) {
    errors.push(...manifestResult.errors);
  }

  // 2. Package.json
  const pkgResult = validatePackageJson(packageJson);
  if (!pkgResult.valid) {
    errors.push(...pkgResult.errors);
  }

  // 3. File list checks
  const fileListResult = validatePackFileList(packFilePaths);
  if (!fileListResult.valid) {
    errors.push(...fileListResult.errors);
  }

  // 4. Source imports closure
  const importsResult = validateSourceImports({
    files: fileListResult.files,
    readFile,
  });
  if (!importsResult.valid) {
    errors.push(...importsResult.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    details: {
      fileCount: fileListResult.files.length,
      verifiedImportsCount: importsResult.verifiedImportsCount,
    },
  };
}

export function parseNpmPackJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Failed to locate JSON array in npm pack output:\n${output}`,
    );
  }
  const parsed = JSON.parse(output.slice(start, end + 1));
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !Array.isArray(parsed[0].files)
  ) {
    throw new Error("Unexpected npm pack JSON structure");
  }
  return parsed[0].files.map((f) => f.path.replace(/\\/g, "/"));
}

export async function runPackageCheck(options = {}) {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose ?? true;

  if (verbose) {
    console.log(
      "🔍 Checking release package integrity via npm pack --dry-run...",
    );
  }

  let packFilePaths;
  try {
    const packStdout = execSync("npm pack --dry-run --json --ignore-scripts", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    packFilePaths = parseNpmPackJson(packStdout);
  } catch (err) {
    const message = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to execute npm pack --dry-run:\n${message}`);
  }

  const packageJsonPath = path.resolve(cwd, "package.json");
  const manifestJsonPath = path.resolve(cwd, "paseo-plugin.json");

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf-8"));

  const readFile = (relPath) =>
    fs.readFileSync(path.resolve(cwd, relPath), "utf-8");

  const result = validatePackage({
    packFilePaths,
    packageJson,
    manifestJson,
    readFile,
  });

  if (verbose) {
    if (result.valid) {
      console.log(`✅ Package integrity check passed!`);
      console.log(`   - Packaged files: ${result.details.fileCount}`);
      console.log(
        `   - Verified relative imports: ${result.details.verifiedImportsCount}`,
      );
      console.log(`   - Entrypoints & manifest verified`);
      console.log(`   - Zero non-distribution / secret files leaked`);
    } else {
      console.error(
        `❌ Package integrity check failed with ${result.errors.length} error(s):`,
      );
      for (const err of result.errors) {
        console.error(`   • ${err}`);
      }
    }
  }

  return result;
}

// Direct CLI invocation
const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  runPackageCheck()
    .then((result) => {
      if (!result.valid) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(
        `💥 Unexpected error during package check:\n${err.message}`,
      );
      process.exit(1);
    });
}
