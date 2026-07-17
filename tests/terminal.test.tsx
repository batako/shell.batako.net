import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const audio = vi.hoisted(() => ({
  crtWake: vi.fn(),
  enter: vi.fn(),
  error: vi.fn(),
  isRunning: vi.fn(() => false),
  keyTap: vi.fn(),
  postBeep: vi.fn(),
  suspend: vi.fn(),
  unlock: vi.fn(async () => true),
}));

const navigation = vi.hoisted(() => ({
  navigateCurrentTab: vi.fn(),
}));

vi.mock("../app/browser-navigation", () => navigation);

vi.mock("../app/retro-audio", () => ({
  RetroAudio: class {
    crtWake = audio.crtWake;
    enter = audio.enter;
    error = audio.error;
    isRunning = audio.isRunning;
    keyTap = audio.keyTap;
    postBeep = audio.postBeep;
    suspend = audio.suspend;
    unlock = audio.unlock;
  },
}));

import { bootLines, COMMANDS, GUI_URL, Terminal } from "../app/terminal";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

async function advance(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

async function finishPointerCommands() {
  await act(async () => {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  });
}

async function pressPower() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "電源を入れる" }));
    await Promise.resolve();
  });
}

async function renderInteractiveShell() {
  const view = render(<Terminal />);
  await pressPower();
  await advance(120);
  await advance(1_650);
  await advance(1_500);
  return {
    ...view,
    input: screen.getByRole("textbox", { name: "コマンド入力" }),
  };
}

