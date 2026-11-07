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

## Tests

```sh
npm test
```

The tests cover folder paths, the recent-folders list, command splitting, sizes and swipe detection.

The app itself was tested in headless Chrome on an iPhone-sized touch screen: taps, a swipe, the recent menu, file actions, quick commands, the allowlist refusal and character commands.
