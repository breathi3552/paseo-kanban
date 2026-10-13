# Kanban

Organize tasks in customizable swimlanes, add descriptions and subtasks, and link tasks to Paseo projects. Drag cards to reorder them within a lane or move them between lanes.

Check a card's left checkbox or drag it into the fixed completion lane to finish it. Completed cards appear newest first and retain their ordinary lane. Uncheck to return to that lane's end, or drag out to reopen at a chosen position. If the original lane was deleted, unchecking returns the card to the rightmost ordinary lane. Subtask checklists remain independent.

Open the board from the sidebar or from a workspace's `+` menu. Workspace tabs initially filter to their project's tasks and can sit beside an agent or terminal using Paseo's native split controls. Each open board has its own project filter; all boards on the same host share tasks and lanes.

Board data is stored in Paseo's host-scoped plugin settings. Concurrent edits use revision checks so a stale edit cannot overwrite a newer board. If a project's name cannot be read, its stored ID remains available. If workspace project context is unavailable when the board opens, it initially shows all tasks.

Requires Paseo 0.8.0 or later. No accounts, tokens, or additional setup are required.
