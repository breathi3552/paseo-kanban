import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePackage,
  validateManifest,
  validatePackageJson,
  validatePackFileList,
  extractImportsFromSource,
  resolveRelativeImport,
} from "../scripts/check-package.mjs";

function createValidFixture() {
  const manifestJson = {
    id: "test-plugin",
    requirements: {
      paseo: ">=0.8.0",
    },
  };

  const packageJson = {
    name: "test-plugin",
    version: "1.0.0",
    type: "module",
    files: [
      "paseo-plugin.json",
      "index.client.tsx",
      "index.server.ts",
      "client/",
      "shared/",
    ],
    devDependencies: {
      "@getpaseo/plugin": "0.8.0",
      react: "19.1.0",
      "react-native": "0.81.5",
      zod: "^4.4.3",
    },
  };

  const packFilePaths = [
    "LICENSE",
    "README.md",
    "paseo-plugin.json",
    "package.json",
    "index.client.tsx",
    "index.server.ts",
    "client/view.tsx",
    "client/helper.ts",
    "shared/types.ts",
    "shared/utils.ts",
  ];

  const virtualFiles = {
    "index.client.tsx": `
      import type { PluginClientContext } from "@getpaseo/plugin/client";
      import { View } from "./client/view";
      import type { CustomType } from "./shared/types";
      export default function(client: PluginClientContext) {}
    `,
    "index.server.ts": `
      import type { PluginServerContext } from "@getpaseo/plugin/server";
      import { util } from "./shared/utils";
      export default function(server: PluginServerContext) {}
    `,
    "client/view.tsx": `
      import { helper } from "./helper";
      export { helper } from "./helper";
      export async function loadAsync() {
        const mod = await import("../shared/utils");
        return mod;
      }
    `,
    "client/helper.ts": `export const helper = 42;`,
    "shared/types.ts": `export type CustomType = { id: string };`,
    "shared/utils.ts": `export const util = () => "ok";`,
  };

  const readFile = (file) => {
    if (file in virtualFiles) {
      return virtualFiles[file];
    }
    throw new Error(`File not found in virtual filesystem: ${file}`);
  };

  return { manifestJson, packageJson, packFilePaths, virtualFiles, readFile };
}

// ---------------------------------------------------------------------------
// 1. Unit & Helper Tests
// ---------------------------------------------------------------------------

test("check-package: extractImportsFromSource extracts value, type-only, export-from, and dynamic imports", () => {
  const code = `
    import { a } from "./a";
    import type { B } from "./b";
    export { c } from "./c";
    export * from "./d";
    const dyn = import("./e");
  `;
  const imports = extractImportsFromSource("test.ts", code);
  assert.equal(imports.length, 5);
  assert.deepEqual(
    imports.map((i) => ({ specifier: i.specifier, isTypeOnly: i.isTypeOnly })),
    [
      { specifier: "./a", isTypeOnly: false },
      { specifier: "./b", isTypeOnly: true },
      { specifier: "./c", isTypeOnly: false },
      { specifier: "./d", isTypeOnly: false },
      { specifier: "./e", isTypeOnly: false },
    ],
  );
});

test("check-package: resolveRelativeImport resolves files with extensions, indexes, and blocks root escape", () => {
  const fileSet = new Set([
    "client/a.ts",
    "client/index.tsx",
    "shared/utils.ts",
  ]);
  assert.equal(
    resolveRelativeImport("client/view.tsx", "./a", fileSet),
    "client/a.ts",
  );
  assert.equal(
    resolveRelativeImport("client/view.tsx", "./a.ts", fileSet),
    "client/a.ts",
  );
  assert.equal(
    resolveRelativeImport("index.client.tsx", "./client", fileSet),
    "client/index.tsx",
  );
  assert.equal(
    resolveRelativeImport("client/view.tsx", "../shared/utils", fileSet),
    "shared/utils.ts",
  );
  assert.equal(
    resolveRelativeImport("index.client.tsx", "../outside", fileSet),
    null,
  );
});

// ---------------------------------------------------------------------------
// 2. Positive Tests
// ---------------------------------------------------------------------------