function runCommand(input: HTMLElement, command: string) {
  fireEvent.change(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function lastOutput(container: HTMLElement) {
  const rows = container.querySelectorAll(".output-row");
  return rows.item(rows.length - 1).textContent ?? "";
}

function outputCount(container: HTMLElement) {
  return container.querySelectorAll(".output-row").length;
}

describe("boot and login sequence", () => {
  test("waits for power input, focuses the display, and only then starts boot", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { container } = render(<Terminal />);

    expect(container.querySelector(".os-power-off")).not.toBeNull();
    expect(container.querySelector(".boot-cursor-hidden")).toBeNull();
    expect(container.querySelector(".power-display")).not.toBeNull();
    expect(container.textContent).toContain("YUKI.N>READY?_");
    expect(container.querySelector(".crt-wake")).toBeNull();
    expect(container.textContent).not.toContain("BATKO SYSTEMS BIOS");

    audio.crtWake.mockClear();
    await pressPower();
    expect(container.querySelector(".os-powering-on")).not.toBeNull();
    expect(container.querySelector(".boot-cursor-hidden")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "電源を入れる" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(audio.unlock).toHaveBeenCalled();

    await advance(1_199);
    expect(container.querySelector(".power-display")).not.toBeNull();
    expect(container.textContent).not.toContain("BATKO SYSTEMS BIOS");
    await advance(1);
    expect(container.querySelector(".os-boot")).not.toBeNull();
    expect(container.querySelector(".crt-wake")).not.toBeNull();
    expect(audio.crtWake).toHaveBeenCalledTimes(1);
  });

  test("resumes from an X session without replaying boot, login, or README", async () => {
    window.history.replaceState(null, "", "/?resume=x11");
    const { container } = render(<Terminal />);

    expect(container.querySelector(".screen-refresh")).not.toBeNull();
    expect(container.textContent).not.toContain("BATKO SYSTEMS BIOS");
    expect(window.location.search).toBe("");

    await advance(620);
    expect(screen.getByRole("textbox", { name: "コマンド入力" })).not.toBeNull();
    expect(container.textContent).toContain("X session terminated.");
    expect(container.textContent).not.toContain("cat README.md");

    await advance(2_000);
    expect(container.textContent).not.toContain("# workstation");
  });

  test("renders Japanese Markdown when Japanese is the browser's highest-priority language", async () => {
    const languageMock = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["ja-JP", "en-US"]);
    const { container, input } = await renderInteractiveShell();

    expect(container.textContent).toContain("# workstation");
    expect(container.textContent).toContain('利用可能なコマンドは "help" で確認できます。');
    expect(container.textContent).not.toContain('Type "help" for available commands.');

    runCommand(input, "profile");
    expect(lastOutput(container)).toContain("# プロフィール");
    expect(lastOutput(container)).toContain(
      "現実を直視しろ。おれ達にはもう仮想現実しかないんだ。",
    );
    runCommand(input, "skills");
    expect(lastOutput(container)).toContain("## セキュリティ学習");
    runCommand(input, "projects");
    expect(lastOutput(container)).toContain("# プロジェクト");
    runCommand(input, "contact");
    expect(lastOutput(container)).toContain("# コンタクト");
    runCommand(input, "cat .zshrc");
    expect(lastOutput(container)).toContain("# batako workstation shell configuration");

    languageMock.mockRestore();
  });

  test("renders English Markdown when the browser language is not Japanese", async () => {
    const languageMock = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["en-US", "ja-JP"]);
    const { container, input } = await renderInteractiveShell();

    expect(container.textContent).toContain("# workstation");
    expect(container.textContent).toContain('Type "help" for available commands.');
    runCommand(input, "profile");
    expect(lastOutput(container)).toContain("# Profile");
    runCommand(input, "skills");
    expect(lastOutput(container)).toContain("## Security Learning");

    languageMock.mockRestore();
  });

  test("renders every boot line at its configured time in order", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { container } = render(<Terminal />);
    await pressPower();
    await advance(1_200);
    let elapsed = 0;

    for (const [index, line] of bootLines.entries()) {
      await advance(line.delay - elapsed);
      const renderedLines = container.querySelectorAll(".boot-line");
      expect(renderedLines).toHaveLength(index + 1);
      if (line.text) expect(renderedLines.item(index).textContent).toBe(line.text);
      elapsed = line.delay;
    }
  });

  test("moves through BIOS, login, and shell before typing the initial command", async () => {
    const { container } = render(<Terminal />);
    await pressPower();
    await advance(120);

    await advance(0);
    expect(container.querySelector(".os-screen")?.classList.contains("crt-active")).toBe(true);
    expect(container.querySelector(".crt-instability")).not.toBeNull();
    expect(container.textContent).toContain("BATKO SYSTEMS BIOS v1.0.0");
    expect(container.querySelector(".boot-status-ok")?.textContent).toBe("[  OK  ]");

    await advance(500);
    expect(container.querySelector(".screen-refresh")).not.toBeNull();

    await advance(200);
    expect(container.textContent).toContain("Debian GNU/Linux 13 workstation tty1");
    expect(container.textContent).toContain("workstation login: batako");
    expect(container.textContent).toContain("Password: ********");

    await advance(700);
    expect(container.querySelector(".screen-refresh")).not.toBeNull();

    await advance(250);
    expect(container.querySelector(".terminal-output")).not.toBeNull();
    await advance(1_500);
    const input = screen.getByRole("textbox", { name: "コマンド入力" });
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(container.querySelector(".os-screen")?.classList.contains("crt-active")).toBe(true);
    expect(container.querySelector(".os-screen")?.classList.contains("crt-settled")).toBe(false);
    expect(container.textContent).toContain("cat README.md");
    expect(container.textContent).toContain("owner: batako");
  });

  test("plays the POST beep during the normal boot sequence", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    render(<Terminal />);
    await pressPower();
    await advance(1_200);
    audio.postBeep.mockClear();

    await advance(3_100);
    expect(audio.postBeep).toHaveBeenCalledTimes(1);
  });

  test("triggers CRT, login typing, authentication, and initial command sounds", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    render(<Terminal />);
    audio.crtWake.mockClear();
    await pressPower();
    await advance(1_200);
    expect(audio.crtWake).toHaveBeenCalledTimes(1);

    audio.keyTap.mockClear();
    audio.enter.mockClear();
    await advance(11_950);
    expect(audio.keyTap.mock.calls.length).toBeGreaterThan(0);

    audio.keyTap.mockClear();
    await advance(700);
    expect(audio.keyTap.mock.calls.length).toBeGreaterThan(0);

    await advance(550);
    expect(audio.enter.mock.calls.length).toBeGreaterThan(0);

    await advance(1_400);
    audio.keyTap.mockClear();
    audio.enter.mockClear();
    await advance(320);
    expect(audio.keyTap.mock.calls.length).toBeGreaterThan(0);
    await advance(1_100);
    expect(audio.enter).toHaveBeenCalledTimes(1);
  });

  test("follows the complete normal-speed boot and login timeline", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { container } = render(<Terminal />);
    await pressPower();
    await advance(1_200);

    await advance(10_599);
    expect(container.querySelector(".os-boot")).not.toBeNull();
    await advance(1);
    expect(container.querySelector(".os-refresh-login")).not.toBeNull();
    await advance(700);
    expect(container.querySelector(".os-login")).not.toBeNull();

    await advance(1_040);
    expect(container.textContent).toContain("workstation login: batako");
    await advance(744);
    expect(container.textContent).toContain("Password: ********");
    await advance(116);
    expect(container.textContent).toContain("Authentication successful.");

    await advance(700);
    expect(container.querySelector(".os-refresh-shell")).not.toBeNull();
    await advance(700);
    expect(container.querySelector(".os-shell")).not.toBeNull();
  });
});

