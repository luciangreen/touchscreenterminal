# Touchscreen terminal

Move around your folders by touch and run commands, with large buttons made for an iPhone or a touchscreen Mac. You can also talk to the LucianOS character. It's part of the [LucianOS suite](https://github.com/luciangreen/lucianos).

## Install

The touchscreen terminal runs inside the LucianOS platform:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/touchscreenterminal
```

Start the platform (`npm start` in `lucianos`) and open http://localhost:4170/apps/touchscreenterminal/

You can also open it from the LucianOS desktop (Apps menu or its icon), or say "open touchscreen terminal" to the character. To start in a folder, add `?folder=Dropbox/GitHub`.

## Using it

- **Moving around:**
  - Tap a folder to go in. **↑** or swiping right goes up a folder. **⌂** goes home.
  - The bar along the top shows where you are; tap any part to jump back.
  - **🕘** lists recent folders.
  - **Filter** narrows the list on wider screens.
- **Tap a file** for large action buttons:
  - **Open** opens the file in iEdit, or in a viewer for pictures and sounds.
  - Scripts get **Run in shellrun** and **Edit as text**.
  - Prolog files also get **Load in Prolog**.
  - **Copy path** copies the file's path.

  Inside the LucianOS desktop, files open in desktop windows.
- **Commands** run in the folder you're in.
  - Type one, or tap a quick command such as `ls -la`, `git status` or `git pull`. Your recent commands become quick commands too.
  - Tick **Prolog** to run a Prolog goal instead.
  - Output shows live, with **Interrupt**. Only commands in the suite's `allowedCommands` can run, and never through a shell.
- **The character:** tap 🎤 and speak, or type to it. It understands:
  - "go to Dropbox", "go up", "go home", "what's here"
  - "open notes", "run breasoning"
  - "find plan"
  - "what is 2 plus 3 times 4", "what time is it"

  Names don't have to be exact: "desk top" finds Desktop, and "notes dot txt" finds notes.txt.

## ⭐ Today

Tap ⭐ (or tell the character "today", "play the game", "rewards" or "Claude list") for four tabs. Inside the LucianOS desktop, **Tools ▸ Claude to-action list** opens the last tab.

- **🔥 Work: your hotspots.**
  - These are the folders you've changed most this week. A repo inside a GitHub folder counts as one hotspot.
  - Each shows its latest files (tap one to open it) and four progress buttons:
    - **✓ Anything:** you did something on it, and that counts.
    - **✍️ 5 hand-written lines:** five lines in your own words. They're added to `LucianOS/progress/<name>.md`.
    - **✳️ Send to Claude:** sends the file list and the latest file, and asks for three small next steps. It shows exactly what will be sent first, and saves the reply in `LucianOS/progress`.
    - **▶ Run a workflow:** runs an item from your LucianOS checklist.
  - The top line counts progress today, this week, and your streak of days.
- **🧩 Game.**
  - Pick a recent file from your Grammar Logic or philosophy folders. Change the folders in the box at the top.
  - Files that look like assignments (assignment, essay, exam, coursework and so on) are left out.
  - Some words become gaps, and a dashed copy is saved in `LucianOS/games`. Type a guess in each gap: green is right, amber is close. **💡 Hint** gives the first letter.
  - **✳️** next to a line asks Claude for the line's structure and a word for each gap. **Claude: fill the gaps** does the whole file and saves Claude's version next to the dashed copy, so you can compare.
  - **📋 Add algorithm lines** puts lines with algorithm terms (recursive, list, sort, parse, predicate…) on the Claude to-action list.
- **🏆 Rewards.**
  - **GitHub statistics:** repos, stars, forks, and pushes this week.
  - **Promote a project:** drafts a post for LibHunt, Hacker News (Show HN) or Facebook.
  - **Check in with someone:** drafts a short message.

  Drafts are saved in `LucianOS/posts` and open in iEdit, for you to edit and post yourself.
- **📋 Claude: the to-action list** (`LucianOS/claude-to-action.md`).
  - Lines with algorithm ideas, collected from your 5 lines, the game, or **Collect from recent files**.
  - **Send 5 to Claude** asks for each idea as a short Prolog predicate. The answer goes in `LucianOS/diagnostics/to-action <date>.md`, and the lines are marked `[~]` (sent). Mark them `[x]` when they're done.

Claude needs a key in LucianOS ▸ Tools ▸ Claude settings. Without one, everything else still works.

## Tests

```sh
npm test
```

The tests cover folder paths, the recent-folders list, command splitting, sizes and swipe detection. They also cover hotspots, progress streaks, skipping assignments, making and checking the game, the to-action list, and the reward drafts.

The app itself was tested in headless Chrome on an iPhone-sized touch screen: taps, a swipe, the recent menu, file actions, quick commands, the allowlist refusal and character commands. Every Today button was tested too, with a stand-in Claude API.