test("check-package: in-memory valid fixture passes validation", () => {
  const fixture = createValidFixture();
  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    true,
    `Validation failed: ${result.errors.join("; ")}`,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.details.fileCount, fixture.packFilePaths.length);
  assert.ok(result.details.verifiedImportsCount >= 5);
});

// ---------------------------------------------------------------------------
// 3. Required Package Files
// ---------------------------------------------------------------------------

test("check-package: rejects packages missing a required entrypoint or manifest", () => {
  for (const requiredFile of [
    "index.client.tsx",
    "index.server.ts",
    "paseo-plugin.json",
    "package.json",
  ]) {
    const fixture = createValidFixture();
    fixture.packFilePaths = fixture.packFilePaths.filter(
      (path) => path !== requiredFile,
    );

    const result = validatePackage(fixture);
    assert.equal(result.valid, false, requiredFile);
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          `Missing required file or directory in package: ${requiredFile}`,
        ),
      ),
      `${requiredFile}: ${result.errors.join("; ")}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Relative Import Targets via TypeScript AST
// ---------------------------------------------------------------------------

test("check-package: rejects missing relative imports of every supported syntax", () => {
  for (const { file, source, target, typeOnly } of [
    {
      file: "index.client.tsx",
      source: 'import { missingFunc } from "./client/does-not-exist";',
      target: "./client/does-not-exist",
    },
    {
      // Paseo compiles type imports from the published TypeScript source.
      file: "index.client.tsx",
      source: 'import type { MissingType } from "./shared/missing-types";',
      target: "./shared/missing-types",
      typeOnly: true,
    },
    {
      file: "client/view.tsx",
      source: 'export { phantom } from "./missing-export-target";',
      target: "./missing-export-target",
    },
    {
      file: "client/view.tsx",
      source:
        'export async function load() { return import("./lazy-missing-module"); }',
      target: "./lazy-missing-module",
    },
  ]) {
    const fixture = createValidFixture();
    fixture.virtualFiles[file] = source;
    const result = validatePackage(fixture);
    assert.equal(result.valid, false, target);
    assert.ok(
      result.errors.some(
        (error) =>
          error.includes("Missing relative import target in package") &&
          error.includes(target) &&
          (!typeOnly || error.includes("type-only import")),
      ),
      `${target}: ${result.errors.join("; ")}`,
    );
  }
});

test("check-package: fails when relative import attempts to escape package root", () => {
  const fixture = createValidFixture();
  fixture.virtualFiles["index.client.tsx"] = `
    import secret from "../outside-root";
  `;

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail when import escapes package root",
  );
  assert.ok(
    result.errors.some((e) => e.includes("../outside-root")),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

// ---------------------------------------------------------------------------
// 5. Release Package File Exclusions
// ---------------------------------------------------------------------------

test("check-package: excludes tests, tooling, configuration, and secrets from the release package", () => {
  const packFiles = createValidFixture().packFilePaths;
  for (const leaked of [
    "test/sample.test.mjs",
    "client/card.spec.ts",
    "scripts/check-package.mjs",
    ".github/workflows/ci.yml",
    ".agents/skills/paseo/SKILL.md",
    "skills/something.md",
    "tsconfig.json",
    "eslint.config.mjs",
    ".prettierrc",
    ".prettierignore",
    ".nvmrc",
    ".node-version",
    ".env",
    ".env.local",
    "secret.pem",
    "id_rsa.key",
  ]) {
    const result = validatePackFileList([...packFiles, leaked]);
    assert.equal(result.valid, false, leaked);
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          `Leaked non-distribution file found in package: "${leaked}"`,
        ),
      ),
      `${leaked}: ${result.errors.join("; ")}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Manifest & Package.json Metadata
// ---------------------------------------------------------------------------

test("check-package: fails when manifest is missing required id or has invalid id format", () => {
  const missingId = validateManifest({ requirements: { paseo: ">=0.8.0" } });
  assert.equal(missingId.valid, false);
  assert.ok(
    missingId.errors.some((e) => e.includes("Manifest 'id' is required")),
  );

  const invalidId = validateManifest({
    id: "Invalid ID with spaces!",
    requirements: { paseo: ">=0.8.0" },
  });
  assert.equal(invalidId.valid, false);
  assert.ok(invalidId.errors.some((e) => e.includes("is invalid")));
});

test("check-package: fails when manifest is missing requirements.paseo or has invalid semver (===, ..., 1..2)", () => {
  const missingReq = validateManifest({ id: "paseo-kanban" });
  assert.equal(missingReq.valid, false);
  assert.ok(
    missingReq.errors.some((e) =>
      e.includes("Manifest 'requirements' object is required"),
    ),
  );

  const emptyPaseo = validateManifest({
    id: "paseo-kanban",
    requirements: { paseo: "" },
  });
  assert.equal(emptyPaseo.valid, false);
  assert.ok(
    emptyPaseo.errors.some((e) =>
      e.includes("Manifest 'requirements.paseo' is required"),
    ),
  );

  const invalidRanges = ["===", "...", "1..2", "abc", ">= >=0.8"];
  for (const range of invalidRanges) {
    const res = validateManifest({
      id: "paseo-kanban",
      requirements: { paseo: range },
    });
    assert.equal(res.valid, false, `Range "${range}" should be rejected`);
    assert.ok(
      res.errors.some((e) => e.includes("not a valid semver range")),
      `Expected semver range error for "${range}", got: ${res.errors.join("; ")}`,
    );
  }
});

test("check-package: fails when package.json version is invalid semver (===, ..., 1..2, not_a_semver, 1.0)", () => {
  for (const badVer of [
    "not_a_semver",
    "1.0",
    "1.0.0.0",
    "===",
    "...",
    "1..2",
    "abc",
  ]) {
    const res = validatePackageJson({
      name: "paseo-kanban",
      version: badVer,
      type: "module",
      files: [
        "paseo-plugin.json",
        "index.client.tsx",
        "index.server.ts",
        "client/",
        "shared/",
      ],
    });
    assert.equal(res.valid, false, `Version "${badVer}" should be rejected`);
    assert.ok(
      res.errors.some((e) => e.includes("not a valid SemVer format")),
      `Expected semver error for "${badVer}", got: ${res.errors.join("; ")}`,
    );
  }
});

test("check-package: fails when host libraries are placed in dependencies instead of devDependencies", () => {
  const leakedDeps = validatePackageJson({
    name: "paseo-kanban",
    version: "0.1.0",
    type: "module",
    files: [
      "paseo-plugin.json",
      "index.client.tsx",
      "index.server.ts",
      "client/",
      "shared/",
    ],
    dependencies: {
      "@getpaseo/plugin": "0.8.0",
      react: "^19.0.0",
    },
  });
  assert.equal(leakedDeps.valid, false);
  assert.ok(
    leakedDeps.errors.some((e) =>
      e.includes(
        "Host library \"@getpaseo/plugin\" must not be placed in 'dependencies'",
      ),
    ),
  );
  assert.ok(
    leakedDeps.errors.some((e) =>
      e.includes("Host library \"react\" must not be placed in 'dependencies'"),
    ),
  );
});

test("check-package: fails when consumer-side Node >=24 engines restriction is added", () => {
  const withEngines = validatePackageJson({
    name: "paseo-kanban",
    version: "0.1.0",
    type: "module",
    files: [
      "paseo-plugin.json",
      "index.client.tsx",
      "index.server.ts",
      "client/",
      "shared/",
    ],
    engines: {
      node: ">=24.0.0",
    },
  });
  assert.equal(withEngines.valid, false);
  assert.ok(
    withEngines.errors.some((e) =>
      e.includes("engines.node' must not restrict consumer to Node >=24"),
    ),
  );
});

test("check-package: fails when files array in package.json misses required paths", () => {
  const missingFiles = validatePackageJson({
    name: "paseo-kanban",
    version: "0.1.0",
    type: "module",
    files: ["index.client.tsx"],
  });
  assert.equal(missingFiles.valid, false);
  assert.ok(
    missingFiles.errors.some((e) =>
      e.includes('must contain "paseo-plugin.json"'),
    ),
  );
  assert.ok(
    missingFiles.errors.some((e) => e.includes('must contain "client/"')),
  );
  assert.ok(
    missingFiles.errors.some((e) => e.includes('must contain "shared/"')),
  );
  assert.ok(
    missingFiles.errors.some((e) =>
      e.includes("must include 'index.server.ts'"),
    ),
  );
});
