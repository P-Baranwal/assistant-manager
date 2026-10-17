"""Browser contract for the local-only Clerify build.

The suite intentionally uses the Python Playwright binding so it can run in the
same lightweight environment as the app without adding a second JS test
framework. Set PLAYWRIGHT_CHROMIUM_PATH when the browser is not on Playwright's
default path.
"""

import json
import os
import subprocess
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
BASE_URL = "http://127.0.0.1:4173"


class LocalOnlyBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        env = os.environ.copy()
        env["VITE_LOCAL_ONLY"] = "true"
        cls.server = subprocess.Popen(
            ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "4173"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                with urlopen(BASE_URL, timeout=1):
                    break
            except Exception:
                time.sleep(0.25)
        else:
            cls.server.terminate()
            raise RuntimeError("Vite dev server did not start")

        cls.playwright = sync_playwright().start()
        launch_options = {"headless": True}
        chromium_path = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
        if chromium_path:
            launch_options["executable_path"] = chromium_path
        cls.browser = cls.playwright.chromium.launch(**launch_options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.terminate()
        cls.server.wait(timeout=10)

    def setUp(self):
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.supabase_requests = []
        self.page.on(
            "request",
            lambda request: self.supabase_requests.append(request.url)
            if ".supabase.co" in request.url
            else None,
        )
        self.page.goto(BASE_URL)
        self.page.get_by_role("button", name="Dashboard").wait_for()

    def tearDown(self):
        self.context.close()

    def assert_no_cloud_requests(self):
        self.assertEqual([], self.supabase_requests)

    def add_manual_assignment(self, title):
        self.page.locator("main").get_by_role("button", name="Add Assignment").first.click()
        self.page.get_by_role("tab", name="Manual").click()
        self.page.locator("#m-title").fill(title)
        self.page.get_by_role("button", name="Process Manually/Analyze").click()
        self.page.get_by_role("button", name="Confirm & Save").click()
        self.page.get_by_text(title, exact=True).wait_for()

    def test_fresh_startup_is_local_and_professional_mode_is_available(self):
        self.page.get_by_role("button", name="Settings").click()
        self.page.get_by_text("Context Profiling", exact=True).wait_for()
        self.assertTrue(self.page.get_by_text("Interface Settings", exact=True).is_visible())
        self.assertFalse(self.page.get_by_text("Subscription & Billing", exact=True).is_visible())
        self.assertFalse(self.page.get_by_text("Calendar Sync", exact=True).is_visible())
        self.assertFalse(self.page.get_by_text("Team Management", exact=True).is_visible())
        self.assertFalse(self.page.get_by_text("Sign Up Free", exact=True).is_visible())
        self.assertEqual(0, self.page.locator("#set-provider option[value='anthropic']").count())
        professional = self.page.locator("input[type='radio'][value='professional']")
        self.assertTrue(professional.is_enabled())
        professional.check()
        self.page.get_by_role("button", name="Save Profiles & Preferences").click()
        self.page.get_by_role("button", name="New Project / WBS").wait_for()
        self.assert_no_cloud_requests()

    def test_crud_and_reload_keep_local_data(self):
        self.add_manual_assignment("Offline assignment")
        self.page.get_by_text("Offline assignment", exact=True).click()
        self.page.locator("#detail-date").fill("2030-01-02")
        self.page.get_by_role("button", name="← Back").click()
        self.page.get_by_text("Offline assignment", exact=True).click()
        self.assertEqual("2030-01-02", self.page.locator("#detail-date").input_value())
        self.page.get_by_role("button", name="Delete").click()
        self.page.get_by_role("button", name="Confirm").click()
        self.page.get_by_role("button", name="Dashboard").wait_for()
        self.assertFalse(self.page.get_by_text("Offline assignment", exact=True).is_visible())

        self.page.get_by_role("button", name="Tasks").click()
        self.page.locator("#task-title").fill("Offline task")
        self.page.get_by_role("button", name="Save Quickly (Basic)").click()
        self.page.get_by_text("Offline task", exact=True).wait_for()

        self.page.reload()
        self.page.get_by_text("Offline task", exact=True).wait_for()
        self.assertFalse(self.page.get_by_text("Offline assignment", exact=True).is_visible())
        self.assert_no_cloud_requests()

    def test_backup_restore_replaces_stale_data_and_normalizes_import(self):
        self.add_manual_assignment("Stale assignment")
        self.page.get_by_role("button", name="Settings").click()

        backup = {
            "_exportVersion": 2,
            "profile": {"mode": "student", "provider": "ollama"},
            "theme": "light",
            "assignmentIndex": ["restored-assignment"],
            "assignments": {
                "restored-assignment": {
                    "title": "Restored assignment",
                    "difficulty": 0,
                    "estimatedHours": 0,
                    "priorityScore": 0,
                    "checklist": ["Review backup"],
                }
            },
            "taskIndex": [],
            "tasks": {},
            "projectIndex": [],
            "projects": {},
        }
        self.page.locator("input[aria-label='Import file']").set_input_files(
            {
                "name": "restore.json",
                "mimeType": "application/json",
                "buffer": json.dumps(backup).encode(),
            }
        )
        self.page.get_by_role("button", name="Confirm").click()
        self.page.get_by_text("Import successful! All data restored.", exact=True).wait_for()
        self.page.get_by_role("button", name="Dashboard").click()
        self.page.get_by_text("Restored assignment", exact=True).wait_for()
        self.assertFalse(self.page.get_by_text("Stale assignment", exact=True).is_visible())
        restored = self.page.evaluate("JSON.parse(localStorage.getItem('assignments:restored-assignment'))")
        self.assertEqual(1, restored["difficulty"])
        self.assertEqual(0, restored["estimatedHours"])
        self.assertEqual(0, restored["priorityScore"])
        self.assertTrue(restored["checklist"][0]["id"])
        self.assert_no_cloud_requests()

    def test_local_crud_works_when_browser_is_offline(self):
        self.context.set_offline(True)
        self.add_manual_assignment("Offline after disconnect")
        self.page.get_by_text("Offline after disconnect", exact=True).wait_for()
        # The dev server itself is not expected to serve a navigation while
        # disconnected; this verifies the already-loaded app continues to
        # create and render local data without network access.
        self.assertGreater(
            self.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('assignments:')).length"),
            0,
        )
        self.assert_no_cloud_requests()


if __name__ == "__main__":
    unittest.main()
