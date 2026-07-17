"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RetroAudio } from "./retro-audio";
import { navigateCurrentTab } from "./browser-navigation";
import {
  commonPrefix,
  type CompletionCandidate,
  type ContentLanguage,
  detectContentLanguage,
  isXSessionResume,
  nextCompletionIndex,
  parseLsArguments,
  shouldPlayErrorTone,
} from "./shell-logic";

type FileNode = {
  type: "file" | "directory" | "url" | "image";
  content?: string;
  localizedContent?: Record<ContentLanguage, string>;
  url?: string;
  children?: Record<string, FileNode>;
};

type ListingEntry = {
  name: string;
  path: string;
  prefix?: string;
  type: FileNode["type"];
  url?: string;
};

type ListingData = {
  entries: ListingEntry[];
  long: boolean;
  total?: number;
};

type Output = {
  id: number;
  kind: "command" | "text" | "error" | "system" | "tree" | "listing";
  content: ReactNode;
  listing?: ListingData;
  prompt?: string;
};

type BootLine = {
  text: string;
  delay: number;
  tone?:
    | "brand"
    | "bios-dim"
    | "bios-status"
    | "loader"
    | "dim"
    | "ok"
    | "kernel"
    | "login";
};

type BootPhase =
  | "power-off"
  | "powering-on"
  | "boot"
  | "refresh-login"
  | "login"
  | "refresh-shell"
  | "shell";

function BootText({ text }: { text: string }) {
  const status = text.match(/^(\[\s*(OK|FAILED|DEPEND|WARN)\s*\])(.*)$/);

  if (!status) return <>{text || "\u00a0"}</>;

  return (
    <>
      <span className={`boot-status boot-status-${status[2].toLowerCase()}`}>
        {status[1]}
      </span>
      {status[3]}
    </>
  );
}

function entryActionLabel(entry: ListingEntry) {
  if (entry.type === "directory") {
    if (entry.name === ".") return "List current directory";
    if (entry.name === "..") return "Open parent directory";
    return `Open directory ${entry.name}`;
  }
  if (entry.type === "url") return `Open URL ${entry.name}`;
  return `Read file ${entry.name}`;
}

