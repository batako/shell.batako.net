# Test specification matrix

Every current user-operable behavior must have a checked test entry. CI fails if an unchecked entry is committed.

## Build and rendering

- [x] Production build completes
- [x] Package metadata identifies the private application as `shell.batako.net`
- [x] Server rendering returns Batako Studio HTML
- [x] Page metadata uses the `cat README.md # Batako` shell title and explicitly serves the terminal favicon
- [x] Metadata resolves a self-referencing canonical URL to `https://shell.batako.net/`
- [x] Static sitemap exposes the production root URL without a manually maintained modification date
- [x] Robots policy permits crawling and points to the production sitemap
- [x] Static virtual filesystem remains sandboxed

## Boot and login

- [x] Initial load remains powered off until mouse, touch, or keyboard activation
- [x] The powered-off display shows the spaced `YUKI.N> READY?_` conversation fragment with a blinking terminal cursor
- [x] Power input unlocks audio before boot begins
- [x] The all-in-one CRT display expands to the full viewport before normal boot
- [x] Reduced-motion mode shortens the power-on transition
- [x] Reduced-motion boot reaches the interactive shell
- [x] Normal boot follows every configured line delay in order
- [x] Normal boot transitions through refresh, login, authentication, and shell
- [x] systemd status labels use a dedicated colored span
- [x] Initial `cat README.md` command is typed and rendered
- [x] Initial `cat README.md` completion focuses the rendered terminal input
- [x] The mouse pointer stays hidden from power-on through the initial README and returns with user input
- [x] `?resume=x11` skips boot, login, and the initial README before restoring the shell

## Commands

- [x] Supported command list is explicit and locked
- [x] `help`, `pwd`, `date`, `echo`, `alias`, and `history`
- [x] Empty or whitespace-only input advances to a new prompt without entering history
- [x] `ls`, `ls -l`, `ls -a`, `ls -la`, and `ls -al`
- [x] `ls` handles files, directories, hidden files, invalid options, missing paths, and extra operands
- [x] `cd` handles directories, parent paths, home, missing paths, and non-directories
- [x] `cat` handles text files, URL files, directories, missing operands, and missing files
- [x] `tree` handles directories, files, and missing paths
- [x] `open` opens every configured URL and rejects invalid targets
- [x] `sound` mutes and resumes audio
- [x] `startx` performs a short screen transition and opens the configured GUI URL in the current tab
- [x] `clear`, Ctrl+L, and `exit`
- [x] Unsupported syntax and unknown commands return errors

## Content

- [x] Markdown uses Japanese only when it is the browser's highest-priority language
- [x] Markdown falls back to English for every other browser language
- [x] Language selection does not translate non-Markdown shell files
- [x] Profile shortcut and favorite words
- [x] Skills shortcut and project references
- [x] Projects shortcut and all GitHub URLs
- [x] Contact shortcut and all profile URLs
- [x] URLs in command output are crawlable links that open in a separate tab
- [x] Blog remains a URL file and is not a shortcut

## Completion and keyboard

- [x] Command completion finds shared and unique matches
- [x] Path completion handles files, directories, and hidden files
- [x] Candidate menu appears directly below the active input
- [x] Active candidate is highlighted and mirrored into the input
- [x] Tab, Shift+Tab, and arrow keys cycle candidates
- [x] Enter accepts and Escape restores the original input
- [x] Arrow keys navigate command history

## Mouse operation

- [x] Clicking the current prompt path types and runs `ls -la`
- [x] Repeated clicks during mouse command typing do not start duplicate commands
- [x] Listing actions support the current directory, parent directory, child directories, and prompt ancestors
- [x] Directory actions visibly run `cd` followed by `ls -la`
- [x] File actions visibly run `cat`, and URL actions visibly run `open` in a separate tab
- [x] Existing `~/...` references in file output use file and directory actions, while URL references open immediately without typing audio
- [x] Mouse-generated commands are retained in shell history

## Audio

- [x] CRT wake, POST, login typing, authentication, and initial command triggers
- [x] Every audible command error uses one shared beep path
- [x] Muted errors stay silent
- [x] Sound button mutes and resumes audio
- [x] Web Audio nodes are created and scheduled for every configured effect
- [x] Missing Web Audio support fails safely

## Presentation and accessibility

- [x] Animated CRT instability remains active through boot, initial `cat README.md`, and user operation
- [x] CRT layers stay behind the text and preserve the pre-effect BIOS and OS colors
- [x] Reduced-motion mode disables the instability overlay
- [x] Terminal input and sound button have accessible names
- [x] The power-off screen remains clickable everywhere while only the visible power switch uses the pointer cursor
- [x] Output clicks focus the prompt without scrolling while text selection preserves reading position
- [x] Printable keyboard input restores prompt focus without stealing copy shortcuts
- [x] Scrolling away from the bottom pauses automatic following until a command is executed
- [x] Completion list uses listbox and selected-option semantics
- [x] Completion list and active-candidate CSS contracts are present
