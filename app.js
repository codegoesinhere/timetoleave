// app.js — adds "Listed as" column/filter and moves EA link into description

if (!Array.isArray(window.agreements)) window.agreements = [];

const els = {
  search: document.getElementById('search'),
  clearSearch: document.getElementById('clearSearch'),
  shutdownFilter: document.getElementById('shutdownFilter'),
  earlyFilter: document.getElementById('earlyFilter'),
  listedAsFilter: document.getElementById('listedAsFilter'),
  entityFilter: document.getElementById('entityFilter'),
  portfolioFilter: document.getElementById('portfolioFilter'),
  sortOrder: document.getElementById('sortOrder'),
  exportCsv: document.getElementById('exportCsv'),
  toggleAll: document.getElementById('toggleAll'),
  tbody: document.querySelector('#eaTable tbody'),
  countHas: document.getElementById('countHas'),
  countTotal: document.getElementById('countTotal'),
  countEarly: document.getElementById('countEarly'),
  countTotalB: document.getElementById('countTotalB'),
  backToTop: document.getElementById('backToTop')
};

const ENTITY_LABEL = { ncce: "NCCE", cce: "CCE", company: "Company" };
function entityLongLabel(code){
  switch (code) {
    case "ncce": return "Non‑corporate Commonwealth entity (NCCE)";
    case "cce": return "Corporate Commonwealth entity (CCE)";
    case "company": return "Commonwealth company";
    default: return "";
  }
}

// Shutdown
function isExplicitNo(clauses){
  if (!clauses) return false;
  const s = clauses.toLowerCase();
  return ["no", "no shutdown","no closedown","no christmas shutdown","no christmas closedown","not closed","does not close","no annual shutdown"].some(k => s.includes(k));
}
function shutdownStatus(a){
  if (isExplicitNo(a.clauses)) return "no";
  const hasText = !!(a.clauses && a.clauses.trim());
  const hasPage = typeof a.pageStart === "number" && !Number.isNaN(a.pageStart);
  return (hasText || hasPage) ? "yes" : "unknown";
}
function hasShutdown(a){ return shutdownStatus(a) === "yes"; }
function shutdownBadge(a){
  const s = shutdownStatus(a);
  if (s === "yes") return '<span class="badge yes">Yes</span>';
  if (s === "no")  return '<span class="badge no">No</span>';
  return '<span class="badge unknown">Unknown</span>';
}


// === Deep-link helpers ===
function slugify(s){
  return (s||"").toString().normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").toLowerCase();
}
function anchorFor(a){
  return `entry-${slugify(a.portfolio)}-${slugify(a.agency)}`;
}
function focusByAnchor(anchor, {relaxFilters=true} = {}){
  let row = document.getElementById(anchor);
  if (!row && relaxFilters) {
    if (els.search) els.search.value = "";
    for (const sel of [els.shutdownFilter, els.entityFilter, els.portfolioFilter, els.earlyFilter, els.listedAsFilter]) {
      if (sel) sel.value = "all";
    }
    render();
    row = document.getElementById(anchor);
  }
  if (!row) return;
  const btn = row.querySelector("button.expander");
  if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
  const headerH = document.querySelector("#eaTable thead")?.offsetHeight || 0;
  const y = row.getBoundingClientRect().top + window.scrollY - (headerH + 12);
  window.scrollTo({ top: y, behavior: "smooth" });
}
function applyDeepLinkFromHash(){
  const hash = (location.hash || "").slice(1);
  if (!hash) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  focusByAnchor(hash, {relaxFilters:true});
}
// Early Close
function earlyCloseRaw(a){ return ((a.earlyClose ?? "") + "").trim(); }
function isEarlyNoText(text){
  const s = (text ?? "").toString().trim().toLowerCase();
  if (!s) return true;
  return new Set(["no","none","n/a","n.a.","n.a","na","nil","not applicable","not stated","no early close","no early closure","-","—","–"]).has(s);
}
function earlyCloseYes(a){ return !isEarlyNoText(earlyCloseRaw(a)); }
function earlyCloseNode(a){
  const span = document.createElement("span");
  const raw = earlyCloseRaw(a);
  if (earlyCloseYes(a)) { span.className = "badge yes"; span.textContent = "Yes, " + raw; }
  else { span.className = "badge no"; span.textContent = "No"; }
  return span;
}

