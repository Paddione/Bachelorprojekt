# Plan: Health-Goal: Unvollständige :latest-Image Exclusions in CLAUDE.md

## Objectives
Ensure that the exclusion list for `:latest` images in `CLAUDE.md` and `AGENTS.md` is complete. This prevents AI agents from attempting to pin images that are intentionally designed to be rebuilt and re-imported on every release.

## Tasks
1. **Update CLAUDE.md**
   - Locate the `Image Exclusions` section (approx line 158).
   - Add `Brain`, `Studio`, and `Talk-Transcriber` to the list.
   - Current list: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads.

2. **Update AGENTS.md**
   - Locate the `Image-Pins` section (approx line 96).
   - Add `Mentolder-Web`, `Downloads`, `Brain`, `Studio`, and `Talk-Transcriber` to the exclusion list.
   - Current list: Website, Brett, Docs, Videovault, Mediaviewer-Widget.

3. **Verification**
   - Verify that the new entries match the manifests in `k3d/` (e.g., `k3d/brain.yaml`, `k3d/studio.yaml`, and `Taskfile.yml` for talk-transcriber).
   - Run `task workspace:validate` to ensure no manifest syntax errors were introduced.

4. **Deployment**
   - Commit changes with a conventional commit message.
   - Create a PR and merge into `main`.
