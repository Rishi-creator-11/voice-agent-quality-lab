// Browser test + walkthrough driver (Playwright CLI). Needs the API on :8787 (with a model key) and a build made with VITE_API_URL=http://localhost:8787 served on :4173.
// Optional recording:  playwright-cli video-start docs/walkthrough.webm  then  playwright-cli run-code --filename=e2e/live-flow.js  then  playwright-cli video-stop
// Drives the real flow (book, then reschedule) and returns the resulting database row for the booking.
async page => {
  const w = (ms) => page.waitForTimeout(ms);
  const agentMsgs = () => page.evaluate(() => [...document.querySelectorAll('.chat .msg.agent')].filter(m => !m.hasAttribute('aria-busy')).length);
  const waitReply = async (n) => { await page.waitForFunction((k) => [...document.querySelectorAll('.chat .msg.agent')].filter(m => !m.hasAttribute('aria-busy')).length >= k, n, { timeout: 60000 }); await w(2200); };
  const say = async (text) => { const box = page.getByLabel('Message to the agent'); await box.fill(text); await w(700); await box.press('Enter'); };

  await page.goto('http://localhost:4173/#/overview'); await page.reload(); await w(4000);
  await page.mouse.wheel(0, 520); await w(3500);
  await page.mouse.wheel(0, -520); await w(800);
  await page.getByRole('link', { name: 'Reports a dental emergency' }).click(); await w(3500);
  await page.mouse.wheel(0, 700); await w(4500);
  await page.getByRole('link', { name: 'Live agent' }).click(); await w(2500);
  await page.getByRole('button', { name: "Hi, I'd like to book a cleaning next Friday." }).click(); await waitReply(1);
  await say("The 20th at 2pm please. I'm Sam Lee, 631-555-0142."); await waitReply(2);
  await say('Yes, book it.'); await waitReply(3);
  await say('Actually, can you move that appointment to Monday at 9am?'); await waitReply(4);
  await say('Yes please. My last name is Lee.'); await waitReply(5);
  await w(2500);
  return await page.evaluate(() => [...document.querySelectorAll('.panel table tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).filter(t => /Sam Lee/.test(t)).join(' | '));
}
