const MAILPIT = 'http://localhost:8025/api/v1';

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' });
}

/** Polls Mailpit for the newest message sent to `to` whose subject contains `subjectPart`. */
export async function waitForMail(
  to: string,
  subjectPart: string,
  timeoutMs = 10_000,
): Promise<{ subject: string; text: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const data = (await res.json()) as { messages: MailpitMessage[] };
    const hit = data.messages.find((m) => m.Subject.includes(subjectPart));
    if (hit) {
      const full = (await (
        await fetch(`${MAILPIT}/message/${hit.ID}`)
      ).json()) as { Subject: string; Text: string; HTML: string };
      return { subject: full.Subject, text: full.Text, html: full.HTML };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `No mail to ${to} with subject "${subjectPart}" within ${timeoutMs}ms`,
  );
}

/** The headers of the newest message sent to `to`, as Mailpit got them. */
export async function mailHeaders(
  to: string,
): Promise<Record<string, string[]>> {
  const res = await fetch(
    `${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  const data = (await res.json()) as { messages: MailpitMessage[] };
  const res2 = await fetch(
    `${MAILPIT}/message/${data.messages[0]!.ID}/headers`,
  );
  return (await res2.json()) as Record<string, string[]>;
}

export function extractToken(text: string, path: string): string {
  const m = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!m) throw new Error(`No ${path} link in mail: ${text.slice(0, 200)}`);
  return m[1]!;
}
