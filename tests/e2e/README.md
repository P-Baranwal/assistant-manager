# Local browser tests

These tests use the Python Playwright binding and run against a Vite dev
server with `VITE_LOCAL_ONLY=true`:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:e2e
```

Set `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is installed outside Playwright's
default browser cache.
