import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const WINDOW_MIN = 30;

const FMT: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
};

function localParts(tz: string, d: Date) {
  let f: Intl.DateTimeFormat;
  try { f = new Intl.DateTimeFormat("en-CA", { ...FMT, timeZone: tz }); }
  catch { f = new Intl.DateTimeFormat("en-CA", { ...FMT, timeZone: "Africa/Cairo" }); }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// deno-lint-ignore no-explicit-any
type Sub = any;

// يبعت تنبيه لجهاز واحد. بيرجّع: ok / gone (الجهاز لغى الاشتراك) / failed
async function pushTo(s: Sub, payload: string): Promise<"ok" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
      { TTL: 6 * 3600, urgency: "high" },
    );
    return "ok";
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    const code = (err as any)?.statusCode;
    if (code === 404 || code === 410) {
      await db.from("push_subs").delete().eq("endpoint", s.endpoint);
      return "gone";
    }
    // deno-lint-ignore no-explicit-any
    console.error("push failed", code, (err as any)?.body ?? err);
    return "failed";
  }
}

// تنبيه لكل إشعار جديد نزّله المشرف النهاردة (مرة واحدة بس لكل إشعار)
// deno-lint-ignore no-explicit-any
async function processNotices(dbx: any, subs: Sub[], send: (s: Sub, p: string) => Promise<string>, today: string) {
  const { data: ns } = await dbx.from("items").select("id,data").eq("kind", "n")
    .order("updated_at", { ascending: false }).limit(20);
  // deno-lint-ignore no-explicit-any
  const fresh = (ns ?? []).filter((r: any) => r.data && !r.data.co && !r.data._x && r.data.t && r.data.d === today);
  if (!fresh.length) return 0;
  // deno-lint-ignore no-explicit-any
  const ids = fresh.map((r: any) => r.id);
  const { data: done } = await dbx.from("push_notices").select("id").in("id", ids);
  // deno-lint-ignore no-explicit-any
  const doneSet = new Set((done ?? []).map((x: any) => x.id));
  // deno-lint-ignore no-explicit-any
  const todo = fresh.filter((r: any) => !doneSet.has(r.id)).slice(0, 3);
  let n = 0;
  for (const r of todo) {
    const claim = await dbx.from("push_notices").insert({ id: r.id }); // بنسجّله الأول عشان ما يتبعتش مرتين
    if (claim.error) continue;
    const payload = JSON.stringify({ t: "notice", b: String(r.data.t).slice(0, 160) });
    for (let i = 0; i < subs.length; i += 25) {
      await Promise.all(subs.slice(i, i + 25).map((s: Sub) => send(s, payload)));
    }
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  const { data: cfg, error } = await db.from("push_config").select("*").eq("id", 1).single();
  if (error || !cfg) return new Response("no config", { status: 500 });
  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) return new Response("forbidden", { status: 403 });

  let pub = cfg.vapid_public as string | null, priv = cfg.vapid_private as string | null;
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await db.from("push_config").update({ vapid_public: k.publicKey, vapid_private: k.privateKey })
      .eq("id", 1).is("vapid_public", null);
    const { data: c2 } = await db.from("push_config").select("vapid_public, vapid_private").eq("id", 1).single();
    pub = c2?.vapid_public ?? null; priv = c2?.vapid_private ?? null;
  }
  if (!pub || !priv) return new Response("no vapid keys", { status: 500 });
  webpush.setVapidDetails(SB_URL, pub, priv);

  const { data: subs, error: e2 } = await db.from("push_subs").select("*").eq("enabled", true);
  if (e2) return new Response("db error: " + e2.message, { status: 500 });

  const now = new Date();
  const due = (subs ?? []).map((s) => {
    const l = localParts(s.tz, now);
    const [h, m] = String(s.send_time).split(":").map(Number);
    const diff = l.minutes - (h * 60 + m);
    const scheduled = diff >= 0 && diff < WINDOW_MIN && s.last_sent !== l.date;
    return { s, date: l.date, scheduled, test: !!s.test_now };
  }).filter((x) => x.scheduled || x.test);

  let sent = 0, gone = 0, failed = 0;
  for (let i = 0; i < due.length; i += 25) {
    await Promise.all(due.slice(i, i + 25).map(async ({ s, date, scheduled }) => {
      const st = await pushTo(s, JSON.stringify({ t: "verse" }));
      if (st === "ok") {
        await db.from("push_subs")
          .update({ test_now: false, ...(scheduled ? { last_sent: date } : {}) })
          .eq("endpoint", s.endpoint);
        sent++;
      } else if (st === "gone") {
        gone++;
      } else {
        failed++;
        if (s.test_now) await db.from("push_subs").update({ test_now: false }).eq("endpoint", s.endpoint);
      }
    }));
  }

  let notices = 0;
  try {
    notices = await processNotices(db, subs ?? [], pushTo, localParts("Africa/Cairo", now).date);
  } catch (err) {
    console.error("notices failed", err);
  }

  return new Response(JSON.stringify({ due: due.length, sent, gone, failed, notices }), {
    headers: { "Content-Type": "application/json" },
  });
});
