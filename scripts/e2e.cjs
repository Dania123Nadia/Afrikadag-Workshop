// Browser walkthrough of the full journey (facilitator + 3 participants on phones).
// Usage: BASE_URL=http://127.0.0.1:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… SHOTS=./shots node scripts/e2e.cjs
const { chromium, devices } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS || "./shots";
fs.mkdirSync(SHOTS, { recursive: true });
const CODE = "DEMO" + Math.floor(10 + Math.random() * 89);
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` (${d})` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const admin = await adminCtx.newPage();
  admin.on("pageerror", (e) => console.log("admin pageerror", e.message));

  // --- facilitator signs in and creates a workshop
  await admin.goto(`${BASE}/admin`);
  await admin.fill("#em", process.env.ADMIN_EMAIL);
  await admin.fill("#pw", process.env.ADMIN_PASSWORD);
  await admin.click("button:has-text('Sign in')");
  await admin.waitForSelector("text=New workshop");
  const codeInput = admin.locator("input.font-mono");
  await codeInput.fill(CODE);
  await admin.click("button:has-text('Create workshop')");
  await admin.waitForSelector("text=Live group monitoring", { timeout: 15000 });
  const wsUrl = admin.url();
  check("Facilitator signs in and creates a workshop from the template", true, CODE);

  // --- three participants on phones (two at table 1, one at table 6 = same group; one at table 2)
  const phone = devices["iPhone 13"];
  const mkP = async (name, table) => {
    const ctx = await browser.newContext({ ...phone });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log(name, "pageerror", e.message));
    await p.goto(`${BASE}/?code=${CODE}`);
    await p.waitForSelector("text=Your table number");
    await p.click(`button[aria-pressed]:text-is("${table}")`);
    if (name) await p.fill("#name", name);
    await p.click("button:has-text('Join workshop')");
    await p.waitForSelector("text=Waiting for the facilitator", { timeout: 15000 });
    return p;
  };
  const a = await mkP("Amina", 1);
  await a.screenshot({ path: `${SHOTS}/01-participant-waiting.png` });
  const b = await mkP("Bram", 6);
  const c = await mkP("", 2);
  check("Participants join with code + table, no account", true);

  // join page screenshot (fresh)
  const j = await (await browser.newContext({ ...phone })).newPage();
  await j.goto(`${BASE}/?code=${CODE}`); await j.waitForSelector("text=Your table number"); await j.click(`button[aria-pressed]:text-is("3")`);
  await j.screenshot({ path: `${SHOTS}/00-join.png` });

  // --- facilitator starts → participants update automatically
  await admin.click("button:has-text('Start workshop')");
  await a.waitForSelector("text=The challenge", { timeout: 10000 });
  check("Starting the workshop updates participant screens without refresh", true);
  await sleep(800);
  await a.screenshot({ path: `${SHOTS}/02-participant-intro.png`, fullPage: true });

  await admin.click("button:has-text('Next stage')");
  await a.waitForSelector("text=Part A", { timeout: 10000 });
  await a.click("text=Traffic light system");
  await sleep(500);
  await a.screenshot({ path: `${SHOTS}/03-participant-proposal.png`, fullPage: true });

  await admin.click("button:has-text('Next stage')");
  await a.waitForSelector("text=Your stakeholder role", { timeout: 10000 });
  const roleA = await a.locator("article h2").first().innerText();
  const roleB = await b.locator("article h2").first().innerText();
  const roleC = await c.locator("article h2").first().innerText();
  check("Stakeholder allocated by table (tables 1 & 6 share a group, table 2 differs)", roleA === roleB && roleA !== roleC, `${roleA} / ${roleB} / ${roleC}`);
  await sleep(600);
  await a.screenshot({ path: `${SHOTS}/04-participant-role.png`, fullPage: true });

  await admin.click("button:has-text('Next stage')");
  await a.waitForSelector("text=Group discussion notes", { timeout: 10000 });
  await b.waitForSelector("text=Group discussion notes", { timeout: 10000 });

  // --- collaborative editing: A and B type in the same notes at the same time
  const notesA = a.locator("textarea").nth(1);
  const notesB = b.locator("textarea").nth(1);
  await Promise.all([
    notesA.pressSequentially("Amina: housing standards must be enforced. ", { delay: 15 }),
    notesB.pressSequentially("Bram: who pays for language training? ", { delay: 15 }),
  ]);
  await sleep(3500);
  const va = await notesA.inputValue(), vb = await notesB.inputValue();
  check("Two people typing in shared notes at once: both texts kept and synced", va === vb && va.includes("housing standards") && va.includes("language training"), JSON.stringify(va));

  await a.locator("textarea").first().fill("Promising, but who guarantees fair treatment?");
  await a.fill("input[placeholder='Add an opportunity…']", "Skills transfer back to Kenya");
  await a.click("button[aria-label='Add opportunity']");
  await b.fill("input[placeholder='Add a risk or challenge…']", "Brain drain in health care");
  await b.click("button[aria-label='Add risk']");
  await b.fill("input[placeholder='Add a recommendation…']", "Joint Kenyan–Dutch oversight board for recruitment");
  await b.click("button[aria-label='Add recommendation']");
  await a.waitForSelector("text=Brain drain in health care", { timeout: 8000 });
  check("Ideas added by one group member appear live for the others", true);
  const leak = await c.locator("text=Brain drain in health care").count();
  check("Another group cannot see this group's workspace", leak === 0);
  await c.locator("textarea").nth(1).fill("Employers: standardised tests would speed up hiring.");
  await c.fill("input[placeholder='Add a risk or challenge…']", "Brain drain if recruitment is not limited");
  await c.click("button[aria-label='Add risk']");
  await c.fill("input[placeholder='Add an opportunity…']", "Brain drain can be limited with co-training");
  await c.click("button[aria-label='Add opportunity']");

  // --- refresh mid-typing keeps content
  await notesA.pressSequentially("Unsaved tail before refresh.", { delay: 5 });
  await a.reload();
  await a.waitForSelector("text=Group discussion notes", { timeout: 10000 });
  await sleep(2000);
  const afterReload = await a.locator("textarea").nth(1).inputValue();
  check("Refreshing the browser mid-typing loses nothing", afterReload.includes("Unsaved tail before refresh."));
  await a.screenshot({ path: `${SHOTS}/05-participant-workspace.png`, fullPage: true });

  // --- facilitator sees drafts live, before submission
  await admin.waitForSelector("text=Skills transfer back to Kenya", { timeout: 8000 });
  check("Facilitator sees draft content live before submission", true);
  await sleep(1000);
  await admin.screenshot({ path: `${SHOTS}/06-admin-dashboard.png`, fullPage: true });
  await admin.click(`button:has-text("${roleA}")`);
  await admin.waitForSelector("text=Live draft:");
  await admin.locator("button[title='Show in presentation']").first().click();
  await sleep(500);
  await admin.screenshot({ path: `${SHOTS}/07-admin-group-drawer.png` });
  await admin.keyboard.press("Escape");

  // --- announcement + pause
  await admin.fill("input[placeholder='Message for every screen…']", "Ten minutes left, start thinking about your key takeaway.");
  await admin.click("button[aria-label='Send']");
  await a.waitForSelector("text=Ten minutes left", { timeout: 8000 });
  check("Announcements reach participants", true);
  await admin.click("button:has-text('Pause workshop')");
  await b.waitForSelector("text=Paused by the facilitator", { timeout: 8000 });
  check("Pause is shown to participants", true);
  await admin.click("button:has-text('Resume workshop')");
  await admin.click("button:has-text('5 min')");

  // --- submit stage
  await admin.click("button:has-text('Next stage')");
  await b.waitForSelector("text=Review your group's work", { timeout: 10000 });
  await b.locator("#takeaway").fill("Circular migration only works with enforceable rights and shared oversight.");
  await sleep(1500);
  await b.click("button:has-text(\"Submit our group's contribution\")");
  await a.waitForSelector("text=Submitted", { timeout: 8000 });
  check("Group submission confirmed to every member", true);
  await sleep(500);
  await b.screenshot({ path: `${SHOTS}/08-participant-submitted.png` });

  // --- lock
  admin.once("dialog", (d) => d.accept());
  await admin.click("button:has-text('Lock input')");
  await c.waitForSelector("text=Submissions are locked", { timeout: 8000 });
  check("Locking input disables participant editing", await c.locator("textarea").nth(1).isDisabled());

  // --- insights, presentation, setup
  await admin.goto(`${wsUrl}/insights`);
  await admin.waitForSelector("text=Most mentioned opportunities");
  await sleep(800);
  await admin.screenshot({ path: `${SHOTS}/09-admin-insights.png`, fullPage: true });
  const contested = await admin.locator("text=Conflicting perspectives").locator("..").locator("..").innerText();
  check("Insights detect a topic seen as opportunity by one group and risk by another", /brain drain/i.test(contested));

  await admin.goto(`${wsUrl}/present?slide=join`);
  await admin.waitForSelector("text=Workshop code");
  await admin.screenshot({ path: `${SHOTS}/10-present-join.png` });
  await admin.selectOption("select", { label: `4. ${roleA}` });
  await sleep(800);
  await a.waitForSelector("text=Now presenting", { timeout: 1 }).catch(() => {});
  await admin.screenshot({ path: `${SHOTS}/11-present-group.png` });
  await admin.click("button:has-text('Starred only')");
  await admin.selectOption("select", { index: 3 + 5 + 2 });
  await sleep(500);
  await admin.screenshot({ path: `${SHOTS}/12-present-concerns.png` });

  await admin.goto(`${wsUrl}/setup`);
  await admin.waitForSelector("text=Tables → stakeholder groups");
  await admin.screenshot({ path: `${SHOTS}/13-admin-setup.png` });

  // tablet view of dashboard
  const tab = await (await browser.newContext({ ...devices["iPad (gen 7) landscape"], storageState: await adminCtx.storageState() })).newPage();
  await tab.goto(wsUrl); await tab.waitForSelector("text=Live group monitoring"); await sleep(1500);
  await tab.screenshot({ path: `${SHOTS}/14-admin-tablet.png` });

  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed · code ${CODE}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