// Sorting
function cmp(a,b){ return a.localeCompare(b, undefined, {sensitivity:"base"}); }
function compareAZ(a,b){ return cmp(a.agency,b.agency); }
function pgpaGroupIndex(a){ const isDept=a.entityType==="ncce"&&a.agency.toLowerCase().includes("department"); if(isDept)return 0; if(a.entityType==="ncce")return 1; if(a.entityType==="cce")return 2; if(a.entityType==="company")return 3; return 4; }
function isParliamentaryPortfolio(name){
  const norm = (name || "").toString().trim().toLowerCase();
  return norm === "parliamentary departments (not a portfolio)";
}
function comparePGPA(a,b){
  // 1) Push Parliamentary Departments (not a portfolio) to the bottom
  const aParl = isParliamentaryPortfolio(a.portfolio);
  const bParl = isParliamentaryPortfolio(b.portfolio);
  if (aParl !== bParl) return aParl ? 1 : -1;

  // 2) If both are in the special portfolio, sort A–Z by agency only
  if (aParl && bParl) {
    return cmp(a.agency, b.agency);
  }

  // 3) Otherwise: Portfolio A–Z, then PGPA group ordering, then Agency A–Z
  const p = cmp(a.portfolio, b.portfolio);
  if (p !== 0) return p;
  const g = pgpaGroupIndex(a) - pgpaGroupIndex(b);
  if (g !== 0) return g;
  return cmp(a.agency, b.agency);
}
function sortAgreements(arr){ const m=els.sortOrder?.value||"az"; arr=arr.slice(); return m==="pgpa"?arr.sort(comparePGPA):arr.sort(compareAZ); }

