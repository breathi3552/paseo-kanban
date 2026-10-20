import test from "node:test";
import assert from "node:assert/strict";
import { validatePackage } from "../scripts/check-package.mjs";

function createValidFixture() {
  const virtualFiles = {
    "index.client.tsx": `
      import type { PluginClientContext } from "@getpaseo/plugin/client";
      import { View } from "./client";
      import type { CustomType } from "./shared/types";
      export default function(client: PluginClientContext) {}
    `,
    "index.server.ts": `
      import { util } from "./shared/utils.ts";
      export default function() {}
    `,
    "client/index.tsx": `
      import { helper } from "./helper";
      export { helper } from "./helper";
      export * from "../shared/utils";
      export async function load() { return import("../shared/utils"); }
    `,
    "client/helper.ts": "export const helper = 42;",
    "shared/types.ts": "export type CustomType = { id: string };",
    "shared/utils.ts": 'export const util = () => "ok";',
  };
  return {
    manifestJson: { id: "test-plugin", requirements: { paseo: ">=0.8.0" } },
    packageJson: {
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
      devDependencies: { "@getpaseo/plugin": "0.8.0", react: "19.1.0" },
    },
    packFilePaths: [
      "paseo-plugin.json",
      "package.json",
      ...Object.keys(virtualFiles),
    ],
    virtualFiles,
    readFile(file) {
      if (!(file in virtualFiles)) throw new Error(`File not found: ${file}`);
      return virtualFiles[file];
    },
  };
}

function assertRejected(
  fixture,
  expectedErrors,
  scenario = String(expectedErrors),
) {
  const result = validatePackage(fixture);
  assert.equal(result.valid, false, scenario);
  for (const expected of [expectedErrors].flat()) {
    assert.ok(
      result.errors.some((error) => error.includes(expected)),
      `${scenario}: ${result.errors.join("; ")}`,
    );
  }
}

test("check-package: accepts a complete source package with host, type, re-export and dynamic imports", () => {
  // The host compiles published TS/TSX; extension and directory imports must close.
  const result = validatePackage(createValidFixture());
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("check-package: rejects packages missing a required entrypoint or manifest", () => {
  for (const requiredFile of [
    "index.client.tsx",
    "index.server.ts",
    "paseo-plugin.json",
    "package.json",
  ]) {
    const fixture = createValidFixture();
    fixture.packFilePaths = fixture.packFilePaths.filter(
      (file) => file !== requiredFile,
    );
    assertRejected(
      fixture,
      `Missing required file or directory in package: ${requiredFile}`,
    );
  }
});

test("check-package: rejects missing import targets and imports outside the package", () => {
  // These syntaxes all need packaged targets, including types compiled by Paseo.
  for (const source of [
    'import { missing } from "./missing";',
    'import type { Missing } from "./missing";',
    'export { missing } from "./missing";',
    'export * from "./missing";',
    'const missing = import("./missing");',
    'import missing from "../outside-root";',
  ]) {
    const fixture = createValidFixture();
    fixture.virtualFiles["index.client.tsx"] = source;
    assertRejected(
      fixture,
      source.includes("outside-root") ? '"../outside-root"' : '"./missing"',
      source,
    );
  }
});

test("check-package: rejects release packages leaking tooling, configuration or secrets", () => {
  // File exclusions are an independent distribution guarantee; a valid package
  // cannot show that unpublished developer files would also be rejected.
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
    const fixture = createValidFixture();
    fixture.packFilePaths.push(leaked);
    assertRejected(
      fixture,
      `Leaked non-distribution file found in package: "${leaked}"`,
    );
  }
});

test("check-package: rejects manifests without a valid identity and host requirement", () => {
  for (const [manifestJson, error] of [
    [{ requirements: { paseo: ">=0.8.0" } }, "Manifest 'id' is required"],
    [{ id: "Invalid ID!", requirements: { paseo: ">=0.8.0" } }, "is invalid"],
    [{ id: "test-plugin" }, "Manifest 'requirements' object is required"],
    [
      { id: "test-plugin", requirements: { paseo: "" } },
      "Manifest 'requirements.paseo' is required",
    ],
    [
      { id: "test-plugin", requirements: { paseo: "1..2" } },
      "not a valid semver range",
    ],
  ]) {
    assertRejected({ ...createValidFixture(), manifestJson }, error);
  }
});

test("check-package: rejects metadata that makes the package incompatible with its host", () => {
  for (const [changes, errors] of [
    [{ version: "1.0" }, ["not a valid SemVer format"]],
    [
      { dependencies: { "@getpaseo/plugin": "0.8.0", react: "^19.0.0" } },
      [
        'Host library "@getpaseo/plugin" must not be placed in',
        'Host library "react" must not be placed in',
      ],
    ],
    [
      { engines: { node: ">=24.0.0" } },
      ["engines.node' must not restrict consumer to Node >=24"],
    ],
    [
      { files: ["index.client.tsx"] },
      [
        'must contain "paseo-plugin.json"',
        'must contain "client/"',
        'must contain "shared/"',
        "must include 'index.server.ts'",
      ],
    ],
  ]) {
    const fixture = createValidFixture();
    Object.assign(fixture.packageJson, changes);
    assertRejected(fixture, errors);
  }
});
