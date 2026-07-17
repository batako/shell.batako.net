export type CompletionCandidate = {
  label: string;
  value: string;
};

export type ContentLanguage = "en" | "ja";

export function detectContentLanguage(languages: readonly string[]): ContentLanguage {
  return languages[0]?.toLowerCase().split("-")[0] === "ja"
    ? "ja"
    : "en";
}

export function isXSessionResume(search: string) {
  return new URLSearchParams(search).get("resume") === "x11";
}

export type LsArguments =
  | {
      ok: true;
      long: boolean;
      pathArg: string;
      showAll: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export function commonPrefix(values: string[]) {
  if (values.length === 0) return "";
  return values.slice(1).reduce((prefix, value) => {
    let length = 0;
    while (length < prefix.length && prefix[length] === value[length]) length += 1;
    return prefix.slice(0, length);
  }, values[0]);
}

export function nextCompletionIndex(current: number, count: number, delta: number) {
  if (count <= 0) return 0;
  return (current + delta + count) % count;
}

export function parseLsArguments(args: string[]): LsArguments {
  const optionArgs = args.filter((arg) => arg.startsWith("-"));
  const invalidOption = optionArgs
    .flatMap((arg) => [...arg.slice(1)])
    .find((option) => option !== "a" && option !== "l");
  if (invalidOption) {
    return { ok: false, error: `ls: invalid option -- '${invalidOption}'` };
  }

  const pathArgs = args.filter((arg) => !arg.startsWith("-"));
  if (pathArgs.length > 1) {
    return { ok: false, error: `ls: extra operand '${pathArgs[1]}'` };
  }

  return {
    ok: true,
    long: optionArgs.some((arg) => arg.includes("l")),
    pathArg: pathArgs[0] ?? ".",
    showAll: optionArgs.some((arg) => arg.includes("a")),
  };
}

export function shouldPlayErrorTone(kind: string, soundOn: boolean) {
  return kind === "error" && soundOn;
}