describe("shell commands", () => {
  test("keeps the supported command set explicit", () => {
    expect(COMMANDS).toEqual([
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
    ]);
  });

  test("starts the GUI in the current tab after a short screen transition", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "startx");
    expect(lastOutput(container)).toContain("startx");
    expect(container.querySelector(".screen-refresh")).not.toBeNull();
    expect(navigation.navigateCurrentTab).not.toHaveBeenCalled();

    await advance(620);
    expect(navigation.navigateCurrentTab).toHaveBeenCalledWith(GUI_URL);
    expect(GUI_URL).toBe("https://batako.net");
  });

  test("accepts empty input as a new prompt without adding it to history", async () => {
    const { container, input } = await renderInteractiveShell();
    const initialCount = outputCount(container);
    audio.enter.mockClear();

    runCommand(input, "");
    expect(outputCount(container)).toBe(initialCount + 1);
    expect(lastOutput(container).trimEnd()).toBe("batako@workstation:~$");

    runCommand(input, "   ");
    expect(outputCount(container)).toBe(initialCount + 2);
    expect(audio.enter).toHaveBeenCalledTimes(2);

    runCommand(input, "history");
    expect(lastOutput(container)).toBe("1  history");
  });

  test("runs help, pwd, echo, date, alias, and history", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "help");
    expect(lastOutput(container)).toContain("open");
    expect(lastOutput(container)).not.toContain("blog");

    runCommand(input, "pwd");
    expect(lastOutput(container)).toBe("/home/batako");

    runCommand(input, 'echo "hello world"');
    expect(lastOutput(container)).toBe("hello world");

    runCommand(input, "date");
    expect(Number.isNaN(Date.parse(lastOutput(container)))).toBe(false);

    runCommand(input, "alias");
    expect(lastOutput(container)).toContain("profile='cat ~/Profile/README.md'");
    expect(lastOutput(container)).not.toContain("alias blog=");

    runCommand(input, "history");
    expect(lastOutput(container)).toContain("1  help");
    expect(lastOutput(container)).toContain("6  history");
  });

  test("supports ls formats, hidden files, and ls errors", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "ls");
    expect(lastOutput(container)).toContain("Profile");
    expect(lastOutput(container)).not.toContain(".zshrc");

    runCommand(input, "ls -la");
    expect(lastOutput(container)).toContain(".zshrc");
    expect(lastOutput(container)).toMatch(/dr-xr-xr-x.*Profile/);
    expect(lastOutput(container)).toMatch(/-r--r--r--.*README\.md/);

    runCommand(input, "ls -al Projects");
    expect(lastOutput(container)).toContain("kali-tools.url");

    runCommand(input, "ls -x");
    expect(lastOutput(container)).toBe("ls: invalid option -- 'x'");

    runCommand(input, "ls Profile Projects");
    expect(lastOutput(container)).toBe("ls: extra operand 'Projects'");

    runCommand(input, "ls README.md");
    expect(lastOutput(container)).toBe("README.md");

    runCommand(input, "ls -l README.md");
    expect(lastOutput(container)).toMatch(/^-r--r--r--.*README\.md$/);

    runCommand(input, "ls missing");
    expect(lastOutput(container)).toBe("ls: missing: No such file or directory");
  });

  test("lists the current path from the prompt with mouse-style command typing", async () => {
    const { container } = await renderInteractiveShell();
    const listHome = screen.getAllByRole("button", { name: "List ~" }).at(-1);
    expect(listHome).toBeDefined();
    audio.keyTap.mockClear();

    fireEvent.click(listHome!);
    fireEvent.click(listHome!);
    expect(screen.queryByRole("textbox", { name: "コマンド入力" })).toBeNull();
    await advance(70);
    expect(container.querySelector(".auto-input")?.textContent).toContain("l");
    expect(audio.keyTap.mock.calls.length).toBeGreaterThan(0);

    await finishPointerCommands();
    expect(
      Array.from(container.querySelectorAll(".output-command")).filter((row) =>
        row.textContent?.includes("ls -la"),
      ),
    ).toHaveLength(1);
    expect(lastOutput(container)).toContain(".zshrc");
    expect(screen.getByRole("button", { name: "Open directory Projects" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open parent directory" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "コマンド入力" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "List current directory" }));
    await finishPointerCommands();
    expect(
      Array.from(container.querySelectorAll(".output-command")).filter((row) =>
        row.textContent?.includes("ls -la"),
      ),
    ).toHaveLength(2);
  });

  test("navigates directories, returns through dot-dot, and reads files by mouse", async () => {
    const { container } = await renderInteractiveShell();
    fireEvent.click(screen.getAllByRole("button", { name: "List ~" }).at(-1)!);
    await finishPointerCommands();

    fireEvent.click(screen.getByRole("button", { name: "Open directory Projects" }));
    await finishPointerCommands();
    expect(container.textContent).toContain("batako@workstation:~/Projects$");
    expect(lastOutput(container)).toContain("kali-tools.url");

    fireEvent.click(screen.getAllByRole("button", { name: "Open parent directory" }).at(-1)!);
    await finishPointerCommands();
    expect(container.textContent).toContain("batako@workstation:~$");

    fireEvent.click(screen.getAllByRole("button", { name: "Open directory Profile" }).at(-1)!);
    await finishPointerCommands();
    fireEvent.click(screen.getAllByRole("button", { name: "Open ~" }).at(-1)!);
    await finishPointerCommands();

    fireEvent.click(screen.getAllByRole("button", { name: "Read file README.md" }).at(-1)!);
    await finishPointerCommands();
    expect(lastOutput(container)).toContain("owner: batako");
  });

  test("opens URL files once and records every mouse command in history", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = await renderInteractiveShell();
    fireEvent.click(screen.getAllByRole("button", { name: "List ~" }).at(-1)!);
    await finishPointerCommands();
    fireEvent.click(screen.getByRole("button", { name: "Open directory Projects" }));
    await finishPointerCommands();

    fireEvent.click(screen.getByRole("button", { name: "Open URL kali-tools.url" }));
    await finishPointerCommands();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://github.com/batako/kali-tools",
      "_blank",
      "noopener,noreferrer",
    );
    expect(lastOutput(container)).toContain("Opening https://github.com/batako/kali-tools");

    const input = screen.getByRole("textbox", { name: "コマンド入力" });
    runCommand(input, "history");
    const historyOutput = lastOutput(container);
    expect(historyOutput).toContain("ls -la");
    expect(historyOutput).toContain("cd ~/Projects");
    expect(historyOutput).toContain("open ~/Projects/kali-tools.url");
  });

  test("opens virtual path references rendered inside file output", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container, input } = await renderInteractiveShell();
    runCommand(input, "skills");
    audio.keyTap.mockClear();

    expect(
      screen.getByRole("button", { name: "Open URL ~/Projects/kali-linux.url" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open URL ~/Projects/kali-tools.url" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Open URL ~/Projects/req-firefox-extension.url",
      }),
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Open URL ~/Projects/kali-tools.url" }),
    );

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://github.com/batako/kali-tools",
      "_blank",
      "noopener,noreferrer",
    );
    expect(audio.keyTap).not.toHaveBeenCalled();
    expect(container.querySelector(".auto-input")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".output-command")).some((row) =>
        row.textContent?.includes("open ~/Projects/kali-tools.url"),
      ),
    ).toBe(true);
    expect(lastOutput(container)).toContain("Opening https://github.com/batako/kali-tools");
  });

  test("navigates and reads the virtual file system", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "cd Profile");
    runCommand(input, "pwd");
    expect(lastOutput(container)).toBe("/home/batako/Profile");

    runCommand(input, "cat README.md");
    expect(lastOutput(container)).toContain("# Profile");
    expect(lastOutput(container)).toContain("Ressentiment");

    runCommand(input, "cd ..");
    runCommand(input, "cat .zshrc");
    expect(lastOutput(container)).toContain('ZSH_THEME="batako"');

    runCommand(input, "tree Projects");
    expect(lastOutput(container)).toContain("kali-linux.url");
    expect(lastOutput(container)).toContain("req-firefox-extension.url");

    runCommand(input, "cat Profile");
    expect(lastOutput(container)).toBe("cat: Profile: Is a directory");

    runCommand(input, "cd README.md");
    expect(lastOutput(container)).toBe("cd: README.md: Not a directory");

    runCommand(input, "cat missing.txt");
    expect(lastOutput(container)).toBe("cat: missing.txt: No such file or directory");

    runCommand(input, "cat");
    expect(lastOutput(container)).toBe("cat: missing operand");

    runCommand(input, "cat Projects/kali-tools.url");
    expect(lastOutput(container)).toBe("https://github.com/batako/kali-tools");

    runCommand(input, "tree README.md");
    expect(lastOutput(container)).toBe("README.md");

    runCommand(input, "tree missing");
    expect(lastOutput(container)).toBe("tree: missing: No such file or directory");

    runCommand(input, "cd Profile");
    runCommand(input, "cd");
    runCommand(input, "pwd");
    expect(lastOutput(container)).toBe("/home/batako");
  });

  test("expands every content shortcut", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "profile");
    expect(lastOutput(container)).toContain("# Profile");

    runCommand(input, "projects");
    expect(lastOutput(container)).toContain("https://github.com/batako/kali-linux");
    expect(lastOutput(container)).toContain("https://github.com/batako/kali-tools");
    expect(lastOutput(container)).toContain("req-firefox-extension");

    runCommand(input, "skills");
    expect(lastOutput(container)).toContain("## Security Learning");
    expect(lastOutput(container)).toContain("~/Projects/kali-tools.url");

    runCommand(input, "contact");
    expect(lastOutput(container)).toContain("https://github.com/batako");
    expect(lastOutput(container)).toContain("https://www.root-me.org/batako");
    expect(lastOutput(container)).toContain("https://pentesterlab.com/profile/batako");
    expect(lastOutput(container)).toContain("https://log.batako.net");
  });

  test("renders output URLs as separate-tab links without changing their default color", async () => {
    const { input } = await renderInteractiveShell();

    runCommand(input, "contact");
    const github = screen.getByRole("link", { name: "https://github.com/batako" });
    expect(github.getAttribute("href")).toBe("https://github.com/batako");
    expect(github.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")).toBe("noopener noreferrer");
    expect(github.classList.contains("output-link")).toBe(true);
  });

  test("focuses clicked output without scrolling and preserves text selections", async () => {
    const { container, input } = await renderInteractiveShell();
    const scroll = container.querySelector(".console-scroll") as HTMLDivElement;
    const output = container.querySelector(".output-row pre") as HTMLElement;
    const scrollTo = vi.mocked(scroll.scrollTo);

    input.blur();
    scrollTo.mockClear();
    fireEvent.click(output);
    expect(document.activeElement).toBe(input);
    expect(scrollTo).not.toHaveBeenCalled();

    input.blur();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection?.addRange(range);
    fireEvent.click(scroll);
    expect(document.activeElement).not.toBe(input);
    expect(scrollTo).not.toHaveBeenCalled();

    selection?.removeAllRanges();
    fireEvent.click(scroll);
    expect(document.activeElement).toBe(input);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("returns to the prompt on printable keyboard input without stealing copy shortcuts", async () => {
    const { container, input } = await renderInteractiveShell();
    const scroll = container.querySelector(".console-scroll") as HTMLDivElement;
    const output = container.querySelector(".output-row pre") as HTMLElement;
    const scrollTo = vi.mocked(scroll.scrollTo);
    const selection = window.getSelection();
    const selectOutput = () => {
      selection?.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(output);
      selection?.addRange(range);
    };

    input.blur();
    selectOutput();
    scrollTo.mockClear();
    fireEvent.keyDown(window, { ctrlKey: true, key: "c" });
    expect(document.activeElement).not.toBe(input);
    expect(input.getAttribute("value")).toBe("");
    expect(selection?.rangeCount).toBe(1);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "h" });
    await advance(16);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("value")).toBe("h");
    expect(scrollTo).toHaveBeenCalled();
  });

  test("stops following input while scrolled up and resumes for an executed command", async () => {
    const { container, input } = await renderInteractiveShell();
    const scroll = container.querySelector(".console-scroll") as HTMLDivElement;
    const scrollTo = vi.mocked(scroll.scrollTo);
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
      scrollTop: { configurable: true, value: 200, writable: true },
    });

    fireEvent.scroll(scroll);
    scrollTo.mockClear();
    fireEvent.change(input, { target: { value: "echo restored" } });
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(scrollTo).toHaveBeenCalled();
  });

  test("opens configured URLs and rejects unsupported targets", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "open Projects/kali-tools.url");
    expect(open).toHaveBeenCalledWith(
      "https://github.com/batako/kali-tools",
      "_blank",
      "noopener,noreferrer",
    );
    expect(lastOutput(container)).toContain("Opening https://github.com/batako/kali-tools");

    runCommand(input, "open README.md");
    expect(lastOutput(container)).toBe("open: unsupported file type");

    runCommand(input, "open missing.url");
    expect(lastOutput(container)).toBe("open: missing.url: No such file or directory");

    runCommand(input, "open");
    expect(lastOutput(container)).toBe("open: missing operand");
  });

  test("opens every configured URL file", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { input } = await renderInteractiveShell();
    const urls = [
      ["Projects/kali-linux.url", "https://github.com/batako/kali-linux"],
      ["Projects/kali-tools.url", "https://github.com/batako/kali-tools"],
      [
        "Projects/req-firefox-extension.url",
        "https://github.com/batako/req-firefox-extension",
      ],
      ["Contact/github.url", "https://github.com/batako"],
      ["Contact/tryhackme.url", "https://tryhackme.com/p/batako"],
      [
        "Contact/hackthebox.url",
        "https://profile.hackthebox.com/profile/019f706b-e8f0-7184-a186-10295f0c7a64",
      ],
      ["Contact/rootme.url", "https://www.root-me.org/batako"],
      ["Contact/pentesterlab.url", "https://pentesterlab.com/profile/batako"],
      ["Contact/blog.url", "https://log.batako.net"],
    ];

    for (const [path, url] of urls) {
      runCommand(input, `open ${path}`);
      expect(open).toHaveBeenLastCalledWith(url, "_blank", "noopener,noreferrer");
    }
    expect(open).toHaveBeenCalledTimes(urls.length);
  });

  test("clears output with clear and Ctrl+L, then exits", async () => {
    const { container, input } = await renderInteractiveShell();

    runCommand(input, "echo visible");
    expect(container.textContent).toContain("visible");
    runCommand(input, "clear");
    expect(container.querySelectorAll(".output-row")).toHaveLength(0);

    runCommand(input, "echo visible-again");
    fireEvent.keyDown(input, { ctrlKey: true, key: "l" });
    expect(container.querySelectorAll(".output-row")).toHaveLength(0);

    runCommand(input, "exit");
    expect(container.textContent).toContain("logout");
    expect(screen.queryByRole("textbox", { name: "コマンド入力" })).toBeNull();
  });

  test("navigates command history with arrow keys", async () => {
    const { input } = await renderInteractiveShell();

    runCommand(input, "echo one");
    runCommand(input, "echo two");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("value")).toBe("echo two");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("value")).toBe("echo one");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("value")).toBe("echo two");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("value")).toBe("");
  });
});