// Filters helpers
function uniquePortfolios(){ return Array.from(new Set((window.agreements||[]).map(a=>a.portfolio).filter(Boolean))).sort((a,b)=>a.localeCompare(b)); }
function uniqueListedAs(){ return Array.from(new Set((window.agreements||[]).map(a=>(a.eaHeading||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)); }
function populatePortfolioFilter(){ const s=els.portfolioFilter; if(!s) return; s.querySelectorAll('option:not([value="all"])').forEach(o=>o.remove()); for(const p of uniquePortfolios()){ const o=document.createElement("option"); o.value=p; o.textContent=p; s.appendChild(o);} }
function populateListedAsFilter(){ const s=els.listedAsFilter; if(!s) return; s.querySelectorAll('option:not([value="all"])').forEach(o=>o.remove()); for(const v of uniqueListedAs()){ const o=document.createElement("option"); o.value=v; o.textContent=v; s.appendChild(o);} }
function anyCollapsed(){ return Array.from(els.tbody.querySelectorAll("tr.desc-row")).some(r=>r.hidden); }
function setToggleAllLabel(){ const collapsed=anyCollapsed(); if(els.toggleAll){ els.toggleAll.textContent=collapsed?"Expand all details":"Collapse all details"; els.toggleAll.setAttribute("aria-expanded", String(!collapsed)); } }

function ensureTooltipInView(tip){
  tip.classList.remove("top");
  const wasHidden=tip.hasAttribute("hidden");
  if(wasHidden) tip.removeAttribute("hidden");
  const rect=tip.getBoundingClientRect();
  if(rect.bottom>(document.documentElement.clientHeight-8)) tip.classList.add("top");
  if(wasHidden) tip.setAttribute("hidden","");
}

function render(){
  const data=window.agreements||[];
  const q=(els.search?.value||"").trim().toLowerCase();
  const shutFilter=els.shutdownFilter?.value||"all";
  const entityFilter=els.entityFilter?.value||"all";
  const portfolioFilter=els.portfolioFilter?.value||"all";
  const earlyFilter=els.earlyFilter?.value||"all";
  const listedAsSel=els.listedAsFilter?.value||"all";

  const filtered=data.filter(a=>{
    const hay=[a.portfolio,a.agency,a.name,(a.eaHeading||"")].join(" ").toLowerCase();
    const textMatch=!q||hay.includes(q);

    let statusMatch=true; if(shutFilter!=="all") statusMatch=shutdownStatus(a)===shutFilter;
    let entityMatch=true; if(entityFilter!=="all") entityMatch=a.entityType===entityFilter;
    let portfolioMatch=true; if(portfolioFilter!=="all") portfolioMatch=a.portfolio===portfolioFilter;
    let earlyMatch=true; if(earlyFilter!=="all") earlyMatch=earlyFilter==="yes"?earlyCloseYes(a):!earlyCloseYes(a);
    let listedAsMatch=true; if(listedAsSel!=="all") listedAsMatch=(a.eaHeading||"")===listedAsSel;

    return textMatch&&statusMatch&&entityMatch&&portfolioMatch&&earlyMatch&&listedAsMatch;
  });

  const sorted=sortAgreements(filtered);

  const total=data.length;
  const yesCount=data.reduce((acc,a)=>acc+(hasShutdown(a)?1:0),0);
  const earlyCount=data.reduce((acc,a)=>acc+(earlyCloseYes(a)?1:0),0);
  if(els.countHas) els.countHas.textContent=String(yesCount);
  if(els.countTotal) els.countTotal.textContent=String(total);
  if(els.countEarly) els.countEarly.textContent=String(earlyCount);
  if(els.countTotalB) els.countTotalB.textContent=String(total);

  els.tbody.innerHTML="";
  const thCount=document.querySelector("#eaTable thead tr").children.length;
  let rowIndex=0;
  for(const a of sorted){
    const tr=document.createElement("tr");

    const anchor = anchorFor(a);
    tr.id = anchor;
    const tdPortfolio=document.createElement("td"); tdPortfolio.textContent=a.portfolio;

    const tdAgency=document.createElement("td"); tdAgency.append(document.createTextNode(a.agency+" ")); const webLink=link(a.website,"(website)"); tdAgency.appendChild(webLink);

    const tdEntity=document.createElement("td");
    const wrap=document.createElement("span"); wrap.className="entity-cell";
    const code=document.createElement("span"); code.className="etag"; code.textContent=ENTITY_LABEL[a.entityType]||"";
    const qm=document.createElement("button"); qm.className="qmark"; qm.type="button"; qm.setAttribute("aria-label","Entity type information");
    const tip=document.createElement("div"); tip.className="tooltip"; tip.setAttribute("role","tooltip"); const tipId=`tip-${rowIndex}`; tip.id=tipId; tip.hidden=true; tip.innerHTML='<div class="tip"></div>'+entityLongLabel(a.entityType); qm.setAttribute("aria-describedby",tipId);
    function showTip(){ ensureTooltipInView(tip); tip.hidden=false; } function hideTip(){ tip.hidden=true; }
    qm.addEventListener("focus",showTip); qm.addEventListener("blur",hideTip); qm.addEventListener("mouseenter",showTip); qm.addEventListener("mouseleave",hideTip);
    qm.addEventListener("keydown",(e)=>{ if(e.key==="Escape"||e.key==="Esc"){ hideTip(); qm.blur(); } if(e.key==="Enter"||e.key===" "){ e.preventDefault(); tip.hidden?showTip():hideTip(); }});
    wrap.append(code,qm,tip); tdEntity.appendChild(wrap);

    const tdListed=document.createElement("td"); tdListed.textContent=(a.eaHeading||"");

    const tdClauses=document.createElement("td"); tdClauses.textContent=a.clauses||"";
    const tdPage=document.createElement("td"); tdPage.textContent=(typeof a.pageStart==="number"&&!Number.isNaN(a.pageStart))?String(a.pageStart):"";
    const tdBadge=document.createElement("td"); tdBadge.innerHTML=shutdownBadge(a);
    const tdEarly=document.createElement("td"); tdEarly.appendChild(earlyCloseNode(a));

    const tdExp=document.createElement("td"); const btn=document.createElement("button"); btn.className="expander"; btn.type="button"; btn.setAttribute("aria-expanded","false"); const descId=`desc-${rowIndex++}`; btn.setAttribute("aria-controls",descId); btn.setAttribute("aria-label","Toggle description"); btn.textContent="▶"; tdExp.appendChild(btn);
    const trDesc=document.createElement("tr"); trDesc.className="desc-row"; trDesc.id=descId; trDesc.hidden=true; const tdDesc=document.createElement("td"); tdDesc.colSpan=thCount;
    const eaLinkHtml=a.name?`<p class="ea-head">Access the <a href="${a.eaUrl||'#'}" target="_blank" rel="noopener noreferrer">${a.name}</a> (opens in new tab/window)</p>`:"";
    tdDesc.innerHTML = `${(a.clauses && a.clauses.trim()) ? `<p><strong>Clause/s:</strong> ${a.clauses}</p>` : `<p><strong>Clause/s:</strong> —</p>`}
${(typeof a.pageStart === 'number' && !Number.isNaN(a.pageStart)) ? `<p><strong>PDF page:</strong> ${a.pageStart}</p>` : `<p><strong>Starting on PDF page</strong> —</p>`}
${a.name ? `<p>Access the <a href='${a.eaUrl || '#'}' target='_blank' rel='noopener noreferrer'>${a.name}</a></p><hr class='zig'><hr class='zag'>` : ''}
${a.description + "<hr class='zig'><hr class='zag'>" || "<p class='muted'>No description provided.</p><hr class='zig'><hr class='zag'>"}`;
    
    (function(){
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-link";
      copyBtn.setAttribute("aria-label", "Copy direct link to this entry");
      copyBtn.textContent = "Copy link to this entry";
      copyBtn.addEventListener("click", async () => {
        const url = location.href.replace(/#.*$/, '') + '#' + anchor;
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = "Copied!";
          setTimeout(()=>copyBtn.textContent="Copy link to this entry", 1200);
        } catch(e) {
          const ta = document.createElement("textarea");
          ta.value = url; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
          copyBtn.textContent = "Copied!";
          setTimeout(()=>copyBtn.textContent="Copy link to this entry", 1200);
        }
        history.replaceState(null, "", `#${anchor}`);
      });
      tdDesc.prepend(copyBtn);
    })();
