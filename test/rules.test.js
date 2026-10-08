import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  symlinkSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { test } from "node:test";

const plugin = resolve("src/index.js");
const cli = resolve("node_modules/oxlint/bin/oxlint");

const cases = [
  {
    name: "alarm call",
    code: "store.setAlarm(Date.now());",
    rule: "require-alarm-review",
    count: 1,
  },
  {
    name: "bracketed alarm",
    code: 'store["setAlarm"](123);',
    rule: "require-alarm-review",
    count: 1,
  },
  {
    name: "optional Agent schedule",
    code: "agent?.scheduleEvery?.(60, 'heartbeat');",
    rule: "require-alarm-review",
    count: 1,
  },
  {
    name: "alarm read",
    code: "store.getAlarm();",
    rule: "require-alarm-review",
    count: 0,
  },
  {
    name: "dynamic name is outside syntax coverage",
    code: "store[method](123);",
    rule: "require-alarm-review",
    count: 0,
  },
  {
    name: "reviewed alarm",
    code: "// oxlint-disable-next-line anti-cloudflare-cost/require-alarm-review -- attempts are persisted, cap 8, exhaustion leaves no alarm\nstore.setAlarm(123);",
    rule: "require-alarm-review",
    count: 0,
  },
  {
    name: "browser interval",
    code: "setInterval(poll, 1000);",
    rule: "no-unmanaged-interval",
    count: 1,
  },
  {
    name: "window interval",
    code: "window.setInterval(poll, 1000);",
    rule: "no-unmanaged-interval",
    count: 1,
  },
  {
    name: "bracketed global interval",
    code: 'globalThis["setInterval"](poll, 1000);',
    rule: "no-unmanaged-interval",
    count: 1,
  },
  {
    name: "optional self interval",
    code: "self?.setInterval?.(poll, 1000);",
    rule: "no-unmanaged-interval",
    count: 1,
  },
  {
    name: "different scheduler object",
    code: "scheduler.setInterval(poll, 1000);",
    rule: "no-unmanaged-interval",
    count: 0,
  },
  {
    name: "one-shot timer needs separate review",
    code: "setTimeout(poll, 1000);",
    rule: "no-unmanaged-interval",
    count: 0,
  },
  {
    name: "local-only clock",
    code: "// oxlint-disable-next-line anti-cloudflare-cost/no-unmanaged-interval -- local clock only, no network calls; cleared on teardown\nsetInterval(updateClock, 1000);",
    rule: "no-unmanaged-interval",
    count: 0,
  },
];

for (const { name, code, rule, count } of cases) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), "anti-cloudflare-cost-"));
    try {
      writeFileSync(join(directory, "fixture.js"), code);
      writeFileSync(
        join(directory, ".oxlintrc.json"),
        JSON.stringify({
          jsPlugins: [{ name: "anti-cloudflare-cost", specifier: plugin }],
          categories: { correctness: "off" },
          rules: { [`anti-cloudflare-cost/${rule}`]: "error" },
        }),
      );
      const result = spawnSync(
        process.execPath,
        [
          cli,
          "--config",
          join(directory, ".oxlintrc.json"),
          "--format",
          "json",
          join(directory, "fixture.js"),
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, count ? 1 : 0, result.stdout + result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.diagnostics.length, count, result.stdout);
      for (const diagnostic of output.diagnostics) {
        assert.ok(diagnostic.code.includes(rule), JSON.stringify(diagnostic));
        assert.ok(diagnostic.message.includes("Review"));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("browser override leaves server intervals alone", () => {
  const directory = mkdtempSync(join(tmpdir(), "anti-cloudflare-cost-"));
  try {
    writeFileSync(join(directory, "client.js"), "setInterval(poll, 1000);");
    writeFileSync(
      join(directory, "server.js"),
      "setInterval(maintenance, 1000);",
    );
    writeFileSync(
      join(directory, ".oxlintrc.json"),
      JSON.stringify({
        jsPlugins: [{ name: "anti-cloudflare-cost", specifier: plugin }],
        categories: { correctness: "off" },
        overrides: [
          {
            files: ["client.js"],
            rules: { "anti-cloudflare-cost/no-unmanaged-interval": "error" },
          },
        ],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--config",
        join(directory, ".oxlintrc.json"),
        "--format",
        "json",
        directory,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const { diagnostics } = JSON.parse(result.stdout);
    assert.equal(diagnostics.length, 1);
    assert.ok(diagnostics[0].filename.endsWith("client.js"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("vendored plugin loads inside a CommonJS project", () => {
  const directory = mkdtempSync(join(tmpdir(), "anti-cloudflare-cost-"));
  try {
    cpSync(resolve("src"), join(directory, "tools"), { recursive: true });
    symlinkSync(
      resolve("node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ type: "commonjs" }),
    );
    writeFileSync(join(directory, "fixture.js"), "store.setAlarm(123);");
    writeFileSync(
      join(directory, ".oxlintrc.json"),
      JSON.stringify({
        jsPlugins: [
          {
            name: "anti-cloudflare-cost",
            specifier: join(directory, "tools/index.js"),
          },
        ],
        categories: { correctness: "off" },
        rules: { "anti-cloudflare-cost/require-alarm-review": "error" },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--config",
        join(directory, ".oxlintrc.json"),
        "--format",
        "json",
        join(directory, "fixture.js"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const { diagnostics } = JSON.parse(result.stdout);
    assert.equal(diagnostics.length, 1);
    assert.ok(diagnostics[0].code.includes("require-alarm-review"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
