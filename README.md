# Classroom Map

A static classroom seating planner with 35 example students, four rows and four two-person desks per row by default. Students, rows and desks per row can be adjusted. Student management and seat assignment use modal dialogs. Data stays in browser localStorage on the current device.

## Files

- `index.html`: accessible page structure.
- `styles.css`: responsive layout and styles.
- `app.js`: seating, student management and local persistence.

## Local preview

Run `python3 -m http.server 8000` in this directory, then open `http://localhost:8000`.

## GitHub Pages

Push the files to the `main` branch of a repository named `classroom-map`. In **Settings → Pages**, select **GitHub Actions** as the source. The included workflow publishes only the three application files and redeploys after every push to `main`.

The initial 32 seats accommodate 32 students; three students remain unplaced until the room is enlarged. Reducing the room keeps displaced students in the list. Reducing the student count requires confirmation before deleting the last students.
