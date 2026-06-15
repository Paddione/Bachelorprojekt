# VideoVault Manual Testing Plan

Due to the nature of some browser APIs (like the File System Access API), manual verification is required for certain features.

## 1. File System Access API

### Drag-and-Drop Root Scanning
1. Open VideoVault in a Chromium-based browser (Chrome, Edge).
2. Open the "Header" -> "Scan Directory" or simply drag a folder onto the application.
3. Verify that the browser prompts for permission to access the folder.
4. Confirm permission and verify that files are scanned and appear in the grid.
5. Reload the page. Verify that file handles are lost (stale state) and use the "Rescan last root" feature in settings/header to restore access.

### File Operations
1. Select a video.
2. Use the "Rename" feature. Verify that the file is renamed on disk.
3. Use the "Delete" feature. Verify that the file is moved to the trash or deleted from disk (depending on OS behavior).

## 2. Authentication and Security

### Login Flow
1. Navigate to `/login`.
2. Enter valid credentials. Verify redirect to `/`.
3. Check the "Settings" modal to confirm "Logged in as admin" status.
4. Clear cookies/localStorage and verify redirect to `/login` or restricted access.

### Unauthorized Access
1. Try to access `/admin/errors` while logged out.
2. Verify that the page either redirects to `/login` or shows an appropriate unauthorized message.
3. Try to perform a "Cleanup" operation from Settings without being an admin. Verify 401/403 error.

## 3. Load Testing (Sustained Auth)

Run the automated load test to ensure the auth middleware doesn't bottleneck the API:
```bash
npm install -g artillery
artillery run test/load-test.artillery.yml
```

Monitor server logs for timeouts or high latency in the `fetchAuthUser` calls.
