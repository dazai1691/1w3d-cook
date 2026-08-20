const DAYS=["月曜日","火曜日","水曜日","木曜日","金曜日","土曜日","日曜日"];
const KEY="weeklyMenuRecipesV5";
let recipes=[],currentMenu=[],mode="3",ingredientCatalog=[],aliasMap=new Map();
let availableSelected=new Map(),recipeSelected=new Map();

async function loadJSON(path){
  const u=new URL(path,document.baseURI),r=await fetch(u.href,{cache:"no-store"});
  if(!r.ok) throw Error(`${path}を読み込めませんでした (${r.status})`);
  return r.json();
}
async function init(){
  try{
    ingredientCatalog=await loadJSON("./data/ingredients.json");
    buildAliasMap();
    const seed=await loadJSON("./data/recipes.json");
    const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem("weeklyMenuRecipesV4")||"null");
    recipes=saved&&Array.isArray(saved)&&saved.length?saved:seed;
    migrateRecipes();
    renderPicker("availablePicker",availableSelected,false);
    renderPicker("recipePicker",recipeSelected,true);
    renderRecipes(); make("3");
  }catch(e){
    console.error(e);
    document.querySelector("#menu").innerHTML=`<div class="empty">データを読み込めませんでした。<br>${esc(e.message)}<br><br>GitHubの data/recipes.json と data/ingredients.json を確認してください。</div>`;
  }
}
function buildAliasMap(){
  aliasMap.clear();
  ingredientCatalog.forEach(g=>g.items.forEach(it=>{
    [it.name,...(it.aliases||[])].forEach(a=>aliasMap.set(norm(a),it.name));
  }));
}
function canonical(s){return aliasMap.get(norm(s))||String(s).trim();}
function norm(s){return String(s||"").trim().toLowerCase().replace(/\s+/g,"");}
function iname(x){return typeof x==="string"?x:x.name;}
function iamt(x){return typeof x==="string"?"適量":(x.amount||"適量");}
function save(){localStorage.setItem(KEY,JSON.stringify(recipes));}
function migrateRecipes(){
  recipes=recipes.map(r=>({...r,ingredients:(r.ingredients||[]).map(x=>{
    if(typeof x==="string") return {name:canonical(x),amount:"適量"};
    return {...x,name:canonical(x.name)};
  })}));
}
function pair(a,b){
  const A=a.ingredients.map(x=>norm(canonical(iname(x)))),B=b.ingredients.map(x=>norm(canonical(iname(x))));
  return A.filter(x=>B.includes(x)).length;
}

function renderPicker(id,selected,isRecipe){
  const el=document.querySelector("#"+id);
  el.innerHTML=ingredientCatalog.map((g,gi)=>`
    <details class="ingredient-group" ${gi===0?"open":""}>
      <summary>${esc(g.category)} <span class="group-count">${g.items.length}</span></summary>
      <div class="ingredient-chips">
        ${g.items.map(it=>{
          const on=selected.has(it.name)?" selected":"";
          return `<button type="button" class="ingredient-chip${on}" data-ing="${attr(it.name)}">${esc(it.name)}</button>`;
        }).join("")}
      </div>
    </details>`).join("");
  el.querySelectorAll(".ingredient-chip").forEach(btn=>{
    btn.onclick=()=>{
      const name=btn.dataset.ing;
      if(selected.has(name)) selected.delete(name); else selected.set(name,{name,amount:"適量"});
      renderPicker(id,selected,isRecipe);
      if(isRecipe) renderRecipeSelected(); else renderAvailableSelected();
    };
  });
}
function renderAvailableSelected(){
  const el=document.querySelector("#availableSelected");
  document.querySelector("#availableCount").textContent=availableSelected.size;
  el.innerHTML=[...availableSelected.values()].map(v=>
    `<span class="selected-chip">${esc(v.name)}<button type="button" data-remove="${attr(v.name)}">×</button></span>`).join("");
  el.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
    availableSelected.delete(b.dataset.remove);renderAvailableSelected();renderPicker("availablePicker",availableSelected,false);
  });
}
function renderRecipeSelected(){
  const el=document.querySelector("#recipeSelected");
  el.innerHTML=[...recipeSelected.values()].map(v=>`
    <div class="recipe-ingredient-row">
      <span>${esc(v.name)}</span>
      <input data-amount="${attr(v.name)}" value="${esc(v.amount)}" placeholder="使用量（例：1/2個）">
      <button type="button" data-remove="${attr(v.name)}">×</button>
    </div>`).join("");
  el.querySelectorAll("[data-amount]").forEach(inp=>inp.oninput=()=>{
    recipeSelected.get(inp.dataset.amount).amount=inp.value;
  });
  el.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
    recipeSelected.delete(b.dataset.remove);renderRecipeSelected();renderPicker("recipePicker",recipeSelected,true);
  });
}
document.querySelector("#availableCustom").onkeydown=e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    const raw=e.target.value.trim(); if(!raw)return;
    raw.split(/[、,\/\n]+/).map(canonical).filter(Boolean).forEach(n=>availableSelected.set(n,{name:n,amount:"適量"}));
    e.target.value="";renderAvailableSelected();renderPicker("availablePicker",availableSelected,false);
  }
};
document.querySelector("#recipeCustom").onkeydown=e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    const raw=e.target.value.trim();if(!raw)return;
    raw.split(/[、,\/\n]+/).map(s=>s.trim()).filter(Boolean).forEach(n=>{
      n=canonical(n);if(!recipeSelected.has(n))recipeSelected.set(n,{name:n,amount:"適量"});
    });
    e.target.value="";renderRecipeSelected();renderPicker("recipePicker",recipeSelected,true);
  }
};

