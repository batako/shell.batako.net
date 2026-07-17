import assert from "node:assert/strict";
import test from "node:test";
import {
  commonPrefix,
  detectContentLanguage,
  isXSessionResume,
  nextCompletionIndex,
  parseLsArguments,
  shouldPlayErrorTone,
} from "../app/shell-logic.ts";

test("recognizes only the explicit X session resume flag", () => {
  assert.equal(isXSessionResume("?resume=x11"), true);
  assert.equal(isXSessionResume("?resume=x11&source=gui"), true);
  assert.equal(isXSessionResume("?resume=other"), false);
  assert.equal(isXSessionResume("?skipBoot=true"), false);
  assert.equal(isXSessionResume(""), false);
});

test("uses Japanese only when it is the browser's highest-priority language", () => {
  assert.equal(detectContentLanguage(["ja-JP", "en-US"]), "ja");
  assert.equal(detectContentLanguage(["en-US", "ja"]), "en");
  assert.equal(detectContentLanguage(["en-US", "fr-FR"]), "en");
  assert.equal(detectContentLanguage([]), "en");
});

test("finds the shared prefix for command completion", () => {
  assert.equal(commonPrefix(["profile", "projects"]), "pro");
  assert.equal(commonPrefix(["cat"]), "cat");
  assert.equal(commonPrefix([]), "");
});

test("cycles completion selection in both directions", () => {
  assert.equal(nextCompletionIndex(0, 2, 1), 1);
  assert.equal(nextCompletionIndex(1, 2, 1), 0);
  assert.equal(nextCompletionIndex(0, 2, -1), 1);
  assert.equal(nextCompletionIndex(1, 2, -1), 0);
  assert.equal(nextCompletionIndex(0, 0, 1), 0);
});

test("parses supported ls option combinations", () => {
  assert.deepEqual(parseLsArguments([]), {
    ok: true,
    long: false,
    pathArg: ".",
    showAll: false,
  });
  assert.deepEqual(parseLsArguments(["-l", "Projects"]), {
    ok: true,
    long: true,
    pathArg: "Projects",
    showAll: false,
  });
  assert.deepEqual(parseLsArguments(["-la"]), {
    ok: true,
    long: true,
    pathArg: ".",
    showAll: true,
  });
  assert.deepEqual(parseLsArguments(["-al"]), parseLsArguments(["-la"]));
});

test("rejects unsupported ls options and extra paths", () => {
  assert.deepEqual(parseLsArguments(["-x"]), {
    ok: false,
    error: "ls: invalid option -- 'x'",
  });
  assert.deepEqual(parseLsArguments(["Profile", "Projects"]), {
    ok: false,
    error: "ls: extra operand 'Projects'",
  });
});

test("plays an error tone once for every audible error output", () => {
  assert.equal(shouldPlayErrorTone("error", true), true);
  assert.equal(shouldPlayErrorTone("error", false), false);
  assert.equal(shouldPlayErrorTone("text", true), false);
  assert.equal(shouldPlayErrorTone("command", true), false);
});
