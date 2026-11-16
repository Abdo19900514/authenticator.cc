const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const VERDICT = { winning: "رابح 🔥", promising: "واعد 👍", risky: "فيه المخاطرة ⚠️", not_recommended: "ما ننصحش بيه ❌" };

const state = { analysis: null, productImage: null, selected: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4000);
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
const postJSON = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function busy(btn, label, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${label}`;
  try { return await fn(); } catch (e) { toast(e.message); } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---- config badges
api("/api/config").then((c) => {
  $("#keys").innerHTML = [["claude", "التحليل"], ["openai", "تصاور/فيديو"], ["facebook", "فيسبوك"]]
    .map(([k, l]) => `<span class="${c[k] ? "on" : "off"}">${c[k] ? "●" : "○"} ${l}</span>`).join("");
}).catch(() => {});

// ---- image picker
const fileInput = $("#form input[type=file]");
fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  if (!f) return;
  $("#preview").src = URL.createObjectURL(f); $("#preview").hidden = false; $("#dropText").textContent = f.name;
});

// ---- analyze
$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy($("#analyzeBtn"), "كنحلل... (ممكن ياخد دقيقة)", async () => {
    const data = await api("/api/analyze", { method: "POST", body: new FormData(e.target) });
    state.analysis = data.analysis; state.productImage = data.productImage; state.selected = null;
    render(data.analysis);
    $("#results").hidden = false;
    $("#verdictCard").scrollIntoView({ behavior: "smooth" });
  });
});

function render(a) {
  $("#verdictCard").innerHTML = `
    <div class="score v-${a.verdict}">${Math.round(a.winning_score)}</div>
    <div>
      <h2>${esc(a.product_name)} <span class="badge bg-${a.verdict}">${VERDICT[a.verdict]}</span></h2>
      <p class="muted">${esc(a.category)}</p>
      <p>${esc(a.product_summary)}</p>
      <p><b>الحكم:</b> ${esc(a.verdict_explanation)}</p>
      <p><b>عامل الإبهار:</b> ${esc(a.wow_factor)}</p>
      <p><b>المشكل اللي كيحل:</b> ${esc(a.problem_it_solves)}</p>
    </div>`;

  $("#prosCons").innerHTML = `
    <h2>⚖️ الإيجابيات والسلبيات</h2>
    <ul class="pros">${a.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <h3>السلبيات</h3>
    <ul class="cons">${a.cons.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <h3>💰 الثمن</h3>
    <p>ثمن الشرا التقريبي: <b>${esc(a.pricing.estimated_cost)}</b><br>ثمن البيع المقترح: <b>${esc(a.pricing.suggested_price)}</b><br><span class="muted">${esc(a.pricing.margin_note)}</span></p>`;

  const t = a.target_audience;
  $("#audience").innerHTML = `
    <h2>🎯 الجمهور المستهدف</h2>
    <p>العمر: <b>${esc(t.age_range)}</b> · الجنس: <b>${esc(t.gender)}</b></p>
    <h3>الاهتمامات (للاستهداف فالإعلانات)</h3>
    <div class="chips">${t.interests.map((i) => `<span>${esc(i)}</span>`).join("")}</div>
    <h3>نقط الألم</h3>
    <ul>${t.pain_points.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    <h3>زوايا التسويق</h3>
    <ul>${a.marketing_angles.map((m) => `<li><b>${esc(m.angle)}:</b> ${esc(m.hook)}</li>`).join("")}</ul>`;

  $("#strategy").innerHTML = `
    <h2>🗺️ الطريقة باش تخدم عليه</h2>
    <ol class="steps">${a.strategy_steps.map((s) => `<li><b>${esc(s.step)}</b><br>${esc(s.details)}</li>`).join("")}</ol>
    <h3>💸 الميزانية ديال الإعلانات</h3><p>${esc(a.ad_budget_plan)}</p>`;

  $("#copies").innerHTML = a.ad_copies.map((c, i) => `
    <div class="copy" dir="${/fr|en|french|anglais|français/i.test(c.language) ? "ltr" : "rtl"}">
      <div class="meta">${esc(c.language)} · ${esc(c.style)}</div>
      <div class="head">${esc(c.headline)}</div>
      <div class="body">${esc(c.primary_text)}</div>
      <div class="meta">CTA: ${esc(c.call_to_action)}</div>
      <div class="actions">
        <button data-copy="${i}">📋 نسخ</button>
        <button data-use="${i}">📤 استعمل فالنشر</button>
      </div>
    </div>`).join("");
  $("#hashtags").innerHTML = a.hashtags.map((h) => `<span>${esc(h.startsWith("#") ? h : "#" + h)}</span>`).join("");

  $("#imagePrompts").innerHTML = a.image_prompts.map((p, i) => `
    <div class="prompt">
      <textarea rows="3" id="ip${i}">${esc(p)}</textarea>
      <button class="primary" data-gen="${i}">🎨 صايب</button>
    </div>`).join("") + `<div class="row"><button id="genAll">🎨 صايب كاملين</button>
      <select id="imgSize"><option value="1024x1024">مربعة 1:1</option><option value="1024x1536">عمودية (ستوري)</option><option value="1536x1024">أفقية</option></select></div>`;
  $("#gallery").innerHTML = "";

  $("#script").innerHTML = a.video_script.map((s) => `<div><b>${esc(s.seconds)}</b> — ${esc(s.scene)}<br><span class="muted">🎙️ ${esc(s.voiceover)}</span></div>`).join("");
  $("#videoPrompt").value = a.video_prompt;
  $("#videoOut").innerHTML = ""; $("#videoStatus").textContent = "";

  useCopy(0);
  selectMedia(null);
}

function copyText(c) {
  const tags = state.analysis.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ");
  return `${c.headline}\n\n${c.primary_text}\n\n👉 ${c.call_to_action}\n\n${tags}`;
}
function useCopy(i) { $("#postText").value = copyText(state.analysis.ad_copies[i]); }

$("#copies").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.copy) { navigator.clipboard.writeText(copyText(state.analysis.ad_copies[b.dataset.copy])).then(() => toast("تنسخ ✅")); }
  if (b.dataset.use) { useCopy(b.dataset.use); $("#publishCard").scrollIntoView({ behavior: "smooth" }); }
});

// ---- images
async function generateImage(i) {
  const prompt = $(`#ip${i}`).value;
  const tile = document.createElement("div");
  tile.className = "media"; tile.innerHTML = `<div class="ph"><span class="spin"></span></div>`;
  $("#gallery").prepend(tile);
  try {
    const { url } = await postJSON("/api/images", { prompt, productImage: state.productImage, size: $("#imgSize").value });
    tile.innerHTML = `<img src="${url}" alt=""><a href="${url}" download onclick="event.stopPropagation()">⬇️ تحميل</a>`;
    tile.onclick = () => selectMedia({ url, type: "image" }, tile);
  } catch (e) { tile.remove(); toast(e.message); }
}
$("#imagePrompts").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.gen) busy(b, "", () => generateImage(b.dataset.gen));
  if (b.id === "genAll") busy(b, "كنصايب...", () => Promise.all(state.analysis.image_prompts.map((_, i) => generateImage(i))));
});

