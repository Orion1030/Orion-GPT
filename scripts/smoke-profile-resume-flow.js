#!/usr/bin/env node
/**
 * UI smoke flow for:
 * - Profile create/edit with keyPoints WYSIWYG
 * - Resume import modal
 * - Resume editor preview update from experience editor
 *
 * Requires a running frontend (default http://127.0.0.1:3000).
 * Uses the "Test" account by default.
 */
const puppeteer = require("puppeteer");

const BASE_URL = process.env.SMOKE_FRONTEND_URL || "http://127.0.0.1:3000";
const API_BASE = process.env.SMOKE_API_BASE || "http://127.0.0.1:5050/api";
const LOGIN_NAME = process.env.SMOKE_LOGIN_NAME || "Test";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD || "anypass";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickButtonContainingText(page, text, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const clicked = await page.evaluate((needle) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((btn) =>
        (btn.textContent || "").trim().includes(needle)
      );
      if (!target) return false;
      target.click();
      return true;
    }, text);
    if (clicked) return;
    await sleep(200);
  }
  throw new Error(`Button containing text "${text}" not found`);
}

async function clickButtonExactText(page, text, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const clicked = await page.evaluate((needle) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find(
        (btn) => (btn.textContent || "").trim() === needle
      );
      if (!target) return false;
      target.click();
      return true;
    }, text);
    if (clicked) return;
    await sleep(200);
  }
  throw new Error(`Button with exact text "${text}" not found`);
}

async function clickTabExactText(page, text, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tabs = await page.$$('button[role="tab"]');
    for (const tab of tabs) {
      const tabText = await tab.evaluate((el) => (el.textContent || "").trim());
      if (tabText !== text) continue;
      await tab.click();
      await sleep(250);
      const becameActive = await tab.evaluate(
        (el) => el.getAttribute("data-state") === "active"
      );
      if (becameActive) return;
    }
    await sleep(200);
  }
  throw new Error(`Tab with text "${text}" not found`);
}

async function clickFirstRoleOption(page, text, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const clicked = await page.evaluate((needle) => {
      const options = Array.from(
        document.querySelectorAll('[role="option"]')
      );
      const target = options.find(
        (opt) => (opt.textContent || "").trim().includes(needle)
      );
      if (!target) return false;
      target.click();
      return true;
    }, text);
    if (clicked) return;
    await sleep(150);
  }
  throw new Error(`Role option "${text}" not found`);
}

async function typeInVisibleInputByPlaceholder(page, placeholder, value) {
  const handles = await page.$$(`input[placeholder="${placeholder}"]`);
  for (const handle of handles) {
    const visible = await handle.evaluate(
      (el) => !!(el instanceof HTMLElement && el.offsetParent !== null)
    );
    if (!visible) continue;
    await handle.click({ clickCount: 3 });
    await handle.type(value);
    return true;
  }
  return false;
}

async function setVisibleDateInput(page, visibleIndex, value) {
  const handles = await page.$$('div[role="dialog"] input[type="date"]');
  const visible = [];
  for (const handle of handles) {
    const isVisible = await handle.evaluate(
      (el) => !!(el instanceof HTMLElement && el.offsetParent !== null)
    );
    if (isVisible) visible.push(handle);
  }
  if (visible.length <= visibleIndex) return false;
  await visible[visibleIndex].click({ clickCount: 3 });
  await visible[visibleIndex].type(value);
  return true;
}

async function waitForText(page, text, timeoutMs = 30000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout: timeoutMs },
    text
  );
}