describe("completion menu", () => {
  test("highlights, previews, cycles, accepts, and cancels command candidates", async () => {
    const { input } = await renderInteractiveShell();

    fireEvent.change(input, { target: { value: "pro" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("profile ");
    const listbox = screen.getByRole("listbox");
    expect(input.closest(".input-line")?.nextElementSibling).toBe(listbox);
    const profileOption = screen.getByRole("option", { name: "profile" });
    expect(profileOption.getAttribute("aria-selected")).toBe("true");
    expect(profileOption.classList.contains("completion-candidate-active")).toBe(true);

    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("projects ");
    expect(screen.getByRole("option", { name: "projects" }).getAttribute("aria-selected")).toBe(
      "true",
    );

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(input.getAttribute("value")).toBe("profile ");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("value")).toBe("profile ");

    fireEvent.change(input, { target: { value: "pro" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("value")).toBe("pro");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("completes directories, files, and hidden files", async () => {
    const { input } = await renderInteractiveShell();

    fireEvent.change(input, { target: { value: "cat ~/Prof" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("cat ~/Profile/");

    fireEvent.change(input, { target: { value: "cat .z" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("cat .zshrc");

    fireEvent.change(input, { target: { value: "cat ~/Pro" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByRole("option", { name: "Profile/" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Projects/" })).not.toBeNull();
  });

  test("supports arrow navigation, unique matches, and candidate dismissal on input", async () => {
    const { input } = await renderInteractiveShell();

    fireEvent.change(input, { target: { value: "pro" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("value")).toBe("projects ");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("value")).toBe("profile ");

    fireEvent.change(input, { target: { value: "x" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("x");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.change(input, { target: { value: "pw" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("value")).toBe("pwd ");
  });
});

describe("audio behavior", () => {
  test("beeps once for every audible command error and stays silent when muted", async () => {
    const { input } = await renderInteractiveShell();
    audio.error.mockClear();

    runCommand(input, "a");
    expect(audio.error).toHaveBeenCalledTimes(1);

    runCommand(input, "cat Pro");
    expect(audio.error).toHaveBeenCalledTimes(2);

    runCommand(input, "sound");
    expect(audio.suspend).toHaveBeenCalledTimes(1);
    runCommand(input, "cat missing");
    expect(audio.error).toHaveBeenCalledTimes(2);
  });

  test("uses the same error path for syntax and command-specific failures", async () => {
    const { input } = await renderInteractiveShell();
    audio.error.mockClear();

    runCommand(input, "echo a | cat");
    runCommand(input, "ls -x");
    runCommand(input, "cd missing");
    runCommand(input, "open");
    expect(audio.error).toHaveBeenCalledTimes(4);
  });

  test("can mute and re-enable sound from the shell command", async () => {
    const { container, input } = await renderInteractiveShell();
    audio.suspend.mockClear();
    audio.unlock.mockClear();

    runCommand(input, "sound");
    expect(lastOutput(container)).toBe("sound: off");
    expect(audio.suspend).toHaveBeenCalledTimes(1);

    runCommand(input, "sound");
    await act(async () => Promise.resolve());
    expect(lastOutput(container)).toBe("sound: on");
    expect(audio.unlock).toHaveBeenCalledTimes(1);
  });

  test("can mute and re-enable sound from the sound button", async () => {
    await renderInteractiveShell();
    audio.suspend.mockClear();
    audio.unlock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "サウンドをミュート" }));
    expect(audio.suspend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "サウンドをオン" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "サウンドをオン" }));
    await act(async () => Promise.resolve());
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "サウンドをミュート" })).not.toBeNull();
  });
});