function LinkifiedText({
  text,
  onPathActivate,
}: {
  text: string;
  onPathActivate?: (entry: ListingEntry) => void;
}) {
  return text.split(/(https?:\/\/[^\s]+|~\/[A-Za-z0-9._/-]+)/g).map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
      <a
        className="output-link"
        draggable={false}
        href={part}
        key={`${part}-${index}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {part}
      </a>
      );
    }

    if (part.startsWith("~/") && onPathActivate) {
      const path = normalizePath(part, HOME);
      const node = nodeAt(path);
      if (node) {
        const entry = { name: part, path, type: node.type, url: node.url };
        return (
          <button
            type="button"
            className="terminal-action"
            data-terminal-action
            key={`${part}-${index}`}
            onClick={() => onPathActivate(entry)}
            aria-label={entryActionLabel(entry)}
          >
            {part}
          </button>
        );
      }
    }

    return part;
  });
}

function ListingOutput({
  listing,
  onActivate,
}: {
  listing: ListingData;
  onActivate: (entry: ListingEntry) => void;
}) {
  return (
    <pre>
      {listing.total !== undefined && `total ${listing.total}\n`}
      {listing.entries.map((entry, index) => (
        <span key={`${entry.path}-${entry.name}`}>
          {entry.prefix}
          <button
            type="button"
            className="terminal-action"
            data-terminal-action
            onClick={() => onActivate(entry)}
            aria-label={entryActionLabel(entry)}
          >
            {entry.name}
          </button>
          {index < listing.entries.length - 1
            ? listing.long
              ? "\n"
              : "  "
            : ""}
        </span>
      ))}
    </pre>
  );
}

const HOME = "/home/batako";
export const COMMANDS = [
  "pwd",
  "ls",
  "cd",
  "cat",
  "tree",
  "clear",
  "history",
  "date",
  "echo",
  "alias",
  "help",
  "sound",
  "startx",
  "open",
  "exit",
];

export const GUI_URL = "https://batako.net";

const shortcuts: Record<string, string> = {
  profile: "cat ~/Profile/README.md",
  projects: "cat ~/Projects/README.md",
  skills: "cat ~/Profile/skills.md",
  contact: "cat ~/Contact/README.md",
};

const file = (content: string): FileNode => ({ type: "file", content });
const localizedFile = (content: Record<ContentLanguage, string>): FileNode => ({
  type: "file",
  localizedContent: content,
});
const directory = (children: Record<string, FileNode>): FileNode => ({
  type: "directory",
  children,
});

const vfs = directory({
  home: directory({
    batako: directory({
      ".zshrc": file(
        [
          "# batako workstation shell configuration",
          'ZSH_THEME="batako"',
          "",
          "alias profile='cat ~/Profile/README.md'",
          "alias projects='cat ~/Projects/README.md'",
          "alias skills='cat ~/Profile/skills.md'",
          "alias contact='cat ~/Contact/README.md'",
        ].join("\n"),
      ),
      "README.md": localizedFile({
        en: [
          "# workstation",
          "",
          "owner: batako",
          "",
          'Type "help" for available commands.',
        ].join("\n"),
        ja: [
          "# workstation",
          "",
          "owner: batako",
          "",
          '利用可能なコマンドは "help" で確認できます。',
        ].join("\n"),
      }),
      Profile: directory({
        "README.md": localizedFile({
          en: [
            "# Profile",
            "",
            "I have a background in web application development, primarily frontend,",
            "with full-stack experience using Ruby on Rails.",
            "",
            "I am currently focused on hands-on web security learning through TryHackMe",
            "and building tools that support my own workflow.",
            "",
            "## Favorite Words",
            "",
            '"Face reality! Virtual reality is the only reality we\'ve got."',
            "",
            "Adapted from a line in the manga Ressentiment.",
          ].join("\n"),
          ja: [
            "# プロフィール",
            "",
            "主にフロントエンドを中心としたWebアプリケーション開発の経験があり、",
            "Ruby on Railsを使ったフルスタック開発にも携わってきました。",
            "",
            "現在はTryHackMeでWebセキュリティを実践的に学びながら、",
            "自分の作業を支援するツールを作っています。",
            "",
            "## 好きな言葉",
            "",
            '「現実を直視しろ。おれ達にはもう仮想現実しかないんだ。」',
            "",
            "漫画『ルサンチマン』の一節をもとにしています。",
          ].join("\n"),
        }),
        "skills.md": localizedFile({
          en: [
            "# Skills",
            "",
            "Frontend-focused web developer with about 10 years of experience.",
            "Able to build and deliver full-stack applications independently with Ruby on Rails.",
            "",
            "## Primary",
            "- Ruby on Rails: full-stack application development",
            "- TypeScript / JavaScript: day-to-day frontend development",
            "- React: current frontend focus; used professionally on several projects",
            "- Vue 2 / Vue 3: previous primary frontend framework",
            "  - Options API / Composition API",
            "  - Vuex / Pinia",
            "",
            "## Professional Experience",
            "- Docker / Docker Compose: development environments",
            "- AWS: EC2 setup; ECS operation and log inspection",
            "- Linux: daily command-line use and EC2 server setup",
            "- PostgreSQL: application development through Rails",
            "- Testing: RSpec / Jest",
            "- CI/CD: GitHub Actions",
            "",
            "## Additional Experience",
            "- AWS: S3 / Amplify / Route 53",
            "- Bash / Zsh: personal scripts and shell environment",
            "- PHP / Python: limited professional experience",
            "",
            "## Security Learning",
            "- Web penetration testing through TryHackMe",
            "- Hands-on practice from service enumeration through privilege escalation",
            "- Hands-on use: Nmap, Burp Suite, Gobuster, ffuf, Hydra, Metasploit,",
            "  John the Ripper, Wireshark, and SQLmap",
            "- Built a Kali Linux environment with kali-tools installed",
            "  See: ~/Projects/kali-linux.url",
            "- Built kali-tools, a reconnaissance wrapper that automates workflows",
            "  and prints the underlying commands for review",
            "  See: ~/Projects/kali-tools.url",
            "- Built req-firefox-extension to export files consumed by custom commands",
            "  See: ~/Projects/req-firefox-extension.url",
          ].join("\n"),
          ja: [
            "# スキル",
            "",
            "フロントエンドを中心に約10年のWeb開発経験があります。",
            "Ruby on Railsを使い、フルスタックのアプリケーションを一人で構築・提供できます。",
            "",
            "## 主な技術",
            "- Ruby on Rails：フルスタックのアプリケーション開発",
            "- TypeScript / JavaScript：日常的なフロントエンド開発",
            "- React：現在の主なフロントエンド技術。複数案件での実務経験あり",
            "- Vue 2 / Vue 3：以前の主なフロントエンドフレームワーク",
            "  - Options API / Composition API",
            "  - Vuex / Pinia",
            "",
            "## 実務経験",
            "- Docker / Docker Compose：開発環境",
            "- AWS：EC2の構築、ECSの運用とログ確認",
            "- Linux：日常的なコマンド操作とEC2サーバー構築",
            "- PostgreSQL：Railsを通じたアプリケーション開発",
            "- テスト：RSpec / Jest",
            "- CI/CD：GitHub Actions",
            "",
            "## その他の経験",
            "- AWS：S3 / Amplify / Route 53",
            "- Bash / Zsh：個人用スクリプトとシェル環境",
            "- PHP / Python：限定的な実務経験",
            "",
            "## セキュリティ学習",
            "- TryHackMeを使ったWebペネトレーションテスト",
            "- サービス列挙から権限昇格までの実践",
            "- 使用経験：Nmap、Burp Suite、Gobuster、ffuf、Hydra、Metasploit、",
            "  John the Ripper、Wireshark、SQLmap",
            "- kali-toolsを導入したKali Linux環境を構築",
            "  参照：~/Projects/kali-linux.url",
            "- 偵察作業を自動化し、確認用に実コマンドを出力するkali-toolsを開発",
            "  参照：~/Projects/kali-tools.url",
            "- 独自コマンドで利用するファイルを出力するreq-firefox-extensionを開発",
            "  参照：~/Projects/req-firefox-extension.url",
          ].join("\n"),
        }),
      }),
      Projects: directory({
        "README.md": localizedFile({
          en: [
            "# Projects",
            "kali-linux.url             https://github.com/batako/kali-linux",
            "  Kali Linux environment with kali-tools installed",
            "",
            "kali-tools.url             https://github.com/batako/kali-tools",
            "  Reconnaissance workflow wrapper with command output for review",
            "",
            "req-firefox-extension.url  https://github.com/batako/req-firefox-extension",
            "  Firefox extension that exports files consumed by custom commands",
            "",
            "Try: open kali-linux.url",
          ].join("\n"),
          ja: [
            "# プロジェクト",
            "kali-linux.url             https://github.com/batako/kali-linux",
            "  kali-toolsを導入したKali Linux環境",
            "",
            "kali-tools.url             https://github.com/batako/kali-tools",
            "  実コマンドを確認できる偵察作業用ラッパー",
            "",
            "req-firefox-extension.url  https://github.com/batako/req-firefox-extension",
            "  独自コマンドで利用するファイルを出力するFirefox拡張機能",
            "",
            "実行例：open kali-linux.url",
          ].join("\n"),
        }),
        "kali-linux.url": {
          type: "url",
          url: "https://github.com/batako/kali-linux",
        },
        "kali-tools.url": {
          type: "url",
          url: "https://github.com/batako/kali-tools",
        },
        "req-firefox-extension.url": {
          type: "url",
          url: "https://github.com/batako/req-firefox-extension",
        },
      }),
      Contact: directory({
        "README.md": localizedFile({
          en: [
            "# Contact",
            "github.url        https://github.com/batako",
            "tryhackme.url     https://tryhackme.com/p/batako",
            "hackthebox.url    https://profile.hackthebox.com/profile/019f706b-e8f0-7184-a186-10295f0c7a64",
            "rootme.url        https://www.root-me.org/batako",
            "pentesterlab.url  https://pentesterlab.com/profile/batako",
            "blog.url          https://log.batako.net",
          ].join("\n"),
          ja: [
            "# コンタクト",
            "github.url        https://github.com/batako",
            "tryhackme.url     https://tryhackme.com/p/batako",
            "hackthebox.url    https://profile.hackthebox.com/profile/019f706b-e8f0-7184-a186-10295f0c7a64",
            "rootme.url        https://www.root-me.org/batako",
            "pentesterlab.url  https://pentesterlab.com/profile/batako",
            "blog.url          https://log.batako.net",
          ].join("\n"),
        }),
        "github.url": { type: "url", url: "https://github.com/batako" },
        "tryhackme.url": {
          type: "url",
          url: "https://tryhackme.com/p/batako",
        },
        "hackthebox.url": {
          type: "url",
          url: "https://profile.hackthebox.com/profile/019f706b-e8f0-7184-a186-10295f0c7a64",
        },
        "rootme.url": {
          type: "url",
          url: "https://www.root-me.org/batako",
        },
        "pentesterlab.url": {
          type: "url",
          url: "https://pentesterlab.com/profile/batako",
        },
        "blog.url": { type: "url", url: "https://log.batako.net" },
      }),
      Pictures: directory({}),
    }),
  }),
});

export const bootLines: BootLine[] = [
  { text: "BATKO SYSTEMS BIOS v1.0.0", delay: 1100, tone: "brand" },
  { text: "Copyright (C) 2026 Batako Studio", delay: 1220, tone: "bios-dim" },
  { text: "", delay: 1320 },
  { text: "Firmware Core: SeaBIOS-compatible", delay: 1410, tone: "bios-dim" },
  { text: "System Model: B-01 VIRTUAL WORKSTATION", delay: 1510 },
  { text: "System Role: Public read-only console", delay: 1600 },
  { text: "CPU: QEMU Virtual CPU, 4 cores @ 3.40GHz", delay: 1720 },
  { text: "Memory Test: 16384 MB ................. OK", delay: 1810, tone: "bios-status" },
  { text: "SMBIOS 3.0 table ...................... Valid", delay: 1900 },
  { text: "ACPI tables ........................... Ready", delay: 1990 },
  { text: "PCI bus scan ......................... 07 devices", delay: 2080 },
  { text: "VGA adapter .......................... SeaVGABIOS", delay: 2170 },
  { text: "USB controller ....................... Initialized", delay: 2260 },
  { text: "Keyboard ............................. Detected", delay: 2350, tone: "bios-status" },
  { text: "Network: VirtIO NIC .................. Isolated", delay: 2470, tone: "bios-dim" },
  { text: "Block device: VirtIO VIRTUAL_DISK_01 128 GiB", delay: 2580 },
  { text: "Boot volume: /dev/vda1 ............... Read-only", delay: 2680 },
  { text: "RTC clock ............................ Synchronized", delay: 2780 },
  { text: "", delay: 2900 },
  { text: "POST complete. No errors detected.", delay: 3050, tone: "bios-status" },
  { text: "Boot device: VirtIO Block Device /dev/vda", delay: 3220 },
  { text: "", delay: 3320 },
  { text: "Booting from /dev/vda...", delay: 3660, tone: "loader" },
  { text: "Loading Linux 6.12.0-amd64 ........... done", delay: 3890, tone: "loader" },
  { text: "Loading initial ramdisk .............. done", delay: 4060, tone: "loader" },
  { text: "", delay: 4210 },
  { text: "[    0.000000] Linux version 6.12.0-amd64", delay: 4480, tone: "kernel" },
  { text: "[    0.000031] Command line: root=/dev/vda1 ro console=tty1", delay: 4570, tone: "kernel" },
  { text: "[    0.019824] x86: Booting SMP configuration", delay: 4660, tone: "kernel" },
  { text: "[    0.041337] smp: Brought up 4 vCPUs", delay: 4750, tone: "kernel" },
  { text: "[    0.086201] Memory: 15942M available", delay: 4840, tone: "kernel" },
  { text: "[    0.141882] ACPI: Interpreter enabled", delay: 4930, tone: "kernel" },
  { text: "[    0.205773] clocksource: Switched to tsc-early", delay: 5020, tone: "kernel" },
  { text: "[    0.282410] VFS: Disk quotas disabled", delay: 5110, tone: "kernel" },
  { text: "[    0.347105] virtio_net virtio0: interface initialized", delay: 5200, tone: "kernel" },
  { text: "[    0.419602] input: AT Translated Set 2 keyboard", delay: 5290, tone: "kernel" },
  { text: "[    0.501194] random: crng init done", delay: 5380, tone: "kernel" },
  { text: "[    0.571802] virtio_blk virtio1: [vda] 128 GiB", delay: 5470, tone: "kernel" },
  { text: "[    0.628410] EXT4-fs (vda1): mounted filesystem ro", delay: 5535, tone: "kernel" },
  { text: "[    0.731205] Run /sbin/init as init process", delay: 5600, tone: "kernel" },
  { text: "", delay: 5710 },
  { text: "[    1.018204] systemd 257 running in system mode", delay: 5940, tone: "kernel" },
  { text: "[  OK  ] Created slice system-getty.slice", delay: 6040, tone: "ok" },
  { text: "[  OK  ] Started Journal Service", delay: 6140, tone: "ok" },
  { text: "[  OK  ] Finished Load Kernel Modules", delay: 6240, tone: "ok" },
  { text: "[  OK  ] Finished Remount Root and Kernel File Systems", delay: 6440, tone: "ok" },
  { text: "[  OK  ] Reached target Local File Systems", delay: 6810, tone: "ok" },
  { text: "         Starting Create Static Device Nodes...", delay: 6920, tone: "dim" },
  { text: "[  OK  ] Finished Create Static Device Nodes", delay: 7030, tone: "ok" },
  { text: "         Starting Apply Kernel Variables...", delay: 7140, tone: "dim" },
  { text: "[  OK  ] Finished Apply Kernel Variables", delay: 7250, tone: "ok" },
  { text: "[  OK  ] Reached target System Initialization", delay: 7380, tone: "ok" },
  { text: "         Mounting /home/batako...", delay: 7460, tone: "dim" },
  { text: "[  OK  ] Mounted /home/batako (read-only)", delay: 7590, tone: "ok" },
  { text: "         Starting User Login Management...", delay: 7710, tone: "dim" },
  { text: "[  OK  ] Started User Login Management", delay: 7850, tone: "ok" },
  { text: "         Starting Permit User Sessions...", delay: 7970, tone: "dim" },
  { text: "[  OK  ] Finished Permit User Sessions", delay: 8230, tone: "ok" },
  { text: "[  OK  ] Started Console Font and Keymap", delay: 8350, tone: "ok" },
  { text: "[  OK  ] Started D-Bus System Message Bus", delay: 8580, tone: "ok" },
  { text: "[  OK  ] Enforced isolated network policy", delay: 8710, tone: "ok" },
  { text: "[  OK  ] Reached target Timers", delay: 8840, tone: "ok" },
  { text: "[  OK  ] Reached target Paths", delay: 8970, tone: "ok" },
  { text: "[  OK  ] Reached target Sockets", delay: 9100, tone: "ok" },
  { text: "[  OK  ] Reached target Multi-User System", delay: 9230, tone: "ok" },
  { text: "[  OK  ] Started Getty on tty1", delay: 9430, tone: "ok" },
  { text: "[  OK  ] Reached target Login Prompts", delay: 9560, tone: "ok" },
  { text: "         Startup finished in 9.812s.", delay: 10020, tone: "dim" },
];

function normalizePath(input: string, cwd: string) {
  const expanded = input.startsWith("~") ? `${HOME}${input.slice(1)}` : input;
  const source = expanded.startsWith("/") ? expanded : `${cwd}/${expanded}`;
  const parts: string[] = [];
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function nodeAt(path: string): FileNode | null {
  if (path === "/") return vfs;
  let node: FileNode = vfs;
  for (const part of path.split("/").filter(Boolean)) {
    if (node.type !== "directory" || !node.children?.[part]) return null;
    node = node.children[part];
  }
  return node;
}

function nodeContent(node: FileNode | undefined, language: ContentLanguage) {
  return node?.localizedContent?.[language] ?? node?.content ?? node?.url ?? "[not configured]";
}

function displayPath(path: string) {
  if (path === HOME) return "~";
  if (path.startsWith(`${HOME}/`)) return `~${path.slice(HOME.length)}`;
  return path;
}

function tokenize(input: string) {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      token += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else token += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (token) tokens.push(token);
      token = "";
    } else {
      token += char;
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

function treeLines(node: FileNode, prefix = ""): string[] {
  if (node.type !== "directory") return [];
  const entries = Object.entries(node.children ?? {});
  return entries.flatMap(([name, child], index) => {
    const last = index === entries.length - 1;
    const line = `${prefix}${last ? "└──" : "├──"} ${name}`;
    return [
      line,
      ...treeLines(child, `${prefix}${last ? "    " : "│   "}`),
    ];
  });
}

function lsEntrySize(node: FileNode) {
  if (node.type === "directory") return 4096;
  return (node.localizedContent?.en ?? node.content ?? node.url ?? "").length;
}

function lsLongParts(name: string, node: FileNode) {
  const directoryCount = Object.values(node.children ?? {}).filter(
    (child) => child.type === "directory",
  ).length;
  const links = node.type === "directory" ? 2 + directoryCount : 1;
  const mode = node.type === "directory" ? "dr-xr-xr-x" : "-r--r--r--";
  const size = String(lsEntrySize(node)).padStart(6);
  return {
    name,
    prefix: `${mode} ${String(links).padStart(2)} batako batako ${size} Jul 18  2026 `,
  };
}

function lsLongLine(name: string, node: FileNode) {
  const parts = lsLongParts(name, node);
  return `${parts.prefix}${parts.name}`;
}

export function Terminal() {
  const [resumeXSession] = useState(() =>
    typeof window !== "undefined" && isXSessionResume(window.location.search),
  );
  const [phase, setPhase] = useState<BootPhase>(
    resumeXSession ? "refresh-shell" : "power-off",
  );
  const [visibleBootLines, setVisibleBootLines] = useState<BootLine[]>([]);
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStep, setLoginStep] = useState<
    "waiting" | "username" | "password" | "authenticated"
  >("waiting");
  const [cwd, setCwd] = useState(HOME);
  const [input, setInput] = useState("");
  const [completionCandidates, setCompletionCandidates] = useState<CompletionCandidate[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [outputs, setOutputs] = useState<Output[]>(() =>
    resumeXSession
      ? [{ id: 1, kind: "text", content: "X session terminated." }]
      : [],
  );
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [contentLanguage] = useState<ContentLanguage>(() =>
    typeof navigator === "undefined"
      ? "en"
      : detectContentLanguage(navigator.languages),
  );
  const [audioReady, setAudioReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [initialBootComplete, setInitialBootComplete] = useState(false);
  const [xSessionStarting, setXSessionStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cwdRef = useRef(HOME);
  const historyRef = useRef<string[]>([]);
  const completionOriginalInput = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const forceScrollRef = useRef(false);
  const nextId = useRef(resumeXSession ? 2 : 1);
  const initialized = useRef(resumeXSession);
  const powerOnTimer = useRef<number | null>(null);
  const xNavigationTimer = useRef<number | null>(null);
  const pointerCommandTimers = useRef<number[]>([]);
  const pointerCommandBusy = useRef(false);
  const preopenedUrl = useRef<string | null>(null);
  const executeRef = useRef<(raw: string) => void>(() => {});
  const audioRef = useRef<RetroAudio | null>(null);
  const previousBootLineCount = useRef(0);
  const booted = phase === "shell";
  const bootTimelineStarted =
    !resumeXSession && phase !== "power-off" && phase !== "powering-on";

  if (audioRef.current === null) {
    audioRef.current = new RetroAudio();
  }

  const prompt = useMemo(
    () => `batako@workstation:${displayPath(cwd)}$`,
    [cwd],
  );

  useEffect(() => {
    if (!resumeXSession) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
    const timer = window.setTimeout(() => {
      setPhase("shell");
      setInteractive(true);
      setInitialBootComplete(true);
    }, 620);
    return () => window.clearTimeout(timer);
  }, [resumeXSession]);

  useEffect(
    () => () => {
      if (xNavigationTimer.current !== null) {
        window.clearTimeout(xNavigationTimer.current);
      }
      if (powerOnTimer.current !== null) {
        window.clearTimeout(powerOnTimer.current);
      }
      pointerCommandTimers.current.forEach(window.clearTimeout);
    },
    [],
  );

  useEffect(() => {
    window.localStorage.setItem("batako-sound", "on");

    let cancelled = false;
    const startAudio = async () => {
      if (cancelled || window.localStorage.getItem("batako-sound") === "off") {
        return;
      }
      const unlocked = await audioRef.current?.unlock();
      if (!cancelled && unlocked) {
        setAudioReady(true);
      }
    };
    const resumeFromInteraction = () => void startAudio();

    void startAudio();
    window.addEventListener("pointerdown", resumeFromInteraction);
    window.addEventListener("keydown", resumeFromInteraction);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", resumeFromInteraction);
      window.removeEventListener("keydown", resumeFromInteraction);
    };
  }, []);

  useEffect(() => {
    if (!bootTimelineStarted) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const reducedTimers = [
        window.setTimeout(() => setVisibleBootLines(bootLines), 0),
        window.setTimeout(() => setPhase("refresh-login"), 500),
        window.setTimeout(() => {
          setLoginUser("batako");
          setLoginPassword("********");
          setLoginStep("authenticated");
          setPhase("login");
        }, 700),
        window.setTimeout(() => setPhase("refresh-shell"), 1400),
        window.setTimeout(() => setPhase("shell"), 1650),
      ];
      return () => reducedTimers.forEach(window.clearTimeout);
    }

    const timers = bootLines.map((line) =>
      window.setTimeout(
        () => setVisibleBootLines((current) => [...current, line]),
        line.delay,
      ),
    );
    timers.push(window.setTimeout(() => setPhase("refresh-login"), 10600));
    timers.push(window.setTimeout(() => setPhase("login"), 11300));
    timers.push(window.setTimeout(() => setLoginStep("username"), 11850));
    timers.push(
      ...Array.from("batako").map((_, index) =>
        window.setTimeout(
          () => setLoginUser("batako".slice(0, index + 1)),
          11950 + index * 78,
        ),
      ),
    );
    timers.push(window.setTimeout(() => setLoginStep("password"), 12550));
    timers.push(
      ...Array.from("********").map((_, index) =>
        window.setTimeout(
          () => setLoginPassword("********".slice(0, index + 1)),
          12650 + index * 62,
        ),
      ),
    );
    timers.push(window.setTimeout(() => setLoginStep("authenticated"), 13200));
    timers.push(window.setTimeout(() => setPhase("refresh-shell"), 13900));
    timers.push(window.setTimeout(() => setPhase("shell"), 14600));
    return () => timers.forEach(window.clearTimeout);
  }, [bootTimelineStarted]);

  useEffect(() => {
    if (phase !== "shell" || !interactive || closed) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [closed, interactive, phase]);

  useEffect(() => {
    if (!soundOn || visibleBootLines.length <= previousBootLineCount.current) {
      previousBootLineCount.current = visibleBootLines.length;
      return;
    }

    const line = visibleBootLines.at(-1)?.text ?? "";
    if (line.includes("POST complete")) audioRef.current?.postBeep();
    previousBootLineCount.current = visibleBootLines.length;
  }, [soundOn, visibleBootLines]);

  useEffect(() => {
    if (soundOn && audioReady && (loginUser || loginPassword)) {
      audioRef.current?.keyTap();
    }
  }, [audioReady, loginPassword, loginUser, soundOn]);

  useEffect(() => {
    if (soundOn && audioReady && loginStep === "authenticated") {
      audioRef.current?.enter();
    }
  }, [audioReady, loginStep, soundOn]);

  useEffect(() => {
    if (soundOn && audioReady && !interactive && input) {
      audioRef.current?.keyTap();
    }
  }, [audioReady, input, interactive, soundOn]);

  useEffect(() => {
    if (!booted || initialized.current) return;
    initialized.current = true;
    const command = "cat README.md";
    const timers = Array.from(command).map((_, index) =>
      window.setTimeout(
        () => setInput(command.slice(0, index + 1)),
        320 + index * 66,
      ),
    );
    timers.push(
      window.setTimeout(() => {
        if (soundOn) audioRef.current?.enter();
        setOutputs([
          {
            id: nextId.current++,
            kind: "command",
            content: command,
            prompt: "batako@workstation:~$",
          },
          {
            id: nextId.current++,
            kind: "text",
            content: nodeContent(
              vfs.children?.home.children?.batako.children?.["README.md"],
              contentLanguage,
            ),
          },
        ]);
        setInput("");
        setInteractive(true);
        setInitialBootComplete(true);
      }, 320 + command.length * 66 + 240),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [booted, contentLanguage, soundOn]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const shouldFollow =
      !interactive || forceScrollRef.current || followOutputRef.current;
    forceScrollRef.current = false;
    if (!shouldFollow) return;

    followOutputRef.current = true;
    scroll.scrollTo({
      top: scroll.scrollHeight,
      behavior: booted ? "smooth" : "auto",
    });
  }, [
    booted,
    completionCandidates,
    input,
    interactive,
    loginPassword,
    loginStep,
    loginUser,
    outputs,
    phase,
    visibleBootLines,
  ]);

  const append = useCallback(
    (
      kind: Output["kind"],
      content: ReactNode,
      commandPrompt?: string,
      listing?: ListingData,
    ) => {
      if (shouldPlayErrorTone(kind, soundOn)) audioRef.current?.error();
      setOutputs((current) => [
        ...current,
        { id: nextId.current++, kind, content, listing, prompt: commandPrompt },
      ]);
    },
    [soundOn],
  );

  const setSound = useCallback(async (value: boolean) => {
    if (value) {
      const unlocked = await audioRef.current?.unlock();
      if (!unlocked) return;
      setAudioReady(true);
    } else {
      audioRef.current?.suspend();
      setAudioReady(false);
    }
    setSoundOn(value);
    window.localStorage.setItem("batako-sound", value ? "on" : "off");
  }, []);

  async function powerOn() {
    if (phase !== "power-off") return;
    setPhase("powering-on");
    const unlocked = await audioRef.current?.unlock();
    if (unlocked) setAudioReady(true);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    powerOnTimer.current = window.setTimeout(() => {
      if (soundOn && unlocked) {
        audioRef.current?.crtWake();
      }
      setPhase("boot");
    }, reduced ? 120 : 1200);
  }

  const execute = useCallback(
    (raw: string) => {
      forceScrollRef.current = true;
      const executionCwd = cwdRef.current;
      const executionPrompt = `batako@workstation:${displayPath(executionCwd)}$`;
      const trimmed = raw.trim();
      if (!trimmed) {
        append("command", "", executionPrompt);
        if (soundOn) audioRef.current?.enter();
        return;
      }

      append("command", trimmed, executionPrompt);
      if (soundOn) audioRef.current?.enter();
      const nextHistory = [...historyRef.current, trimmed];
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length);

      if (/[|;&*?$><]/.test(trimmed)) {
        append("error", "shell syntax is not supported");
        return;
      }

      const expanded = shortcuts[trimmed] ?? trimmed;
      const [command, ...args] = tokenize(expanded);

      if (!COMMANDS.includes(command)) {
        append("error", `${command}: command not found`);
        return;
      }

      const targetPath = (value = ".") => normalizePath(value, executionCwd);

      switch (command) {
        case "help":
          append(
            "text",
            [
              "Shortcuts",
              "  profile   projects   skills   contact",
              "",
              "Commands",
              "  pwd  ls  cd  cat  tree  clear  history",
              "  date  echo  alias  startx  open  exit",
              "",
              "Settings",
              "  sound",
            ].join("\n"),
          );
          break;
        case "pwd":
          append("text", executionCwd);
          break;
        case "ls": {
          const parsed = parseLsArguments(args);
          if (!parsed.ok) {
            append("error", parsed.error);
            break;
          }

          const { long, pathArg, showAll } = parsed;
          const resolvedPath = targetPath(pathArg);
          const node = nodeAt(resolvedPath);
          if (!node) append("error", `ls: ${pathArg}: No such file or directory`);
          else if (node.type !== "directory") {
            const parts = long ? lsLongParts(pathArg, node) : undefined;
            const content = long ? lsLongLine(pathArg, node) : pathArg;
            append("listing", content, undefined, {
              entries: [
                {
                  name: pathArg,
                  path: resolvedPath,
                  prefix: parts?.prefix,
                  type: node.type,
                  url: node.url,
                },
              ],
              long,
            });
          } else {
            const entries = Object.entries(node.children ?? {}).filter(
              ([name]) => showAll || !name.startsWith("."),
            );
            const parentPath = normalizePath("..", resolvedPath);
            if (showAll) {
              const parent = nodeAt(parentPath) ?? node;
              entries.unshift([".", node], ["..", parent]);
            }
            const listingEntries = entries.map(([name, child]) => {
              const path =
                name === "."
                  ? resolvedPath
                  : name === ".."
                    ? parentPath
                    : normalizePath(name, resolvedPath);
              return {
                name,
                path,
                prefix: long ? lsLongParts(name, child).prefix : undefined,
                type: child.type,
                url: child.url,
              } satisfies ListingEntry;
            });
            if (long) {
              const total = entries.reduce(
                (sum, [, child]) => sum + Math.max(1, Math.ceil(lsEntrySize(child) / 1024)),
                0,
              );
              append(
                "listing",
                [`total ${total}`, ...entries.map(([name, child]) => lsLongLine(name, child))].join(
                  "\n",
                ),
                undefined,
                { entries: listingEntries, long, total },
              );
            } else {
              append(
                "listing",
                entries.map(([name]) => name).join("  "),
                undefined,
                { entries: listingEntries, long },
              );
            }
          }
          break;
        }
        case "cd": {
          const destination = targetPath(args[0] ?? "~");
          const node = nodeAt(destination);
          if (!node) append("error", `cd: ${args[0]}: No such file or directory`);
          else if (node.type !== "directory")
            append("error", `cd: ${args[0]}: Not a directory`);
          else {
            cwdRef.current = destination;
            setCwd(destination);
          }
          break;
        }
        case "cat": {
          const arg = args[0];
          if (!arg) {
            append("error", "cat: missing operand");
            break;
          }
          const node = nodeAt(targetPath(arg));
          if (!node) append("error", `cat: ${arg}: No such file or directory`);
          else if (node.type === "directory")
            append("error", `cat: ${arg}: Is a directory`);
          else if (node.type === "image") append("text", "Binary file");
          else append("text", nodeContent(node, contentLanguage));
          break;
        }
        case "tree": {
          const arg = args[0] ?? ".";
          const node = nodeAt(targetPath(arg));
          if (!node) append("error", `tree: ${arg}: No such file or directory`);
          else if (node.type !== "directory") append("text", arg);
          else append("tree", [displayPath(targetPath(arg)), ...treeLines(node)].join("\n"));
          break;
        }
        case "clear":
          setOutputs([]);
          break;
        case "history":
          append(
            "text",
            nextHistory.map((item, index) => `${index + 1}  ${item}`).join("\n"),
          );
          break;
        case "date":
          append("text", new Date().toString());
          break;
        case "echo":
          append("text", args.join(" "));
          break;
        case "alias":
          append(
            "text",
            Object.entries(shortcuts)
              .map(([name, value]) => `${name}='${value}'`)
              .join("\n"),
          );
          break;
        case "sound": {
          const next = !soundOn;
          void setSound(next);
          append("text", `sound: ${next ? "on" : "off"}`);
          break;
        }
        case "startx":
          setXSessionStarting(true);
          xNavigationTimer.current = window.setTimeout(
            () => navigateCurrentTab(GUI_URL),
            620,
          );
          break;
        case "open": {
          const arg = args[0];
          if (!arg) {
            append("error", "open: missing operand");
            break;
          }
          const node = nodeAt(targetPath(arg));
          if (!node) append("error", `open: ${arg}: No such file or directory`);
          else if (node.type === "url" && node.url) {
            append("text", `Opening ${node.url}`);
            if (preopenedUrl.current === node.url) preopenedUrl.current = null;
            else window.open(node.url, "_blank", "noopener,noreferrer");
          } else if (node.type === "url") append("error", "open: URL not configured");
          else append("error", "open: unsupported file type");
          break;
        }
        case "exit":
          append("system", "logout\nDebian GNU/Linux 13 workstation tty1");
          setClosed(true);
          break;
      }
    },
    [append, contentLanguage, setSound, soundOn],
  );

  useEffect(() => {
    executeRef.current = execute;
  }, [execute]);

  const runPointerCommands = useCallback(
    async (commands: string[]) => {
      if (pointerCommandBusy.current || !interactive || closed) return;
      pointerCommandBusy.current = true;
      setInteractive(false);
      setCompletionCandidates([]);
      setSelectedCompletion(0);
      window.getSelection()?.removeAllRanges();

      const wait = (milliseconds: number) =>
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, milliseconds);
          pointerCommandTimers.current.push(timer);
        });

      try {
        for (const command of commands) {
          setInput("");
          await wait(70);
          for (let index = 0; index < command.length; index += 1) {
            setInput(command.slice(0, index + 1));
            await wait(42);
          }
          await wait(100);
          setInput("");
          executeRef.current(command);
          await wait(140);
        }
      } finally {
        pointerCommandBusy.current = false;
        setInteractive(true);
      }
    },
    [closed, interactive],
  );

  const runPathAction = useCallback(
    (path: string) => {
      const commands =
        path === cwd
          ? ["ls -la"]
          : [`cd ${displayPath(path)}`, "ls -la"];
      void runPointerCommands(commands);
    },
    [cwd, runPointerCommands],
  );

  const runListingAction = useCallback(
    (entry: ListingEntry) => {
      if (entry.type === "directory") {
        runPathAction(entry.path);
        return;
      }

      const argument = displayPath(entry.path);
      if (entry.type === "url" && entry.url) {
        window.open(entry.url, "_blank", "noopener,noreferrer");
        preopenedUrl.current = entry.url;
        void runPointerCommands([`open ${argument}`]);
        return;
      }
      void runPointerCommands([`cat ${argument}`]);
    },
    [runPathAction, runPointerCommands],
  );

  const runInlinePathAction = useCallback(
    (entry: ListingEntry) => {
      if (entry.type !== "url" || !entry.url) {
        runListingAction(entry);
        return;
      }

      window.open(entry.url, "_blank", "noopener,noreferrer");
      preopenedUrl.current = entry.url;
      executeRef.current(`open ${displayPath(entry.path)}`);
    },
    [runListingAction],
  );

  useEffect(() => {
    const focusFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (phase !== "shell" || !interactive || closed) return;
      if (document.activeElement === inputRef.current) return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (event.key === " " && active?.matches("a, button")) return;

      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      forceScrollRef.current = true;
      setCompletionCandidates([]);
      setSelectedCompletion(0);
      setHistoryIndex(history.length);

      const element = inputRef.current;
      setInput((current) => {
        const start = element?.selectionStart ?? current.length;
        const end = element?.selectionEnd ?? start;
        const next = `${current.slice(0, start)}${event.key}${current.slice(end)}`;
        const caret = start + event.key.length;
        window.requestAnimationFrame(() => {
          inputRef.current?.focus({ preventScroll: true });
          inputRef.current?.setSelectionRange(caret, caret);
        });
        return next;
      });
    };

    window.addEventListener("keydown", focusFromKeyboard);
    return () => window.removeEventListener("keydown", focusFromKeyboard);
  }, [closed, history.length, interactive, phase]);

  function completeInput() {
    const tokens = input.split(/\s+/);
    const partial = tokens.at(-1) ?? "";
    if (tokens.length === 1) {
      const matches = [...COMMANDS, ...Object.keys(shortcuts)]
        .filter((item) => item.startsWith(partial))
        .sort();
      if (matches.length === 1) {
        setInput(`${matches[0]} `);
        setCompletionCandidates([]);
      }
      else if (matches.length > 1) {
        const prefix = commonPrefix(matches);
        if (prefix.length > partial.length) {
          setInput(prefix);
          setCompletionCandidates([]);
        } else {
          const candidates = matches.map((match) => ({
            label: match,
            value: `${match} `,
          }));
          completionOriginalInput.current = input;
          setCompletionCandidates(candidates);
          setSelectedCompletion(0);
          setInput(candidates[0].value);
        }
      } else setCompletionCandidates([]);
      return;
    }

    const slash = partial.lastIndexOf("/");
    const parentPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
    const namePart = slash >= 0 ? partial.slice(slash + 1) : partial;
    const parent = nodeAt(normalizePath(parentPart || ".", cwd));
    const matches = Object.keys(parent?.children ?? {})
      .filter((name) => (namePart.startsWith(".") || !name.startsWith(".")) && name.startsWith(namePart))
      .sort();
    if (matches.length === 1) {
      const match = matches[0];
      const child = parent?.children?.[match];
      tokens[tokens.length - 1] = `${parentPart}${match}${child?.type === "directory" ? "/" : ""}`;
      setInput(tokens.join(" "));
      setCompletionCandidates([]);
    } else if (matches.length > 1) {
      const prefix = commonPrefix(matches);
      if (prefix.length > namePart.length) {
        tokens[tokens.length - 1] = `${parentPart}${prefix}`;
        setInput(tokens.join(" "));
        setCompletionCandidates([]);
      } else {
        const candidates = matches.map((name) => {
            const label = `${name}${parent?.children?.[name]?.type === "directory" ? "/" : ""}`;
            const completedTokens = [...tokens];
            completedTokens[completedTokens.length - 1] = `${parentPart}${label}`;
            return { label, value: completedTokens.join(" ") };
          });
        completionOriginalInput.current = input;
        setCompletionCandidates(candidates);
        setSelectedCompletion(0);
        setInput(candidates[0].value);
      }
    } else setCompletionCandidates([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
    ) {
      forceScrollRef.current = true;
    }

    if (completionCandidates.length > 0) {
      if (event.key === "Tab" || event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = nextCompletionIndex(
          selectedCompletion,
          completionCandidates.length,
          event.shiftKey ? -1 : 1,
        );
        setSelectedCompletion(next);
        setInput(completionCandidates[next].value);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = nextCompletionIndex(selectedCompletion, completionCandidates.length, -1);
        setSelectedCompletion(next);
        setInput(completionCandidates[next].value);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        setInput(completionCandidates[selectedCompletion].value);
        setCompletionCandidates([]);
        setSelectedCompletion(0);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setInput(completionOriginalInput.current);
        setCompletionCandidates([]);
        setSelectedCompletion(0);
        return;
      }
      setCompletionCandidates([]);
      setSelectedCompletion(0);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const value = input;
      setInput("");
      execute(value);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const index = Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setInput(history[index] ?? "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = Math.min(history.length, historyIndex + 1);
      setHistoryIndex(index);
      setInput(history[index] ?? "");
    } else if (event.key === "Tab") {
      event.preventDefault();
      completeInput();
    } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      setOutputs([]);
    }
  }

  function handleConsoleClick(event: MouseEvent<HTMLElement>) {
    if (!interactive || closed) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, [data-terminal-action]")) {
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <main
      className={`os-screen os-${phase} ${phase === "power-off" || phase === "powering-on" ? "power-view" : "crt-active"} ${phase !== "power-off" && !initialBootComplete ? "boot-cursor-hidden" : ""}`}
      aria-label="Batako Studio workstation console"
      onClick={handleConsoleClick}
    >
      {phase === "power-off" || phase === "powering-on" ? (
        <button
          type="button"
          className="power-stage"
          onClick={() => void powerOn()}
          disabled={phase === "powering-on"}
          aria-label="電源を入れる"
        >
          <span className="power-chassis" aria-hidden="true">
            <span className="power-vents" />
            <span className="power-controls">
              <span className="power-led" />
              <span className="power-switch">⏻</span>
            </span>
            <span className="power-base" />
          </span>
          <span className="power-display" aria-hidden="true">
            <span className="power-glass" />
            <span className="power-message">
              <span className="power-message-speaker">YUKI.N&gt;</span>
              <span className="power-message-ready">
                READY?<span className="power-message-cursor">_</span>
              </span>
            </span>
          </span>
        </button>
      ) : (
        <>
          <div className="crt-wake" aria-hidden="true" />
          <div className="scanlines" aria-hidden="true" />
          <div className="crt-instability" aria-hidden="true" />
          {xSessionStarting && <div className="screen-refresh" aria-hidden="true" />}
          <button
            type="button"
            className="sound-button"
            onClick={(event) => {
              event.stopPropagation();
              if (soundOn && !audioReady) {
                void setSound(true);
              } else {
                void setSound(!soundOn);
              }
            }}
            aria-label={
              soundOn && !audioReady
                ? "サウンドを開始"
                : soundOn
                  ? "サウンドをミュート"
                  : "サウンドをオン"
            }
          >
            [sound:{!soundOn ? "off" : audioReady ? "on" : "standby"}]
          </button>
        </>
      )}

      <div
        className="console-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followOutputRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
        }}
      >
        {phase === "boot" && (
          <div className="boot-sequence" aria-live="polite">
            {visibleBootLines.map((line) => (
              <p
                className={`boot-line boot-${line.tone ?? "normal"}`}
                key={`${line.delay}-${line.text}`}
              >
                <BootText text={line.text} />
              </p>
            ))}
            {visibleBootLines.length > 0 && (
              <span className="block-cursor" aria-hidden="true" />
            )}
          </div>
        )}

        {(phase === "refresh-login" || phase === "refresh-shell") && (
          <div className="screen-refresh" aria-hidden="true" />
        )}

        {phase === "login" && (
          <div className="login-sequence" aria-live="polite">
            <p className="boot-line boot-brand">Debian GNU/Linux 13 workstation tty1</p>
            <p className="boot-line">{"\u00a0"}</p>
            <p className="boot-line boot-login">
              workstation login: {loginUser}
              {loginStep === "username" && <TypingCursor />}
            </p>
            {(loginStep === "password" || loginStep === "authenticated") && (
              <p className="boot-line boot-login">
                Password: {loginPassword}
                {loginStep === "password" && <TypingCursor />}
              </p>
            )}
            {loginStep === "authenticated" && (
              <>
                <p className="boot-line">{"\u00a0"}</p>
                <p className="boot-line boot-ok">Authentication successful.</p>
                <p className="boot-line boot-dim">Starting user session...</p>
              </>
            )}
          </div>
        )}

        {phase === "shell" && (
          <div className="terminal-output" aria-live="polite">
            {outputs.map((output) => (
              <div className={`output-row output-${output.kind}`} key={output.id}>
                {output.prompt && (
                  <p className="command-line">
                    <Prompt
                      value={output.prompt}
                      onPathAction={interactive ? runPathAction : undefined}
                    />{" "}
                    <span>{output.content}</span>
                  </p>
                )}
                {!output.prompt && output.kind === "listing" && output.listing ? (
                  <ListingOutput listing={output.listing} onActivate={runListingAction} />
                ) : !output.prompt ? (
                  <pre>
                    {typeof output.content === "string" ? (
                      <LinkifiedText
                        text={output.content}
                        onPathActivate={interactive ? runInlinePathAction : undefined}
                      />
                    ) : (
                      output.content
                    )}
                  </pre>
                ) : null}
              </div>
            ))}

            {!closed && (
              <div className="input-line">
                <Prompt
                  value={prompt}
                  onPathAction={interactive ? runPathAction : undefined}
                />
                <label className="sr-only" htmlFor="terminal-input">
                  コマンド入力
                </label>
                {interactive ? (
                  <input
                    id="terminal-input"
                    ref={inputRef}
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      setCompletionCandidates([]);
                      setSelectedCompletion(0);
                    }}
                    onKeyDown={handleKeyDown}
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                ) : (
                  <span className="auto-input" aria-busy="true">
                    {input}
                    <TypingCursor />
                  </span>
                )}
              </div>
            )}
            {interactive && completionCandidates.length > 0 && (
              <div className="completion-list" aria-live="polite" role="listbox">
                {completionCandidates.map((candidate, index) => (
                  <span
                    className={index === selectedCompletion ? "completion-candidate-active" : undefined}
                    aria-selected={index === selectedCompletion}
                    key={candidate.value}
                    role="option"
                  >
                    {candidate.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function TypingCursor() {
  return <span className="inline-cursor" aria-hidden="true" />;
}

function Prompt({
  value,
  onPathAction,
}: {
  value: string;
  onPathAction?: (path: string) => void;
}) {
  const separator = value.indexOf(":");
  const identity = value.slice(0, separator);
  const displayedPath = value.slice(separator + 1, -1);
  const absolutePath = normalizePath(displayedPath, HOME);
  const relativeToHome =
    absolutePath === HOME || absolutePath.startsWith(`${HOME}/`);
  const relativeParts = relativeToHome
    ? absolutePath.slice(HOME.length).split("/").filter(Boolean)
    : absolutePath.split("/").filter(Boolean);
  const rootPath = relativeToHome ? HOME : "/";
  const rootLabel = relativeToHome ? "~" : "/";
  const segments = [
    { label: rootLabel, path: rootPath },
    ...relativeParts.map((part, index) => ({
      label: `${relativeToHome || index > 0 ? "/" : ""}${part}`,
      path: normalizePath(
        `${rootPath === "/" ? "" : rootPath}/${relativeParts.slice(0, index + 1).join("/")}`,
        HOME,
      ),
    })),
  ];

  return (
    <span className="prompt" aria-label={value}>
      <span className="prompt-user">{identity}</span>
      <span className="prompt-separator">:</span>
      <span className="prompt-path">
        {onPathAction
          ? segments.map((segment) => (
              <button
                type="button"
                className="terminal-action prompt-path-action"
                data-terminal-action
                key={segment.path}
                onClick={() => onPathAction(segment.path)}
                aria-label={
                  segment.path === absolutePath
                    ? `List ${displayPath(segment.path)}`
                    : `Open ${displayPath(segment.path)}`
                }
              >
                {segment.label}
              </button>
            ))
          : displayedPath}
        $
      </span>
    </span>
  );
}