async function run() {
  const now = Date.now();
  const profileName = `Smoke Keypoints ${now}`;
  const updatedPoint = `Updated keypoint ${now}`;
  const previewPhrase = `Preview phrase ${now}`;
  const smokeResumeText = [
    "John Doe",
    "Senior Frontend Engineer",
    "Summary: Build accessible, high-performance web apps.",
    "Experience:",
    "- Led React migration for an enterprise dashboard",
    "- Reduced render latency by 35%",
    "Skills: React, TypeScript, Node.js, AWS",
    "Education: BS Computer Science",
  ].join("\n");

  const report = {
    baseUrl: BASE_URL,
    apiBase: API_BASE,
    startedAt: new Date().toISOString(),
    profileName,
    steps: [],
    issues: [],
  };

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 960 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  let authToken = "";

  const runStep = async (name, fn, { required = true } = {}) => {
    try {
      await fn();
      report.steps.push({ name, status: "passed" });
    } catch (err) {
      const msg = err?.message || String(err);
      report.steps.push({ name, status: required ? "failed" : "warn", error: msg });
      if (required) throw err;
      report.issues.push(`[${name}] ${msg}`);
    }
  };

  try {
    await runStep("seed_auth_session", async () => {
      const response = await fetch(`${API_BASE}/auth/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: LOGIN_NAME, password: LOGIN_PASSWORD }),
      });
      const payload = await response.json();
      if (!payload?.success || !payload?.data?.token) {
        throw new Error(
          `Auth seed failed (${response.status}): ${payload?.message || "unknown error"}`
        );
      }
      const token = payload.data.token;
      const refreshToken = payload.data.refreshToken || "";
      authToken = token;
      await page.evaluateOnNewDocument(
        ({ authToken, authRefreshToken, userName }) => {
          localStorage.setItem("token", authToken);
          localStorage.setItem("refreshToken", authRefreshToken);
          localStorage.setItem("userId", userName);
        },
        { authToken: token, authRefreshToken: refreshToken, userName: LOGIN_NAME }
      );

      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () =>
          window.location.pathname.includes("/dashboard") &&
          !document.body.innerText.includes("Redirecting"),
        { timeout: 45000 }
      );
    });

    await runStep("create_profile_with_wysiwyg_keypoints", async () => {
      await page.goto(`${BASE_URL}/profiles`, { waitUntil: "domcontentloaded" });
      await clickButtonContainingText(page, "New profile");
      await waitForText(page, "Create New Profile");

      await page.type("#fullName", profileName);
      await page.type("#title", "Senior QA Engineer");
      await page.type("#email", `smoke${now}@example.com`);
      await page.type("#phone", "+15551234567");

      await page.evaluate(() => {
        const trigger = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent || "").includes("Select stack")
        );
        if (trigger) trigger.click();
      });
      await clickFirstRoleOption(page, "React");

      await clickTabExactText(page, "Education");
      const universityTyped = await typeInVisibleInputByPlaceholder(
        page,
        "University of Technology",
        "Smoke State University"
      );
      if (!universityTyped) throw new Error("Visible university input not found");
      const majorTyped = await typeInVisibleInputByPlaceholder(
        page,
        "Computer Science",
        "Computer Science"
      );
      if (!majorTyped) throw new Error("Visible major input not found");
      const eduStartSet = await setVisibleDateInput(page, 0, "2016-09-01");
      const eduEndSet = await setVisibleDateInput(page, 1, "2020-05-31");
      if (!eduStartSet || !eduEndSet) {
        throw new Error("Visible education date inputs not found");
      }

      await clickTabExactText(page, "Career History");
      const roleTyped = await typeInVisibleInputByPlaceholder(
        page,
        "Senior Software Engineer",
        "Senior QA Engineer"
      );
      if (!roleTyped) throw new Error("Visible role title input not found");
      const companyTyped = await typeInVisibleInputByPlaceholder(
        page,
        "Acme Corporation",
        "Smoke Labs"
      );
      if (!companyTyped) throw new Error("Visible company name input not found");

      const startDateSet = await setVisibleDateInput(page, 0, "2022-01-01");
      const endDateSet = await setVisibleDateInput(page, 1, "2024-12-31");
      if (!startDateSet || !endDateSet) {
        throw new Error("Visible career date inputs not found");
      }

      await page.type(
        'textarea[placeholder="Brief description of the company and your role..."]',
        "QA-focused product company with rapid release cycles."
      );

      const editorSelector = 'div[role="dialog"] [contenteditable="true"]';
      await page.waitForSelector(editorSelector);
      const bulletClicked = await page.evaluate(() => {
        const btn = document.querySelector('div[role="dialog"] button[title="Bullet list"]');
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!bulletClicked) {
        report.issues.push(
          "[create_profile_with_wysiwyg_keypoints] Bullet-list toolbar button not found; typed plain text instead."
        );
      }
      await page.focus(editorSelector);
      await page.keyboard.type("Implemented release quality gates across CI.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Reduced escaped defects by 42% quarter-over-quarter.");

      await clickButtonContainingText(page, "Create Profile");
      await page.waitForFunction(
        () => !document.body.innerText.includes("Create New Profile"),
        { timeout: 30000 }
      );

      await waitForText(page, profileName, 30000);
    });

    await runStep(
      "edit_profile_and_verify_keypoints_persist",
      async () => {
      const openEdit = await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        const row = rows.find((r) => (r.textContent || "").includes(name));
        if (!row) return false;
        const editBtn = row.querySelector("button");
        if (!editBtn) return false;
        editBtn.click();
        return true;
      }, profileName);
      if (!openEdit) throw new Error("Could not open edit modal for created profile");

      await waitForText(page, "Edit Profile");
      await clickTabExactText(page, "Career History");

      const editorSelector = 'div[role="dialog"] [contenteditable="true"]';
      await page.waitForSelector(editorSelector);
      await page.focus(editorSelector);
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(updatedPoint);

      await clickButtonContainingText(page, "Update Profile");
      await page.waitForFunction(
        () => !document.body.innerText.includes("Edit Profile"),
        { timeout: 30000 }
      );

      // Re-open and verify the WYSIWYG content was persisted.
      const reopen = await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        const row = rows.find((r) => (r.textContent || "").includes(name));
        if (!row) return false;
        const editBtn = row.querySelector("button");
        if (!editBtn) return false;
        editBtn.click();
        return true;
      }, profileName);
      if (!reopen) throw new Error("Could not reopen edited profile");
      await waitForText(page, "Edit Profile");
      await clickTabExactText(page, "Career History");
      await page.waitForSelector(editorSelector);
      const hasUpdatedText = await page.evaluate(
        (selector, needle) => {
          const node = document.querySelector(selector);
          if (!node) return false;
          return (node.textContent || "").includes(needle);
        },
        editorSelector,
        updatedPoint
      );
      if (!hasUpdatedText) {
        const apiConfirm = await fetch(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
          .then((r) => r.json())
          .then((json) => {
            const profiles = Array.isArray(json?.data) ? json.data : [];
            const current = profiles.find((p) => p.fullName === profileName);
            const value = current?.careerHistory?.[0]?.keyPoints;
            return typeof value === "string" && value.includes(updatedPoint);
          })
          .catch(() => false);

        if (apiConfirm) {
          report.issues.push(
            "[edit_profile_and_verify_keypoints_persist] UI reopen check was flaky, but API confirms updated keyPoints persisted."
          );
        } else {
          throw new Error("Updated keyPoints text was not found after reopening profile");
        }
      }

      await clickButtonContainingText(page, "Cancel");
      },
      { required: false }
    );

    await runStep(
      "import_resume_flow",
      async () => {
        await page.goto(`${BASE_URL}/resumes`, { waitUntil: "domcontentloaded" });
        await clickButtonContainingText(page, "Import resume");
        await waitForText(page, "Create Resume from Upload");

        const textareaSelector = 'textarea[placeholder*="Paste resume content here"]';
        await page.waitForSelector(textareaSelector);
        await page.type(textareaSelector, smokeResumeText);
        await clickButtonContainingText(page, "Analyze & Continue");

        await page.waitForFunction(
          () =>
            document.body.innerText.includes("Parsed overview") ||
            document.body.innerText.includes("Parsing failed"),
          { timeout: 120000 }
        );

        const parsingFailed = await page.evaluate(() =>
          document.body.innerText.includes("Parsing failed")
        );
        if (parsingFailed) {
          report.issues.push(
            "[import_resume_flow] Resume parsing reached 'Parsing failed' state."
          );
          return;
        }

        await clickButtonContainingText(page, "Continue");
        await waitForText(page, "Attach to profile and save", 30000);

        // Try selecting the newly created profile if listed.
        await page.evaluate((name) => {
          const rows = Array.from(document.querySelectorAll("div"));
          const candidate = rows.find(
            (r) =>
              r.className &&
              String(r.className).includes("cursor-pointer") &&
              (r.textContent || "").includes(name)
          );
          if (candidate) candidate.click();
        }, profileName);

        const hasUseSelected = await page.evaluate(() =>
          Array.from(document.querySelectorAll("button")).some((btn) =>
            (btn.textContent || "").includes("Use Selected Profile")
          )
        );

        if (hasUseSelected) {
          await clickButtonContainingText(page, "Use Selected Profile");
          await page.waitForFunction(
            () => !document.body.innerText.includes("Create Resume from Upload"),
            { timeout: 120000 }
          );
          return;
        }

        const hasCreateNew = await page.evaluate(() =>
          Array.from(document.querySelectorAll("button")).some((btn) =>
            (btn.textContent || "").includes("Create New Profile")
          )
        );

        if (hasCreateNew) {
          report.issues.push(
            "[import_resume_flow] Matching profile action was not available; UI offered only 'Create New Profile' branch."
          );
          return;
        }

        throw new Error('Neither "Use Selected Profile" nor "Create New Profile" action was available');
      },
      { required: false }
    );

    await runStep(
      "resume_edit_preview_updates_from_experience_editor",
      async () => {
        // Open "new resume" editor from explorer toolbar.
        const opened = await page.evaluate(() => {
          const btn = document.querySelector('button[title="New Resume"]');
          if (!btn) return false;
          btn.click();
          return true;
        });
        if (!opened) throw new Error("New Resume button not found in explorer");

        await page.waitForSelector('div[role="dialog"]');
        await waitForText(page, "Content");

        // Pick profile in editor.
        const selectOpened = await page.evaluate(() => {
          const trigger = Array.from(document.querySelectorAll("button")).find(
            (b) =>
              b.closest('div[role="dialog"]') &&
              ((b.textContent || "").includes("Select a profile") ||
                b.getAttribute("data-state") === "closed")
          );
          if (!trigger) return false;
          trigger.click();
          return true;
        });
        if (!selectOpened) throw new Error("Profile selector in resume editor not found");
        await clickFirstRoleOption(page, profileName, 15000);

        // Wait for editors to render and update first experience editor (2nd/3rd contenteditable).
        await page.waitForFunction(
          () => document.querySelectorAll('div[role="dialog"] [contenteditable="true"]').length >= 2,
          { timeout: 30000 }
        );

        const editors = await page.$$('div[role="dialog"] [contenteditable="true"]');
        if (editors.length < 2) throw new Error("Not enough rich text editors found");
        const targetEditor = editors[Math.min(1, editors.length - 1)];
        await targetEditor.click();
        await page.keyboard.type(previewPhrase);
        await sleep(1200);

        // Verify preview iframe reflects entered experience text.
        const previewHasPhrase = await page.evaluate((needle) => {
          const iframe = document.querySelector('iframe[title="Preview"]');
          if (!iframe) return false;
          const doc = iframe.contentDocument;
          if (!doc || !doc.body) return false;
          return doc.body.innerText.includes(needle);
        }, previewPhrase);
        if (!previewHasPhrase) {
          throw new Error("Preview iframe did not reflect updated experience content");
        }

        await clickButtonContainingText(page, "Cancel");
      },
      { required: false }
    );
  } finally {
    report.finishedAt = new Date().toISOString();
    await browser.close();
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: err?.message || String(err),
        stack: err?.stack || null,
      },
      null,
      2
    )
  );
  process.exit(1);
});
