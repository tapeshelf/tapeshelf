const MAILPIT = 'http://localhost:8025/api/v1';

/** Polls Mailpit for the newest message to `to` whose subject contains `subjectPart` and returns its text body. */
export async function waitForMailText(
  to: string,
  subjectPart: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const hit = data.messages.find((m) => m.Subject.includes(subjectPart));
    if (hit) {
      const full = (await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json()) as { Text: string };
      return full.Text;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No mail to ${to} with subject "${subjectPart}"`);
}

export function linkFromMail(text: string, path: string): string {
  const m = new RegExp(`(https?://[^\\s]+${path}\\?token=[A-Za-z0-9_-]+)`).exec(text);
  if (!m) throw new Error(`No ${path} link in mail`);
  return m[1]!;
}