trDesc.appendChild(tdDesc);

    btn.addEventListener("click",()=>{ const expanded=btn.getAttribute("aria-expanded")==="true"; btn.setAttribute("aria-expanded",String(!expanded)); btn.textContent=expanded?"▶":"▼"; trDesc.hidden=!trDesc.hidden; setToggleAllLabel(); });

    tr.append(tdPortfolio,tdAgency,tdEntity,tdListed,tdBadge,tdEarly,tdExp);
    els.tbody.appendChild(tr); els.tbody.appendChild(trDesc);
  }
  setToggleAllLabel(); updateClearButton();
}

function link(href,text){ const a=document.createElement("a"); a.href=href||"#"; a.textContent=text||href||""; a.target="_blank"; a.rel="noopener noreferrer"; return a; }
function toggleAll(){ const makeExpanded=anyCollapsed(); els.tbody.querySelectorAll("button.expander").forEach(btn=>{ const id=btn.getAttribute("aria-controls"); const desc=document.getElementById(id); if(!desc) return; if(makeExpanded&&desc.hidden){ desc.hidden=false; btn.setAttribute("aria-expanded","true"); btn.textContent="▼"; } else if(!makeExpanded&&!desc.hidden){ desc.hidden=true; btn.setAttribute("aria-expanded","false"); btn.textContent="▶"; }}); setToggleAllLabel(); }

