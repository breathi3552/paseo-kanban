#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

const registry = "https://registry.npmjs.org";
const repository = "https://github.com/breathi3552/paseo-kanban";
const provenanceType = "https://slsa.dev/provenance/v1";
const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;
const commit = execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
  encoding: "utf8",
}).trim();

async function fetchRegistry(url) {
  assert.equal(
    new URL(url).origin,
    registry,
    "Expected the public npm registry",
  );
  for (let attempt = 0; attempt < 30; attempt++) {
    const request = new URL(url);
    if (attempt > 0) request.searchParams.set("verify", String(Date.now()));
    const response = await fetch(request, {
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404 && attempt < 29) {
      console.error(`Waiting for npm publication/CDN propagation: ${url}`);
      await response.body?.cancel();
      await setTimeout(10_000);
      continue;
    }
    assert.ok(
      response.ok,
      `npm registry returned ${response.status} for ${url}`,
    );
    return response;
  }
}

const metadata = await (
  await fetchRegistry(`${registry}/${name}/${version}`)
).json();
assert.equal(metadata.name, name);
assert.equal(metadata.version, version);
const archive = Buffer.from(
  await (await fetchRegistry(metadata.dist.tarball)).arrayBuffer(),
);
const digest = createHash("sha512").update(archive).digest();
assert.equal(metadata.dist.integrity, `sha512-${digest.toString("base64")}`);

const attestations = await (
  await fetchRegistry(metadata.dist.attestations.url)
).json();
const provenance = attestations.attestations.find(
  (attestation) => attestation.predicateType === provenanceType,
);
assert.ok(provenance, "Published package must have npm provenance");
const statement = JSON.parse(
  Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString(
    "utf8",
  ),
);
assert.equal(statement.predicateType, provenanceType);
assert.ok(
  statement.subject.some(
    (subject) =>
      subject.name === `pkg:npm/${name}@${version}` &&
      subject.digest.sha512 === digest.toString("hex"),
  ),
  "Provenance must describe the downloaded tarball",
);
const build = statement.predicate.buildDefinition;
assert.equal(build.externalParameters.workflow.repository, repository);
assert.equal(build.externalParameters.workflow.ref, `refs/tags/${tag}`);
assert.equal(
  build.externalParameters.workflow.path,
  ".github/workflows/release.yml",
);
assert.ok(
  build.resolvedDependencies.some(
    (dependency) =>
      dependency.uri === `git+${repository}@refs/tags/${tag}` &&
      dependency.digest.gitCommit === commit,
  ),
  "Provenance source must identify the release tag's commit",
);

const expectedFiles = JSON.parse(
  execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
  }),
)[0]
  .files.map((file) => `package/${file.path}`)
  .sort();
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "kanban-release-"));
try {
  const filename = `${name}-${version}.tgz`;
  writeFileSync(path.join(temporaryDirectory, filename), archive);
  const publishedFiles = execFileSync("tar", ["-tzf", filename], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/)
    .filter((file) => !file.endsWith("/"))
    .sort();
  assert.deepEqual(
    publishedFiles,
    expectedFiles,
    "Published file set must match",
  );
  for (const file of publishedFiles) {
    const sourcePath = file.slice(8);
    const source = execFileSync("git", ["show", `${commit}:${sourcePath}`]);
    const published = execFileSync("tar", ["-xOzf", filename, file], {
      cwd: temporaryDirectory,
    });
    assert.ok(source.equals(published), `${file} differs from tagged source`);
    assert.ok(
      source.equals(readFileSync(sourcePath)),
      `${sourcePath} in the working tree differs from tagged source`,
    );
  }
  if (process.env.RELEASE_ARTIFACT_DIR) {
    mkdirSync(process.env.RELEASE_ARTIFACT_DIR, { recursive: true });
    writeFileSync(
      path.join(process.env.RELEASE_ARTIFACT_DIR, `${name}-${version}.tgz`),
      archive,
    );
  }
  console.log(
    `- npm package: [\`${name}@${version}\`](${metadata.dist.tarball})`,
  );
  console.log(`- Source tag: [\`${tag}\`](${repository}/tree/${tag})`);
  console.log(`- Source commit: \`${commit}\``);
  console.log(`- SHA-512 integrity: \`${metadata.dist.integrity}\``);
  console.log(
    `- Source match: all ${publishedFiles.length} published files match byte for byte.`,
  );
  console.log(`- Provenance source: \`${commit}\` at \`refs/tags/${tag}\`.`);
  console.log(`- [npm attestations](${metadata.dist.attestations.url})`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