function selectMedia(m, el) {
  state.selected = m;
  document.querySelectorAll(".media.sel").forEach((x) => x.classList.remove("sel"));
  if (el) el.classList.add("sel");
  $("#selectedMedia").innerHTML = !m ? "ما ختاريتي حتى ميديا — غادي يتنشر غير النص."
    : m.type === "video" ? `<video src="${m.url}" muted></video>` : `<img src="${m.url}" alt="">`;
}

// ---- video
$("#videoBtn").addEventListener("click", (e) => busy(e.currentTarget, "كنصايب الفيديو...", async () => {
  const reference = state.selected?.type === "image" ? state.selected.url : null;
  const job = await postJSON("/api/video", { prompt: $("#videoPrompt").value, seconds: $("#videoSeconds").value, referenceImage: reference });
  $("#videoStatus").textContent = "الفيديو كيتصايب... هادشي ممكن ياخد بضع دقايق.";
  for (;;) {
    await new Promise((r) => setTimeout(r, 8000));
    const s = await api(`/api/video/${job.id}`);
    if (s.status === "failed") throw new Error(s.error || "الفيديو ما تصايبش");
    if (s.status === "completed") {
      $("#videoStatus").textContent = "✅ الفيديو واجد — كليكي عليه باش تختارو للنشر.";
      const tile = document.createElement("div");
      tile.className = "media"; tile.style.maxWidth = "320px";
      tile.innerHTML = `<video src="${s.url}" controls playsinline></video><a href="${s.url}" download onclick="event.stopPropagation()">⬇️ تحميل</a>`;
      tile.onclick = () => selectMedia({ url: s.url, type: "video" }, tile);
      $("#videoOut").prepend(tile);
      return;
    }
    $("#videoStatus").textContent = `الفيديو كيتصايب... ${s.progress != null ? Math.round(s.progress) + "%" : s.status}`;
  }
}));

// ---- publish
$("#publishBtn").addEventListener("click", (e) => busy(e.currentTarget, "كننشر...", async () => {
  if (!confirm("متأكد بغيتي تنشر هادشي فالباج ديالك؟")) return;
  const r = await postJSON("/api/publish", { message: $("#postText").value, mediaUrl: state.selected?.url, mediaType: state.selected?.type });
  $("#publishStatus").innerHTML = `<p class="v-winning">✅ تنشر بنجاح! (ID: ${esc(r.id)})</p>`;
}));
