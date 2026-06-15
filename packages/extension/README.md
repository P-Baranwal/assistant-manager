# Clerify Browser Extension

A Chrome extension for capturing tasks from any webpage and syncing them with your Clerify account.

## Features

- **Toolbar Button**: Click to open the task creation popup
- **Page Capture**: Automatically pre-fills task title from page title and selected text
- **Context Menu**: Right-click to send selected text or links to Clerify
- **Badge Count**: Shows number of tasks due today
- **Auth Integration**: Syncs with your Clerify account via Supabase

## Installation

### Development

1. Install dependencies:
   ```bash
   cd packages/extension
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

### Production

1. Build for production:
   ```bash
   npm run build
   ```

2. The extension will be in `packages/extension/dist/`

## Configuration

Update the following in `src/background.js` and `src/popup.js`:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

## Usage

### Adding Tasks

1. **Via Toolbar Button**:
   - Click the Clerify icon in your browser toolbar
   - The popup opens with the current page title pre-filled
   - Fill in due date, estimated hours, and type
   - Click "Add Task"

2. **Via Context Menu**:
   - Right-click on any text or link
   - Select "Send to Clerify"
   - The popup opens with the selection pre-filled

3. **Via Selected Text**:
   - Select text on any webpage
   - Click the Clerify icon
   - The selected text appears in the description field

### Authentication

1. Click "Log in to Clerify" in the popup
2. Log in with your Clerify credentials
3. The extension will store your session tokens securely

### Badge Count

- The extension badge shows the number of tasks due today
- Updates every 15 minutes automatically
- Shows nothing when no tasks are due

## Architecture

```
packages/extension/
├── manifest.json          # Manifest V3 configuration
├── package.json           # Dependencies and scripts
├── webpack.config.js      # Build configuration
├── popup.html             # Extension popup UI
├── popup.css              # Popup styles
├── icons/                 # Extension icons
└── src/
    ├── background.js      # Service worker (auth, badge, context menu)
    ├── content.js         # Content script (page capture)
    └── popup.js           # Popup logic (form, API calls)
```

## Development

### Build Commands

```bash
# Development mode (watch)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Type check
npm run typecheck
```

### Testing

1. Build the extension
2. Load in Chrome as unpacked extension
3. Navigate to any webpage
4. Test task creation via toolbar or context menu

## Security Notes

- Session tokens are stored in `chrome.storage.local`
- Tokens are automatically refreshed when expired
- All API calls are authenticated with Supabase JWT
- No sensitive data is stored in the extension

## Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Manifest V3)
- **Brave**: Full support (Manifest V3)
- **Firefox**: Not yet supported (requires Manifest V2)

## Troubleshooting

### Extension not loading
- Ensure you're in Developer mode on `chrome://extensions/`
- Check the console for errors
- Verify all files are in the `dist/` folder

### Authentication issues
- Clear extension storage: `chrome.storage.local.clear()`
- Log in again through the popup
- Check Supabase URL and anon key configuration

### Tasks not syncing
- Verify you're logged in (check badge color)
- Check network connection
- Review Supabase RLS policies for tasks table

## Next Steps

- [ ] Add Firefox support (Manifest V2)
- [ ] Implement task list view in popup
- [ ] Add keyboard shortcuts
- [ ] Support for multiple projects
- [ ] Offline task creation with sync