function make(m=mode){
  mode=m;
  if(!recipes.length)return empty("料理候補がありません。");
  let chosen=[];
  if(m==="3"){
    const av=[...availableSelected.keys()].map(norm);
    if(!av.length)return alert("買った食材を選択してください。");
    let scored=recipes.map(r=>{
      let n=r.ingredients.map(x=>norm(canonical(iname(x))));
      let hit=av.filter(a=>n.includes(a)).length;
      return{r,score:hit*15+Math.random()*5};
    }).sort((a,b)=>b.score-a.score);
    let pool=scored.slice(0,12).map(x=>x.r);
    while(chosen.length<Math.min(3,pool.length)){
      let opts=pool.filter(r=>!chosen.some(c=>c.id===r.id));
      let top=opts.map(r=>({r,score:r.ingredients.reduce((s,x)=>s+(av.includes(norm(canonical(iname(x))))?5:0),0)+Math.random()*3}))
        .sort((a,b)=>b.score-a.score).slice(0,5);
      chosen.push(top[Math.floor(Math.random()*top.length)].r);
    }
  }else{
    for(let i=0;i<7;i++){
      let pool=recipes.filter(r=>!chosen.some(c=>c.id===r.id));if(!pool.length)pool=recipes;
      let top=pool.map(r=>({r,score:chosen.reduce((s,c)=>s+pair(r,c)*4,0)+(chosen.at(-1)?.category===r.category?-1.5:0)+Math.random()*5}))
        .sort((a,b)=>b.score-a.score).slice(0,6);
      chosen.push(top[Math.floor(Math.random()*top.length)].r);
    }
  }
  currentMenu=chosen;renderMenu();renderShop();
}
function renderMenu(){
  document.querySelector("#menu").innerHTML=currentMenu.map((r,i)=>`
    <article class="day"><div class="day-name">${DAYS[i]||`${i+1}日目`}</div>
    <div class="dish">${esc(r.name)}</div>
    <div class="tags">${r.ingredients.map(x=>`<span class="tag">${esc(iname(x))} ${esc(iamt(x))}</span>`).join("")}</div>
    ${r.recipeUrl?`<p><a href="${attr(r.recipeUrl)}" target="_blank" rel="noopener">レシピを見る ↗</a></p>`:""}</article>`).join("");
}
function amount(s){
  let t=String(s).trim().replace("半分","1/2"),m=t.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*(.*)$/);
  if(!m)return null;
  let n=m[1].includes("/")?Number(m[1].split("/")[0])/Number(m[1].split("/")[1]):Number(m[1]);
  return{n,unit:m[2].trim()};
}
function renderShop(){
  let mp=new Map();
  currentMenu.forEach(r=>r.ingredients.forEach(x=>{
    let name=canonical(iname(x)),k=norm(name);
    if(!mp.has(k))mp.set(k,{name,a:[]});
    mp.get(k).a.push(iamt(x));
  }));
  document.querySelector("#shopping").innerHTML=[...mp.values()].map(v=>{
    let p=v.a.map(amount),ok=p.every(Boolean)&&p.every(x=>x.unit===p[0].unit);
    let total=ok?((Math.round(p.reduce((s,x)=>s+x.n,0)*100)/100)+(p[0].unit?" "+p[0].unit:"")):v.a.join(" ＋ ");
    return `<div class="shopping-item">□ ${esc(v.name)} <strong>${esc(total)}</strong><div class="detail">${v.a.map(esc).join(" ＋ ")}</div></div>`;
  }).join("")||'<div class="empty">献立を作ると表示されます。</div>';
}
function renderRecipes(){
  let q=norm(document.querySelector("#search").value);
  let a=recipes.filter(r=>norm(r.name).includes(q)||r.ingredients.some(x=>norm(canonical(iname(x))).includes(q)));
  document.querySelector("#recipes").innerHTML=a.length?a.map(r=>`
    <article class="recipe-card"><h3>${esc(r.name)}</h3>
    <div class="recipe-meta">材料：${r.ingredients.map(x=>`${esc(canonical(iname(x)))} ${esc(iamt(x))}`).join("、")}</div>
    ${r.recipeUrl?`<p><a href="${attr(r.recipeUrl)}" target="_blank">保存レシピ ↗</a></p>`:""}
    <button onclick="editR('${r.id}')">編集</button> ${r.userAdded?`<button class="danger" onclick="delR('${r.id}')">削除</button>`:""}</article>`).join("")
    :'<div class="empty">該当する料理がありません。</div>';
}
function editR(id){
  let r=recipes.find(x=>x.id===id);if(!r)return;
  let n=prompt("料理名",r.name);if(n===null)return;
  let i=prompt("食材｜使用量（「、」「/」または改行で区切り）",r.ingredients.map(x=>`${iname(x)}｜${iamt(x)}`).join("\n"));if(i===null)return;
  let u=prompt("レシピURL",r.recipeUrl||"");if(u===null)return;
  r.name=n.trim();r.ingredients=parseI(i);r.recipeUrl=u.trim();save();renderRecipes();make(mode);
}
function parseI(t){
  return t.split(/[、,\/\n]+/).map(l=>l.trim()).filter(Boolean).map(l=>{
    let p=l.split(/[｜|]/);
    if(p.length>1)return{name:canonical(p[0].trim()),amount:p.slice(1).join("｜").trim()||"適量"};
    let m=l.match(/^(.+?)[：:]\s*(.+)$/);if(m)return{name:canonical(m[1].trim()),amount:m[2].trim()};
    let a=l.match(/^(.+?)\s+(\d+(?:\.\d+)?(?:\/\d+)?(?:\s*[^\d]+.*)?)$/);
    if(a)return{name:canonical(a[1].trim()),amount:a[2].trim()};
    return{name:canonical(l),amount:"適量"};
  });
}
function delR(id){if(confirm("この料理を削除しますか？")){recipes=recipes.filter(r=>r.id!==id);save();renderRecipes();make(mode)}}
document.querySelector("#form").onsubmit=e=>{
  e.preventDefault();
  const n=document.querySelector("#name").value.trim();
  const i=[...recipeSelected.values()].map(v=>({name:v.name,amount:v.amount.trim()||"適量"}));
  if(!n||!i.length)return alert("料理名と食材を入力してください。");
  recipes.push({id:"user-"+Date.now(),name:n,ingredients:i,category:"main",recipeUrl:document.querySelector("#url").value.trim(),recipeMemo:document.querySelector("#memo").value.trim(),userAdded:true});
  save();e.target.reset();recipeSelected.clear();renderRecipeSelected();renderPicker("recipePicker",recipeSelected,true);renderRecipes();make(mode);alert("料理を登録しました！");
};
document.querySelector("#make3").onclick=()=>make("3");
document.querySelector("#make7").onclick=()=>make("7");
document.querySelector("#again").onclick=()=>make(mode);
document.querySelector("#shop").onclick=()=>{document.querySelector("#shopPanel").hidden=false;document.querySelector("#shopPanel").scrollIntoView({behavior:"smooth"})};
document.querySelector("#search").oninput=renderRecipes;
document.querySelector("#mode3").onclick=()=>{mode="3";document.querySelector("#mode3").classList.add("active");document.querySelector("#mode7").classList.remove("active");document.querySelector("#three").hidden=false;document.querySelector("#seven").hidden=true};
document.querySelector("#mode7").onclick=()=>{mode="7";document.querySelector("#mode7").classList.add("active");document.querySelector("#mode3").classList.remove("active");document.querySelector("#three").hidden=true;document.querySelector("#seven").hidden=false};
document.querySelector("#export").onclick=()=>{let b=new Blob([JSON.stringify(recipes,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="my-recipes.json";a.click()};
document.querySelector("#import").onchange=e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let d=JSON.parse(r.result);if(!Array.isArray(d))throw 0;recipes=d;migrateRecipes();save();renderRecipes();make(mode);alert("読み込みました！")}catch{alert("JSON形式が正しくありません")}};r.readAsText(f)};
document.querySelector("#reset").onclick=async()=>{if(!confirm("初期データに戻しますか？"))return;recipes=await loadJSON("./data/recipes.json");migrateRecipes();save();renderRecipes();make(mode)};
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attr(s){return esc(s).replace(/`/g,'&#96;')}
function empty(s){document.querySelector("#menu").innerHTML=`<div class="empty">${esc(s)}</div>`}
init();
