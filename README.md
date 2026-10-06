# Classroom Map

A static high-school classroom seating planner. Fresh installations include Seconde A (35 students), Première C (32) and Terminale B (30), each with five rows and four two-person desks per row.

## Features

- Independent students, room dimensions and seating for each class.
- Class switching, creation, duplication and confirmed deletion.
- Inline class renaming: click the title or pencil, type, then press Enter or click elsewhere to save. Escape cancels.
- Student management and unplaced-student selection in modal dialogs.
- Local browser persistence and migration of the previous single-class plan, preserving its settings and seating.

New classes start empty with five rows and four desks per row. Duplicate classes copy student names and seating with independent identities.

## Files

`index.html`, `styles.css` and `app.js` contain the complete app. No build step or external dependency is required.

## Development

Run `python3 -m http.server 8000` in this directory and open `http://localhost:8000`.

## Deployment

GitHub Pages uses the included `.github/workflows/pages.yml` workflow. Each push to `main` deploys the three application files automatically. Data is stored on the current browser/device and is not synchronized between devices.
