///<reference lib="deno.unstable" />

export {};

const RSS_URL = Deno.env.get("RSS_FEED_URL")!;
const BLOCKED = ["mshnt.ca/shop-mh", "mshnt.ca/mh-news"];

const kvUrl = Deno.env.get("DENO_KV_URL");
const kv = await Deno.openKv(kvUrl);

const sendTelegram = async (message: string) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const threadId = Deno.env.get("TELEGRAM_THREAD_ID");

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
  };
  if (threadId) body.message_thread_id = parseInt(threadId);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) console.error("Telegram error:", await res.text());
};

const poll = async () => {
  console.log("Polling feed...");
  const res = await fetch(RSS_URL);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].reverse();

  for (const item of items) {
    const block = item[1];
    const guid = block.match(/<guid[^>]*>([^<]*)<\/guid>/)?.[1].trim();
    if (!guid) continue;
    const description =
      block.match(
        /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/,
      )?.[1] ?? "";
    const plain = description.replace(/<[^>]+>/g, " ");
    const links = [...plain.matchAll(/https?:\/\/mshnt\.ca\/[^\s<>"]+/g)]
      .map((m) => m[0].replace(/[.,)]+$/, ""))
      .filter((link) => !BLOCKED.some((b) => link.includes(b)));

    const seen = await kv.get(["seen", guid]);
    if (seen.value || links.length === 0) {
      continue;
    }

    await kv.set(["seen", guid], true);

    const message =
      `🧀 <b>New MouseHunt Items</b>\n\n` +
      links.map((l) => `🔗 ${l}`).join("\n");
    await sendTelegram(message);
    console.log(`Sent: ${links}`);
  }
};

Deno.serve(() => new Response("OK"));

Deno.cron("poll mousehunt feed", "0 * * * *", poll);
