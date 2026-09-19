import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePackage,
  validateManifest,
  validatePackageJson,
  validatePackFileList,
  extractImportsFromSource,
  resolveRelativeImport,
  validateSourceImports,
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
    version: "1.0.0", // Proves we do not lock to 0.1.0
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

test("check-package: validateSourceImports reports missing imports", () => {
  const result = validateSourceImports({
    files: ["client/view.tsx"],
    readFile: () => `import { missing } from "./missing";`,
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
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

test("check-package: accepts valid semver ranges for requirements.paseo (*, 1.x, >=0.8.0, etc.)", () => {
  const validRanges = [
    "*",
    "1.x",
    ">=0.8.0",
    "^0.8.0",
    "~0.8.0",
    ">=0.8.0 <1.0.0",
    "0.8.0 - 0.9.0",
  ];
  for (const range of validRanges) {
    const res = validateManifest({
      id: "paseo-kanban",
      requirements: { paseo: range },
    });
    assert.equal(res.valid, true, `Range "${range}" should be valid`);
  }
});

test("check-package: accepts standard SemVer other than 0.1.0 (does not lock version)", () => {
  for (const ver of [
    "0.1.0",
    "0.2.0",
    "1.0.0",
    "2.1.4-beta.1",
    "2.0.0-rc.1+build.123",
  ]) {
    const res = validatePackageJson({
      name: "foo",
      version: ver,
      type: "module",
      files: [
        "paseo-plugin.json",
        "index.client.tsx",
        "index.server.ts",
        "client/",
        "shared/",
      ],
    });
    assert.equal(res.valid, true, `Version ${ver} should be accepted`);
  }
});

// ---------------------------------------------------------------------------
// 2. Negative Tests: Missing Entrypoints & Metadata
// ---------------------------------------------------------------------------

test("check-package: fails when client entrypoint is missing from package contents", () => {
  const fixture = createValidFixture();
  fixture.packFilePaths = fixture.packFilePaths.filter(
    (p) => p !== "index.client.tsx",
  );

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail when index.client.tsx is missing",
  );
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        "Missing required file or directory in package: index.client.tsx",
      ),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when server entrypoint is missing from package contents", () => {
  const fixture = createValidFixture();
  fixture.packFilePaths = fixture.packFilePaths.filter(
    (p) => p !== "index.server.ts",
  );

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail when index.server.ts is missing",
  );
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        "Missing required file or directory in package: index.server.ts",
      ),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when manifest (paseo-plugin.json) is missing from package contents", () => {
  const fixture = createValidFixture();
  fixture.packFilePaths = fixture.packFilePaths.filter(
    (p) => p !== "paseo-plugin.json",
  );

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail when paseo-plugin.json is missing",
  );
  assert.ok(
    result.errors.some((e) =>
      e.includes(
        "Missing required file or directory in package: paseo-plugin.json",
      ),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when package.json is missing from package contents", () => {
  const fixture = createValidFixture();
  fixture.packFilePaths = fixture.packFilePaths.filter(
    (p) => p !== "package.json",
  );

  const result = validatePackage(fixture);
  assert.equal(result.valid, false, "Should fail when package.json is missing");
  assert.ok(
    result.errors.some((e) =>
      e.includes("Missing required file or directory in package: package.json"),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

// ---------------------------------------------------------------------------
// 3. Negative Tests: Relative Import Targets via TypeScript AST
// ---------------------------------------------------------------------------

test("check-package: fails when runtime relative import target is missing", () => {
  const fixture = createValidFixture();
  fixture.virtualFiles["index.client.tsx"] = `
    import { missingFunc } from "./client/does-not-exist";
  `;

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail on missing relative import target",
  );
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("Missing relative import target in package") &&
        e.includes("./client/does-not-exist"),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when type-only relative import target is missing", () => {
  const fixture = createValidFixture();
  // Rationale: Paseo compiles TS source directly, so missing type-only modules break host compiler
  fixture.virtualFiles["index.client.tsx"] = `
    import type { MissingType } from "./shared/missing-types";
  `;

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail on missing type-only relative import target",
  );
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("Missing relative import target in package") &&
        e.includes("./shared/missing-types") &&
        e.includes("type-only import"),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when re-export (export ... from) target is missing", () => {
  const fixture = createValidFixture();
  fixture.virtualFiles["client/view.tsx"] = `
    export { phantom } from "./missing-export-target";
  `;

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail on missing export-from target",
  );
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("Missing relative import target in package") &&
        e.includes("./missing-export-target"),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
});

test("check-package: fails when static dynamic import target is missing", () => {
  const fixture = createValidFixture();
  fixture.virtualFiles["client/view.tsx"] = `
    export async function load() {
      return await import("./lazy-missing-module");
    }
  `;

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    false,
    "Should fail on missing dynamic import target",
  );
  assert.ok(
    result.errors.some(
      (e) =>
        e.includes("Missing relative import target in package") &&
        e.includes("./lazy-missing-module"),
    ),
    `Actual errors: ${result.errors.join("; ")}`,
  );
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
// 4. Negative Tests: Leaked Development, Tooling, & Secret Files
// ---------------------------------------------------------------------------

test("check-package: fails when test directory or test files leak into package", () => {
  const fileList1 = [
    "index.client.tsx",
    "index.server.ts",
    "paseo-plugin.json",
    "package.json",
    "client/a.ts",
    "shared/b.ts",
    "test/sample.test.mjs",
  ];
  const res1 = validatePackFileList(fileList1);
  assert.equal(res1.valid, false);
  assert.ok(
    res1.errors.some((e) =>
      e.includes(
        'Leaked non-distribution file found in package: "test/sample.test.mjs"',
      ),
    ),
  );

  const fileList2 = [
    "index.client.tsx",
    "index.server.ts",
    "paseo-plugin.json",
    "package.json",
    "client/a.ts",
    "shared/b.ts",
    "client/card.spec.ts",
  ];
  const res2 = validatePackFileList(fileList2);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("client/card.spec.ts")));
});

test("check-package: fails when scripts, agent files, or workflows leak into package", () => {
  for (const leaked of [
    "scripts/check-package.mjs",
    ".github/workflows/ci.yml",
    ".agents/skills/paseo/SKILL.md",
    "skills/something.md",
  ]) {
    const list = [
      "index.client.tsx",
      "index.server.ts",
      "paseo-plugin.json",
      "package.json",
      "client/a.ts",
      "shared/b.ts",
      leaked,
    ];
    const res = validatePackFileList(list);
    assert.equal(
      res.valid,
      false,
      `Expected failure for leaked file: ${leaked}`,
    );
    assert.ok(res.errors.some((e) => e.includes(leaked)));
  }
});

test("check-package: fails when config files leak into package", () => {
  for (const config of [
    "tsconfig.json",
    "eslint.config.mjs",
    ".prettierrc",
    ".prettierignore",
    ".nvmrc",
    ".node-version",
  ]) {
    const list = [
      "index.client.tsx",
      "index.server.ts",
      "paseo-plugin.json",
      "package.json",
      "client/a.ts",
      "shared/b.ts",
      config,
    ];
    const res = validatePackFileList(list);
    assert.equal(
      res.valid,
      false,
      `Expected failure for leaked config: ${config}`,
    );
    assert.ok(res.errors.some((e) => e.includes(config)));
  }
});

test("check-package: fails when secrets or .env files leak into package", () => {
  for (const secret of [".env", ".env.local", "secret.pem", "id_rsa.key"]) {
    const list = [
      "index.client.tsx",
      "index.server.ts",
      "paseo-plugin.json",
      "package.json",
      "client/a.ts",
      "shared/b.ts",
      secret,
    ];
    const res = validatePackFileList(list);
    assert.equal(res.valid, false, `Expected failure for secret: ${secret}`);
    assert.ok(res.errors.some((e) => e.includes(secret)));
  }
});

// ---------------------------------------------------------------------------
// 5. Negative Tests: Invalid Manifest & Package.json Metadata
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

test("check-package: allows differing valid package name and manifest id (not a host constraint)", () => {
  const fixture = createValidFixture();
  fixture.manifestJson.id = "my-custom-plugin";
  fixture.packageJson.name = "@acme/different-package-name";

  const result = validatePackage(fixture);
  assert.equal(
    result.valid,
    true,
    `Expected valid package with differing name/id but got errors: ${result.errors.join("; ")}`,
  );
  assert.equal(result.errors.length, 0);
});