function exportCsv(){
  const data=window.agreements||[];
  const q=(els.search?.value||"").trim().toLowerCase();
  const shutFilter=els.shutdownFilter?.value||"all";
  const entityFilter=els.entityFilter?.value||"all";
  const portfolioFilter=els.portfolioFilter?.value||"all";
  const earlyFilter=els.earlyFilter?.value||"all";
  const listedAsSel=els.listedAsFilter?.value||"all";

  const filtered=data.filter(a=>{
    const hay=[a.portfolio,a.agency,a.name,(a.eaHeading||"")].join(" ").toLowerCase();
    const textMatch=!q||hay.includes(q);
    let statusMatch=true; if(shutFilter!=="all") statusMatch=shutdownStatus(a)===shutFilter;
    let entityMatch=true; if(entityFilter!=="all") entityMatch=a.entityType===entityFilter;
    let portfolioMatch=true; if(portfolioFilter!=="all") portfolioMatch=a.portfolio===portfolioFilter;
    let earlyMatch=true; if(earlyFilter!=="all") earlyMatch=earlyFilter==="yes"?earlyCloseYes(a):!earlyCloseYes(a);
    let listedAsMatch=true; if(listedAsSel!=="all") listedAsMatch=(a.eaHeading||"")===listedAsSel;
    return textMatch&&statusMatch&&entityMatch&&portfolioMatch&&earlyMatch&&listedAsMatch;
  });
  const sorted=sortAgreements(filtered);

  const header=["Portfolio","Entity Type","Agency","Listed as","Website","Enterprise Agreement URL","Name","Clause/s.","Page # Start","Shutdown?","Early Close","Description (HTML)"];
  const rows=sorted.map(a=>[
    a.portfolio, entityLongLabel(a.entityType), a.agency, (a.eaHeading||""), a.website, a.eaUrl, a.name, a.clauses||"",
    (typeof a.pageStart==="number"&&!Number.isNaN(a.pageStart))?String(a.pageStart):"",
    shutdownStatus(a).replace(/^./,c=>c.toUpperCase()), earlyCloseYes(a)?("Yes, "+earlyCloseRaw(a)):"No",
    a.description ? a.description.replace(/\s+/g," ").trim() : ""
  ]);
  const csv=[header,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="ea-closedown.csv"; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}
function csvCell(v){ const s=(v??"").toString(); return '"' + s.replaceAll('"','""') + '"'; }

function updateClearButton(){ if(!els.clearSearch) return; els.clearSearch.hidden=!(els.search && els.search.value); }
function onScroll(){ const scrolled=window.scrollY||document.documentElement.scrollTop; const shouldShow=scrolled>250; if(shouldShow){ els.backToTop.hidden=false; els.backToTop.classList.add("show"); } else { els.backToTop.classList.remove("show"); els.backToTop.hidden=true; } }

// Make a stable anchor from Portfolio+Agency
function slugify(s){
  return (s||"").toString().normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").toLowerCase();
}
function anchorFor(a){
  return `entry-${slugify(a.portfolio)}-${slugify(a.agency)}`;
}

// Expand + focus a row by its anchor id; optionally relax filters to find it
function focusByAnchor(anchor, {relaxFilters=true} = {}){
  let row = document.getElementById(anchor);
  if (!row && relaxFilters) {
    // clear filters so the item renders
    if (els.search) els.search.value = "";
    for (const sel of [els.shutdownFilter, els.entityFilter, els.portfolioFilter, els.earlyFilter, els.listedAsFilter]) {
      if (sel) sel.value = "all";
    }
    render();
    row = document.getElementById(anchor);
  }
  if (!row) return;

  // expand if needed
  const btn = row.querySelector("button.expander");
  if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();

  // scroll with sticky header offset
  const headerH = document.querySelector("#eaTable thead")?.offsetHeight || 0;
  const y = row.getBoundingClientRect().top + window.scrollY - (headerH + 12);
  window.scrollTo({ top: y, behavior: "smooth" });
}

function applyDeepLinkFromHash(){
  const hash = (location.hash || "").slice(1);
  if (!hash) return;
  // prevent the browser’s default jump; do our own smooth scroll
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  focusByAnchor(hash, {relaxFilters:true});
}

document.addEventListener("DOMContentLoaded",()=>{
  populatePortfolioFilter();
  populateListedAsFilter();
  els.search?.addEventListener("input",()=>{ updateClearButton(); render(); });
  els.clearSearch?.addEventListener("click",()=>{ els.search.value=""; updateClearButton(); els.search.focus(); render(); });
  els.shutdownFilter?.addEventListener("change",render);
  els.earlyFilter?.addEventListener("change",render);
  els.listedAsFilter?.addEventListener("change",render);
  els.entityFilter?.addEventListener("change",render);
  els.portfolioFilter?.addEventListener("change",render);
  els.sortOrder?.addEventListener("change",render);
  els.exportCsv?.addEventListener("click",exportCsv);
  els.toggleAll?.addEventListener("click",toggleAll);
  els.backToTop?.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
  window.addEventListener("scroll",onScroll,{passive:true});
  render(); onScroll(); 
  applyDeepLinkFromHash();
  window.addEventListener("hashchange", applyDeepLinkFromHash);

});
