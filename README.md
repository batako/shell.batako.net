# shell.batako.net

`cat README.md # Batako`

[shell.batako.net](https://shell.batako.net) is Batako's interactive shell.

Boot the workstation, log in, and see what is there. The intended experience is the website itself. This repository is public for anyone curious about how it works.

## Inside the machine

- Firmware, boot, screen refresh, and login sequences
- Keyboard and mouse-operable command-line interface
- Read-only virtual filesystem with localized Markdown content
- Command history and Tab completion
- Synthesized computer audio using the Web Audio API
- CRT-inspired display effects and reduced-motion support
- Explicit links to external profiles and projects

The shell runs entirely in the browser. It does not connect to the visitor's operating system or execute commands in a real shell.

## Source notes

- Next.js 16, React 19, and TypeScript
- Static export with Next.js (`out/` locally)
- AWS Amplify Hosting deployment from `.next/`
- Node.js 24.x and npm 11.x
- Static, in-memory virtual filesystem
- Unsupported shell syntax is rejected
- No visitor credentials or personal data are collected by the terminal

<details>
<summary>Run it locally</summary>

The website is the primary way to use this project. If you want to inspect the implementation locally:

```bash
npm ci
npm run dev
```

Verification:

```bash
npm run lint
npm run typecheck
npm test
```

</details>

## License

This repository is publicly viewable, but no open-source license is granted.

Copyright Batako Studio. All rights reserved.
