import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

test("statically renders Batako Studio", async () => {
  const html = await render();
  assert.match(html, /<title>cat README\.md # Batako<\/title>/i);
  assert.match(html, /<meta name="description" content="Batakoのインタラクティブシェル。"\/>/);
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/shell\.batako\.net\/?"\/>/,
  );
  assert.doesNotMatch(html, /ポートフォリオ|portfolio/i);
  assert.match(
    html,
    /rel="icon"[^>]*href="(?:https:\/\/shell\.batako\.net)?\/favicon\.svg"/i,
  );
  assert.match(html, /Batako Studio workstation console/);
  assert.match(html, /aria-label="電源を入れる"/);
  assert.match(html, /YUKI\.N&gt;/);
  assert.match(html, /READY\?/);
  assert.match(html, /os-power-off/);
  assert.doesNotMatch(html, /\[sound:/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the workstation static and sandboxed", async () => {
  const [terminal, globals, page, layout, packageJson, amplifyConfig, specMatrix, sitemap, robots] = await Promise.all([
    readFile(new URL("../app/terminal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../amplify.yml", import.meta.url), "utf8"),
    readFile(new URL("./SPEC_MATRIX.md", import.meta.url), "utf8"),
    readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
  ]);

  assert.match(terminal, /const vfs = directory/);
  assert.match(terminal, /BATKO SYSTEMS BIOS v1\.0\.0/);
  assert.match(terminal, /Firmware Core: SeaBIOS-compatible/);
  assert.match(terminal, /Debian GNU\/Linux 13 workstation tty1/);
  assert.match(terminal, /VirtIO Block Device \/dev\/vda/);
  assert.doesNotMatch(terminal, /SATA0|6\.12\.0-generic/);
  assert.doesNotMatch(terminal, /BATKO Boot Manager|6\.12\.0-batako|BATKO_VDISK/);
  assert.doesNotMatch(terminal, /Portfolio/);
  assert.doesNotMatch(terminal, /terminal-window|terminal-bar|terminal-footer/);
  assert.match(terminal, /shell syntax is not supported/);
  assert.doesNotMatch(terminal, /\beval\s*\(/);
  assert.match(globals, /\.completion-list\s*\{[^}]*display:\s*flex/s);
  assert.match(globals, /\.input-line input\s*\{[^}]*font:\s*inherit/s);
  assert.match(globals, /\.input-line input\s*\{[^}]*color:\s*var\(--ink\)/s);
  assert.match(globals, /\.auto-input\s*\{[^}]*color:\s*var\(--ink\)/s);
  assert.match(
    globals,
    /\.completion-candidate-active\s*\{[^}]*background:\s*var\(--ink\)[^}]*color:\s*var\(--black\)/s,
  );
  assert.match(globals, /\.crt-active \.crt-instability\s*\{[^}]*animation:/s);
  assert.match(globals, /\.power-stage\s*\{[^}]*position:\s*fixed/s);
  assert.match(globals, /\.power-stage\s*\{[^}]*cursor:\s*default/s);
  assert.match(globals, /\.power-switch\s*\{[^}]*cursor:\s*pointer/s);
  assert.match(globals, /\.power-message\s*\{[^}]*gap:\s*clamp\(/s);
  assert.match(globals, /\.power-message-cursor\s*\{[^}]*animation:\s*power-message-cursor-blink/s);
  assert.match(globals, /\.boot-cursor-hidden,\s*\.boot-cursor-hidden \*\s*\{[^}]*cursor:\s*none\s*!important/s);
  assert.match(globals, /\.os-powering-on \.power-display\s*\{[^}]*width:\s*100vw/s);
  assert.match(globals, /\.os-powering-on \.power-display\s*\{[^}]*height:\s*100dvh/s);
  assert.doesNotMatch(globals, /\.crt-settled/);
  assert.match(globals, /\.crt-instability\s*\{[^}]*z-index:\s*1/s);
  assert.match(globals, /\.crt-active \.scanlines\s*\{[^}]*opacity:\s*0\.09/s);
  assert.doesNotMatch(
    globals,
    /\.crt-active \.console-scroll\s*\{[^}]*text-shadow:/s,
  );
  assert.doesNotMatch(globals, /filter:\s*brightness/);
  assert.match(globals, /@keyframes crt-signal-jitter/);
  assert.match(globals, /\.boot-brand\s*\{[^}]*color:\s*#e6e6e6/s);
  assert.match(globals, /\.boot-bios-dim\s*\{[^}]*color:\s*#747874/s);
  assert.match(globals, /\.boot-kernel\s*\{[^}]*color:\s*#aeb5b0/s);
  assert.match(globals, /\.boot-status-ok\s*\{[^}]*color:\s*#87a98c/s);
  assert.match(globals, /\.boot-status-failed\s*\{[^}]*color:\s*#c4776b/s);
  assert.match(page, /<Terminal \/>/);
  assert.match(layout, /lang="ja"/);
  assert.match(layout, /metadataBase:\s*new URL\("https:\/\/shell\.batako\.net"\)/);
  assert.match(layout, /canonical:\s*"\/"/);
  assert.match(layout, /icon:\s*"\/favicon\.svg"/);
  assert.match(packageJson, /"node": "24\.x"/);
  assert.match(packageJson, /"name": "shell\.batako\.net"/);
  assert.match(amplifyConfig, /^\s*baseDirectory: \.next$/m);
  assert.match(sitemap, /<loc>https:\/\/shell\.batako\.net\/<\/loc>/);
  assert.doesNotMatch(sitemap, /<lastmod>/);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/shell\.batako\.net\/sitemap\.xml$/m);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(specMatrix, /- \[ \]/);
});
