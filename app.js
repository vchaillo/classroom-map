import { downloadClassPdf } from "./export-pdf.js?v=layout-1";
import { connect, login, logout, persist } from "./firebase.js?v=appearance-1";
// Adjacent seats share an edge: immediate horizontal or vertical neighbours.
function generatePlacement(students, rows, columns, random=Math.random) {
  const width=Array.isArray(columns)?columns.reduce((a,b)=>a+b,0):columns*2,capacity=rows*width;
  const shuffle=items=>items.map(value=>({value,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.value);
  const front=students.filter(s=>s.frontRow);
  if(front.length>width)return {error:"Il y a plus d’élèves prioritaires que de places au premier rang."};
  const chosen=[...shuffle(front),...shuffle(students.filter(s=>!s.frontRow))].slice(0,capacity);
  const seats=Array(capacity).fill(null),byId=new Map(chosen.map(s=>[s.id,s]));
  const distance=(a,b)=>Math.hypot(Math.floor(a/width)-Math.floor(b/width),a%width-b%width);
  const neighbours=i=>[i%width?i-1:-1,i%width<width-1?i+1:-1,i-width,i+width].filter(j=>j>=0&&j<capacity);
  const valid=(student,i)=>!student.frontRow||i<width;
  const allowed=(student,i)=>valid(student,i)&&(!student.color||neighbours(i).every(j=>byId.get(seats[j])?.color!==student.color));
  const frequency=new Map();chosen.forEach(s=>{if(s.color)frequency.set(s.color,(frequency.get(s.color)||0)+1);});
  for(const [color,count] of frequency){
    if(count>Math.ceil(capacity/2)||front.filter(s=>s.color===color).length>Math.ceil(width/2))return {error:"Trop d’élèves de même couleur pour éviter les voisins directs avec cette disposition."};
  }
  const ordered=shuffle(chosen).sort((a,b)=>Number(!!b.frontRow)-Number(!!a.frontRow)||(frequency.get(b.color)||0)-(frequency.get(a.color)||0));
  let nodes=0;
  function search(depth) {
    if(depth===ordered.length)return true;
    if(++nodes>60000)return false;
    const student=ordered[depth];
    const candidates=shuffle(seats.map((id,i)=>i).filter(i=>!seats[i]&&allowed(student,i)));
    const separation=i=>{let closest=capacity;seats.forEach((id,j)=>{if(student.color&&byId.get(id)?.color===student.color)closest=Math.min(closest,distance(i,j));});return closest;};
    candidates.sort((a,b)=>separation(b)-separation(a));
    for(const i of candidates){seats[i]=student.id;if(search(depth+1))return true;seats[i]=null;if(nodes>60000)break;}
    return false;
  }
  if(!search(0))return {error:"Aucun placement respectant les contraintes n’a été trouvé. Ajoutez des places ou ajustez les couleurs et les priorités, puis réessayez."};
  // Improve separation while retaining both hard constraints.
  const score=()=>{let total=0;for(let i=0;i<capacity;i++){const color=byId.get(seats[i])?.color;if(!color)continue;for(let j=i+1;j<capacity;j++)if(byId.get(seats[j])?.color===color)total+=1/(distance(i,j)**2);}return total;};
  let best=score();
  for(let attempt=0;attempt<1200;attempt++){
    const a=Math.floor(random()*capacity),b=Math.floor(random()*capacity);if(a===b)continue;
    [seats[a],seats[b]]=[seats[b],seats[a]];
    const sa=byId.get(seats[a]),sb=byId.get(seats[b]);
    if((!sa||allowed(sa,a))&&(!sb||allowed(sb,b))){const next=score();if(next<=best){best=next;continue;}}
    [seats[a],seats[b]]=[seats[b],seats[a]];
  }
  return {seats,unplaced:students.length-chosen.length};
}
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const studentColors = [
    {id:"yellow",name:"Jaune",border:"#c89412",background:"#fff4c2"},
    {id:"orange",name:"Orange",border:"#dc7726",background:"#ffe7cf"},
    {id:"pink",name:"Rose",border:"#ce6392",background:"#ffe1ee"},
    {id:"red",name:"Rouge",border:"#d25858",background:"#ffe1e1"},
    {id:"purple",name:"Violet",border:"#9668c5",background:"#eee2ff"},
    {id:"blue",name:"Bleu",border:"#478ecb",background:"#deefff"},
    {id:"green",name:"Vert",border:"#479d76",background:"#ddf5e7"}
  ];
  const defaultColors=studentColors.map(c=>c.border);
  const systemTheme=matchMedia("(prefers-color-scheme: dark)");
  function normalizePreferences(value={}) {
    const hex=(color,fallback)=>typeof color==="string"&&/^#[0-9a-f]{6}$/i.test(color)?color:fallback;
    return {theme:["light","dark","system"].includes(value?.theme)?value.theme:"system",accent:hex(value?.accent,"#315fe8"),colors:defaultColors.map((color,i)=>hex(value?.colors?.[i],color))};
  }
  function applyAppearance() {
    const prefs=data.preferences,root=document.documentElement;
    root.dataset.theme=prefs.theme==="system"?(systemTheme.matches?"dark":"light"):prefs.theme;
    root.style.setProperty("--accent",prefs.accent);
    studentColors.forEach((color,i)=>{color.name="Groupe "+(i+1);color.border=prefs.colors[i];color.background="color-mix(in srgb, "+color.border+" 16%, var(--surface))";});
    $("themeMode").value=prefs.theme;$("accentColor").value=prefs.accent;
    defaultColors.forEach((color,i)=>{$("palette"+i).value=prefs.colors[i];});
  }
  function updateAppearance() {
    data.preferences=normalizePreferences({theme:$("themeMode").value,accent:$("accentColor").value,colors:defaultColors.map((_,i)=>$("palette"+i).value)});
    applyAppearance();save();render();if($("listDialog").open&&state)renderList();
  }
  $("themeMode").onchange=updateAppearance;$("accentColor").onchange=updateAppearance;
  defaultColors.forEach((_,i)=>{$("palette"+i).onchange=updateAppearance;});
  $("resetAppearance").onclick=()=>{data.preferences=normalizePreferences();applyAppearance();save();render();};
  systemTheme.addEventListener("change",()=>{if(data.preferences.theme==="system")applyAppearance();});
  function applyStudentColor(node, student) {
    const color=studentColors.find(c=>c.id===student.color);
    if(!color)return;
    node.classList.add("student-colored");
    node.style.setProperty("--student-color",color.border);
    node.style.setProperty("--student-background",color.background);
  }
  function colorPicker(student) {
    const picker=element("details","color-picker");
    const summary=element("summary","color-toggle");
    const current=studentColors.find(c=>c.id===student.color);
    summary.title="Couleur de "+student.name+" : "+(current?.name||"Aucune");
    summary.setAttribute("aria-label",summary.title);
    summary.style.background=current?.border||"#ffffff";
    if(!current)summary.append(element("span","","∅"));
    const choices=element("div","color-options");
    [null,...studentColors].forEach(color=>{
      const button=element("button","color-choice"+((color?.id||"")===(student.color||"")?" chosen":""),color?"":"∅");
      button.type="button";button.title=color?.name||"Aucune";
      button.setAttribute("aria-label",button.title);
      button.setAttribute("aria-pressed",String((color?.id||"")===(student.color||"")));
      button.style.background=color?.border||"#ffffff";
      button.onclick=()=>{student.color=color?.id||"";save();render();renderList();};
      choices.append(button);
    });
    picker.append(summary,choices);return picker;
  }
  let serial = 0;
  const makeId = () => Date.now().toString(36) + "-" + (++serial) + "-" + Math.random().toString(36).slice(2,8);
  function makeRoom(name="Salle 1") {
    return {id:makeId(),name,rows:5,columns:4,tableSizes:[2,2,2,2],seats:Array(40).fill(null)};
  }
  function makeClass(className) {
    const first=makeRoom();
    return {id:makeId(),className,students:[],rooms:[first],activeRoom:first.id};
  }
  function normalizeClass(saved) {
    if(!saved || !Array.isArray(saved.students))throw new Error("Invalid saved class");
    const studentIds=new Set();
    const students=saved.students.filter(s=>s && typeof s.id==="string" && typeof s.name==="string" && !studentIds.has(s.id) && (studentIds.add(s.id),true)).slice(0,200).map(s=>({...s,frontRow:s.frontRow===true,color:studentColors.some(c=>c.id===s.color)?s.color:""}));
    // Migrate the original single-room plan without changing its placement.
    const sources=Array.isArray(saved.rooms)&&saved.rooms.length?saved.rooms:[{id:"legacy-room",name:"Salle 1",rows:saved.rows,columns:saved.columns,seats:saved.seats}];
    const roomIds=new Set();
    const rooms=sources.map(r=>{
      if(!r || !Array.isArray(r.seats) || !Number.isInteger(r.rows) || r.rows<1 || r.rows>12 || !Number.isInteger(r.columns) || r.columns<1 || r.columns>8)throw new Error("Invalid saved room");
      const id=typeof r.id==="string"&&!roomIds.has(r.id)?r.id:makeId();roomIds.add(id);
      const tableSizes=Array.from({length:r.columns},(_,i)=>[1,2,3].includes(r.tableSizes?.[i])?r.tableSizes[i]:2);
      const seen=new Set();
      const seats=Array.from({length:r.rows*tableSizes.reduce((a,b)=>a+b,0)},(_,i)=>{const pupil=r.seats[i];if(!studentIds.has(pupil)||seen.has(pupil)||!students.some(s=>s.id===pupil))return null;seen.add(pupil);return pupil;});
      return {id,name:typeof r.name==="string"&&r.name.trim()?r.name.slice(0,60):"Salle",rows:r.rows,columns:r.columns,tableSizes,seats};
    });
    return {id:typeof saved.id==="string"?saved.id:makeId(),className:typeof saved.className==="string"&&saved.className.trim()?saved.className.slice(0,60):"Ma classe",students,rooms,activeRoom:rooms.some(r=>r.id===saved.activeRoom)?saved.activeRoom:rooms[0].id};
  }
  let currentUser=null;
  let data={classes:[],active:null,preferences:normalizePreferences()}, state=null, room=null, ready=false;
  let selected=null, editing=null, targetSeat=null, listMode="manage", returnToList=false, confirmation=null, toastTimer;
  const initials = name => name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
  const rowWidth = r => r.tableSizes.reduce((a,b)=>a+b,0);
  const tableOffset = (sizes,column) => sizes.slice(0,column).reduce((a,b)=>a+b,0);
  const positionText = index => "Rangée "+(Math.floor(index/(rowWidth(room)))+1)+" · place "+(index%(rowWidth(room))+1);
  function element(tag, className, text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function notify(message) {$("toast").textContent=message;$("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").hidden=true,3200);}
  function save() { if(ready) persist(data); }
  function confirmAction(title, description, action) {$("confirmTitle").textContent=title;$("confirmDescription").textContent=description;confirmation=action;$("confirmDialog").showModal();}
  function placeStudent(id,index) {if(!state.students.some(s=>s.id===id)||index<0||index>=room.seats.length)return;const previous=room.seats.indexOf(id), occupant=room.seats[index];if(previous>=0)room.seats[previous]=occupant;room.seats[index]=id;selected=null;save();render();}
  function openList(mode="manage",index=null) {listMode=mode;targetSeat=index;$("search").value="";renderList();$("listDialog").showModal();}
  function renderList() {
    const picker=listMode==="pick";
    $("listTitle").textContent=picker?"Choisir un élève":"Élèves de la classe";
    $("listDescription").textContent=picker?positionText(targetSeat)+". Seuls les élèves non placés apparaissent ici.":"Cliquez sur la pastille pour choisir une couleur personnelle. La main levée active la priorité au premier rang. Ces repères restent invisibles dans le PDF.";
    const available=state.students.filter(s=>!picker||!room.seats.includes(s.id)), query=$("search").value.trim().toLocaleLowerCase("fr"), filtered=available.filter(s=>s.name.toLocaleLowerCase("fr").includes(query));
    $("listCount").textContent=available.length+" élève"+(available.length>1?"s":"")+(picker?" à placer":" dans la classe");
    $("studentList").replaceChildren();
    if(!filtered.length)$("studentList").append(element("div","empty",query?"Aucun élève trouvé.":picker?"Tous les élèves sont déjà placés. Vous pouvez en ajouter.":"Votre liste est vide. Ajoutez vos premiers élèves."));
    filtered.forEach(student=>{
      const item=element(picker?"button":"div","student"+(picker?" pick":""));
      if(picker){item.type="button";item.onclick=()=>{const index=targetSeat;$("listDialog").close();placeStudent(student.id,index);};}
      const name=element("span","student-name",student.name), index=room.seats.indexOf(student.id);
      name.append(element("small","",index<0?"À placer":positionText(index)));
      const avatar=element("span","avatar",initials(student.name));applyStudentColor(avatar,student);
      item.append(avatar,name);
      if(picker)item.append(element("span","","＋"));
      else {
        item.append(colorPicker(student));
        const priority=element("button","front-row-toggle"+(student.frontRow?" enabled":""));
        priority.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6-6 6h-1c-2 0-3.5-1-4.5-2.5L4 13a1.5 1.5 0 0 1 2.5-1.5L8 14"/></svg>';
        priority.type="button";priority.title="Placer au premier rang lors de la répartition automatique";
        priority.setAttribute("aria-label","Premier rang pour "+student.name);priority.setAttribute("aria-pressed",String(!!student.frontRow));
        priority.onclick=()=>{student.frontRow=!student.frontRow;save();renderList();};item.append(priority);
        const edit=element("button","icon-btn","✎"), remove=element("button","icon-btn","×");
        edit.setAttribute("aria-label","Modifier "+student.name);edit.onclick=()=>openStudentDialog(student.id);
        remove.setAttribute("aria-label","Supprimer "+student.name);remove.onclick=()=>confirmAction("Supprimer cet élève ?","« "+student.name+" » sera retiré de la liste et du plan.",()=>{state.students=state.students.filter(s=>s.id!==student.id);state.rooms.forEach(r=>{r.seats=r.seats.map(id=>id===student.id?null:id);});if(selected===student.id)selected=null;save();render();renderList();});
        item.append(edit,remove);
      }
      $("studentList").append(item);
    });
  }
  function openStudentDialog(id=null) {editing=id;returnToList=$("listDialog").open;if(returnToList)$("listDialog").close();$("dialogTitle").textContent=id?"Modifier l’élève":"Ajouter des élèves";$("dialogDescription").textContent=id?"Modifiez le prénom ou le nom de cet élève.":"Ajoutez un ou plusieurs élèves, avec un nom par ligne.";$("names").value=id?state.students.find(s=>s.id===id).name:"";$("names").setCustomValidity("");$("studentDialog").showModal();$("names").focus();}
  function renderClassSelect() {
    $("classSelect").replaceChildren();
    data.classes.forEach(c=>{const option=element("option","",c.className);option.value=c.id;$("classSelect").append(option);});
    $("classSelect").value=data.active;
  }
  function switchClass(id) {if(state)finishRename();data.active=id;state=data.classes.find(c=>c.id===id);room=state?.rooms.find(r=>r.id===state.activeRoom)||null;selected=null;save();render();}
  function finishRename() {
    if(!state)return;
    state.className=$("className").value.trim().replace(/\s+/g," ").slice(0,60)||state.className||"Ma classe";
    $("className").value=state.className;save();renderClassSelect();
  }
  function renderClasses() {
    $("classList").replaceChildren();
    data.classes.forEach(c=>{
      const row=element("div","class-row"+(c.id===data.active?" current":""));
      const info=element("div","class-info");
      const name=element("input","class-row-name");name.value=c.className;name.maxLength=60;name.setAttribute("aria-label","Nom de "+c.className);
      let original=c.className;
      const commit=()=>{c.className=name.value.trim().replace(/\s+/g," ").slice(0,60)||c.className;name.value=c.className;original=c.className;save();render();};
      name.onblur=commit;name.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();name.blur();}if(e.key==="Escape"){name.value=original;name.blur();}};
      info.append(name,element("small","",c.students.length+" élèves · "+c.rooms.length+" salle"+(c.rooms.length>1?"s":"")+(c.id===data.active?" · Classe active":"")));
      const open=element("button","",c.id===data.active?"Ouverte":"Ouvrir");open.onclick=()=>{switchClass(c.id);$("classesDialog").close();};
      const copy=element("button","icon-btn","⧉");copy.setAttribute("aria-label","Dupliquer "+c.className);
      copy.onclick=()=>{const ids=new Map();const students=c.students.map(s=>{const id=makeId();ids.set(s.id,id);return{...s,id};});const rooms=c.rooms.map(r=>({...r,id:makeId(),seats:r.seats.map(id=>ids.get(id)||null)}));data.classes.push({...c,id:makeId(),className:(c.className+" — copie").slice(0,60),students,rooms,activeRoom:rooms[c.rooms.findIndex(r=>r.id===c.activeRoom)]?.id||rooms[0].id});save();render();renderClasses();notify("Classe dupliquée.");};
      const remove=element("button","icon-btn","×");remove.setAttribute("aria-label","Supprimer "+c.className);remove.disabled=false;
      remove.onclick=()=>confirmAction("Supprimer "+c.className+" ?","La classe, ses élèves et son placement seront supprimés.",()=>{data.classes=data.classes.filter(x=>x.id!==c.id);if(data.active===c.id){data.active=data.classes[0]?.id||null;state=data.classes[0]||null;room=state?.rooms.find(r=>r.id===state.activeRoom)||null;}selected=null;save();render();renderClasses();});
      row.append(info,open,copy,remove);$("classList").append(row);
    });
  }
  function renderRoomSelect() {
    $("roomSelect").replaceChildren();
    state.rooms.forEach(r=>{const option=element("option","",r.name);option.value=r.id;$("roomSelect").append(option);});
    $("roomSelect").value=state.activeRoom;
  }
  function switchRoom(id) {
    const next=state.rooms.find(r=>r.id===id);if(!next)return;
    state.activeRoom=id;room=next;selected=null;save();render();
  }
  function renderRooms() {
    $("roomsTitle").textContent="Salles de "+state.className;
    $("roomList").replaceChildren();
    state.rooms.forEach(r=>{
      const row=element("div","class-row"+(r.id===state.activeRoom?" current":""));
      const info=element("div","class-info"),name=element("input","class-row-name");
      name.value=r.name;name.maxLength=60;name.setAttribute("aria-label","Nom de la salle "+r.name);
      let original=r.name;
      name.onblur=()=>{r.name=name.value.trim().replace(/\s+/g," ").slice(0,60)||r.name;name.value=r.name;original=r.name;save();render();};
      name.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();name.blur();}if(e.key==="Escape"){name.value=original;name.blur();}};
      info.append(name,element("small","",r.rows+" rangées · "+r.columns+" tables par rangée · "+r.seats.filter(Boolean).length+" élèves placés"));
      const open=element("button","",r.id===state.activeRoom?"Ouverte":"Ouvrir");open.onclick=()=>{switchRoom(r.id);$("roomsDialog").close();};
      const copy=element("button","icon-btn","⧉");copy.setAttribute("aria-label","Dupliquer "+r.name);
      copy.onclick=()=>{state.rooms.push({...r,id:makeId(),name:(r.name+" — copie").slice(0,60),seats:[...r.seats]});save();render();renderRooms();notify("Salle dupliquée.");};
      const remove=element("button","icon-btn","×");remove.setAttribute("aria-label","Supprimer la salle "+r.name);remove.disabled=state.rooms.length===1;
      remove.onclick=()=>confirmAction("Supprimer "+r.name+" ?","Seuls cette salle et son placement seront supprimés. La liste des élèves sera conservée.",()=>{state.rooms=state.rooms.filter(x=>x.id!==r.id);if(state.activeRoom===r.id){state.activeRoom=state.rooms[0].id;room=state.rooms[0];}selected=null;save();render();renderRooms();});
      row.append(info,open,copy,remove);$("roomList").append(row);
    });
  }
  $("roomSelect").onchange=()=>switchRoom($("roomSelect").value);
  $("manageRooms").onclick=()=>{renderRooms();$("roomsDialog").showModal();};
  $("closeRooms").onclick=()=>$("roomsDialog").close();
  $("newRoomForm").onsubmit=e=>{e.preventDefault();const name=$("newRoomName").value.trim().replace(/\s+/g," ");if(!name){$("newRoomName").setCustomValidity("Saisissez le nom de la salle.");$("newRoomName").reportValidity();return;}const created=makeRoom(name.slice(0,60));state.rooms.push(created);switchRoom(created.id);$("newRoomName").value="";$("roomsDialog").close();};
  $("newRoomName").oninput=()=>$("newRoomName").setCustomValidity("");
  function renderAvatar(container,user) {
    container.replaceChildren();
    const fallback=element("span","avatar-initials",initials(user?.displayName||user?.email||"Professeur"));container.append(fallback);
    if(user?.photoURL){try{const url=new URL(user.photoURL);if(url.protocol!=="https:")return;const image=element("img");image.alt="";image.referrerPolicy="no-referrer";image.onload=()=>{fallback.hidden=true;};image.onerror=()=>image.remove();image.src=url.href;container.append(image);}catch{}}
  }
  function renderProfile() {
    const profile=location.hash.startsWith("#profile")&&!!currentUser;
    $("profilePanel").hidden=!profile;
    $("planPanel").hidden=profile||!ready||!state;
    $("emptyPanel").hidden=profile||!ready||!!state;
    $("profileName").textContent=currentUser?.displayName||"Professeur";renderAvatar($("profileAvatar"),currentUser);
    $("profileEmail").textContent=currentUser?.email||"Non renseignée";
    const created=currentUser?.metadata?.creationTime;
    $("profileCreated").textContent=created&&!Number.isNaN(Date.parse(created))?new Intl.DateTimeFormat("fr-FR",{dateStyle:"long"}).format(new Date(created)):"Non disponible";
    $("profileClasses").textContent=data.classes.length;
    $("profileRooms").textContent=data.classes.reduce((total,c)=>total+c.rooms.length,0);
    $("profileStudents").textContent=data.classes.reduce((total,c)=>total+c.students.length,0);
    $("profileSummary").replaceChildren();
    if(!ready&&currentUser){$("profileSummary").append(element("p","","Chargement de vos classes…"));return;}
    if(!data.classes.length)$("profileSummary").append(element("p","","Vous n’avez pas encore créé de classe."));
    data.classes.forEach(c=>{
      const row=element("div","profile-class"),info=element("div");
      info.append(element("strong","",c.className),element("p","",c.students.length+" élèves · "+c.rooms.length+" salle"+(c.rooms.length>1?"s":"")));
      const open=element("a","profile-open","Ouvrir la classe");open.href="#plan";
      open.onclick=()=>switchClass(c.id);row.append(info,open);$("profileSummary").append(row);
    });
  }
  addEventListener("hashchange",renderProfile);
  function render() {
    renderClassSelect();
    $("planPanel").hidden=!ready||!state;
    $("emptyPanel").hidden=!ready||!!state;
    renderProfile();
    $("classSelect").disabled=!ready||!state;
    $("manageClasses").disabled=!ready;
    if(!state)return;
    renderRoomSelect();
    $("rows").value=room.rows;$("columns").value=room.columns;$("studentNumber").value=state.students.length;
    $("tableSizes").replaceChildren();
    room.tableSizes.forEach((size,column)=>{
      const label=element("label","","Table "+(column+1)),select=element("select");select.setAttribute("aria-label","Places par table, colonne "+(column+1));
      [1,2,3].forEach(n=>{const option=element("option","",n+" place"+(n>1?"s":""));option.value=n;select.append(option);});select.value=size;
      select.onchange=()=>{const sizes=[...room.tableSizes];sizes[column]=Number(select.value);resizeRoom(sizes);};label.append(select);$("tableSizes").append(label);
    });
    if(document.activeElement!==$("className"))$("className").value=state.className||"Ma classe";
    const placed=room.seats.filter(Boolean).length, shortage=Math.max(0,state.students.length-room.seats.length);
    $("stats").textContent=state.students.length+" élèves · "+placed+" placés · "+(state.students.length-placed)+" à placer";
    $("capacity").textContent=room.rows*room.columns+" tables · "+room.seats.length+" places";$("freeCount").textContent=(room.seats.length-placed)+" places libres";
    $("notice").hidden=!shortage;$("notice").textContent="Il manque "+shortage+" place"+(shortage>1?"s":"")+" pour accueillir toute la classe. Augmentez les rangées ou les tables par rangée.";
    $("shuffle").disabled=!state.students.length;$("clear").disabled=!placed;
    const pupil=state.students.find(s=>s.id===selected);$("selectionBar").hidden=!pupil;if(pupil)$("selectionText").textContent=pupil.name+" — cliquez sur un autre élève pour échanger leurs places.";
    $("room").style.minWidth=Math.max(340,rowWidth(room)*88+50)+"px";$("desks").style.gridTemplateColumns=room.tableSizes.map(n=>"minmax(0,"+n+"fr)").join(" ");$("desks").replaceChildren();
    for(let table=0;table<room.rows*room.columns;table++){
      const column=table%room.columns,count=room.tableSizes[column],desk=element("div","desk");desk.style.gridTemplateColumns="repeat("+count+",minmax(0,1fr))";
      for(let side=0;side<count;side++){
        const index=Math.floor(table/room.columns)*rowWidth(room)+tableOffset(room.tableSizes,column)+side, student=state.students.find(s=>s.id===room.seats[index]), seat=element("button","seat"+(student?" occupied":"")+(student&&selected===student.id?" active":""));
        seat.type="button";seat.setAttribute("aria-label",positionText(index)+(student?", "+student.name:", choisir un élève"));seat.append(element("span","seat-number",index%(rowWidth(room))+1));
        if(student){applyStudentColor(seat,student);seat.append(element("span","initial",initials(student.name)),element("span","seat-name",student.name));seat.draggable=true;seat.ondragstart=e=>{e.dataTransfer.setData("text/plain",student.id);e.dataTransfer.effectAllowed="move";};seat.ondragend=()=>document.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"));}
        else seat.append(element("span","plus","＋"),element("span","empty-label","Choisir un élève"));
        seat.onclick=()=>{if(!student){selected=null;render();openList("pick",index);}else if(selected&&selected!==student.id)placeStudent(selected,index);else{selected=selected===student.id?null:student.id;render();}};
        seat.ondragover=e=>{e.preventDefault();seat.classList.add("drag-over");};seat.ondragleave=()=>seat.classList.remove("drag-over");seat.ondrop=e=>{e.preventDefault();seat.classList.remove("drag-over");const id=e.dataTransfer.getData("text/plain");if(id)placeStudent(id,index);};desk.append(seat);
      }
      for(let side=0;side<count;side++){const chair=element("span","chair");chair.style.left=((side+.25)/count*100)+"%";chair.style.width=(50/count)+"%";chair.setAttribute("aria-hidden","true");desk.append(chair);}$("desks").append(desk);
    }
  }
  // Keep pupils at the same row, table and seat when the room dimensions change.
  function resizeRoom(sizes) {
    if(!$("rows").checkValidity()||!$("columns").checkValidity()){$("rows").reportValidity();$("columns").reportValidity();render();return;}
    const rows=Number($("rows").value), columns=Number($("columns").value);
    const tableSizes=Array.from({length:columns},(_,i)=>Array.isArray(sizes)?sizes[i]||2:room.tableSizes[i]||2),width=tableSizes.reduce((a,b)=>a+b,0),nextSeats=Array(rows*width).fill(null);let displaced=0;
    for(let row=0;row<room.rows;row++)for(let table=0;table<room.columns;table++)for(let side=0;side<room.tableSizes[table];side++){
      const id=room.seats[row*rowWidth(room)+tableOffset(room.tableSizes,table)+side];if(!id)continue;
      if(row<rows&&table<columns&&side<tableSizes[table])nextSeats[row*width+tableOffset(tableSizes,table)+side]=id;else displaced++;
    }
    const apply=()=>{room.rows=rows;room.columns=columns;room.tableSizes=tableSizes;room.seats=nextSeats;selected=null;save();render();};
    if(displaced){render();confirmAction("Réduire le nombre de tables ?",displaced+" élève"+(displaced>1?"s retourneront":" retournera")+" dans la liste des élèves non placés. Leurs noms seront conservés.",apply);}else apply();
  }
  function resizeStudents() {
    const field=$("studentNumber");if(!field.checkValidity()){field.reportValidity();render();return;}
    const count=Number(field.value);if(count===state.students.length)return;
    if(count>state.students.length){let number=1;const used=new Set(state.students.map(s=>s.name));while(state.students.length<count){while(used.has("Élève "+number))number++;const name="Élève "+number++;used.add(name);state.students.push({id:makeId(),name});}save();render();notify("Élèves ajoutés. Modifiez leurs noms dans « Gérer les élèves ».");return;}
    const removed=state.students.slice(count);render();
    confirmAction("Réduire la liste à "+count+" élèves ?","Les "+removed.length+" derniers élèves seront supprimés : "+removed.slice(0,4).map(s=>s.name).join(", ")+(removed.length>4?", …":".")+" Vous pouvez aussi les supprimer individuellement.",()=>{const ids=new Set(removed.map(s=>s.id));state.students=state.students.slice(0,count);state.rooms.forEach(r=>{r.seats=r.seats.map(id=>ids.has(id)?null:id);});if(ids.has(selected))selected=null;save();render();});
  }
  $("exportPdf").onclick=()=>{if(!state)return;finishRename();try{downloadClassPdf({...room,students:state.students,className:state.className},data.preferences.accent);}catch(error){notify("Impossible de générer le PDF : "+error.message);}};
  $("rows").onchange=resizeRoom;$("columns").onchange=resizeRoom;$("studentNumber").onchange=resizeStudents;
  $("manageStudents").onclick=()=>openList();$("closeList").onclick=()=>$("listDialog").close();$("addButton").onclick=()=>openStudentDialog();$("search").oninput=renderList;
  $("closeStudentDialog").onclick=()=>$("studentDialog").close();
  $("studentDialog").addEventListener("close",()=>{if(returnToList){returnToList=false;renderList();$("listDialog").showModal();}});
  let originalName="";
  $("className").onfocus=()=>{originalName=state.className;};
  $("className").onblur=finishRename;
  $("className").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("className").blur();}if(e.key==="Escape"){$("className").value=originalName;$("className").blur();}};
  $("renameClass").onclick=()=>{$("className").focus();$("className").select();};
  $("classSelect").onchange=()=>switchClass($("classSelect").value);
  $("manageClasses").onclick=()=>{renderClasses();$("classesDialog").showModal();};
  $("closeClasses").onclick=()=>$("classesDialog").close();
  $("newClassForm").onsubmit=e=>{e.preventDefault();const name=$("newClassName").value.trim().replace(/\s+/g," ");if(!name){$("newClassName").setCustomValidity("Saisissez le nom de la classe.");$("newClassName").reportValidity();return;}const created=makeClass(name.slice(0,60),0);data.classes.push(created);switchClass(created.id);$("newClassName").value="";$("classesDialog").close();};
  $("newClassName").oninput=()=>$("newClassName").setCustomValidity("");
  $("studentForm").onsubmit=e=>{e.preventDefault();const names=$("names").value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);if(!names.length){$("names").setCustomValidity("Saisissez au moins un nom.");$("names").reportValidity();return;}if(!editing&&state.students.length+names.length>200){$("names").setCustomValidity("La classe peut contenir au maximum 200 élèves.");$("names").reportValidity();return;}if(editing){const student=state.students.find(s=>s.id===editing);if(student)student.name=names.join(" ");}else state.students.push(...names.map(name=>({id:makeId(),name})));save();render();$("studentDialog").close();};
  $("names").oninput=()=>$("names").setCustomValidity("");$("cancelSelection").onclick=()=>{selected=null;render();};$("unplace").onclick=()=>{room.seats=room.seats.map(id=>id===selected?null:id);selected=null;save();render();};
  $("shuffle").onclick=()=>{const apply=()=>{const result=generatePlacement(state.students,room.rows,room.tableSizes);if(result.error){confirmAction("Placement non modifié",result.error,()=>{});return;}room.seats=result.seats;selected=null;save();render();notify(result.unplaced?result.unplaced+" élèves restent à placer : il manque des places.":"Placement effectué : couleurs séparées et premier rang respecté.");};if(room.seats.some(Boolean))confirmAction("Redistribuer les places ?","Les priorités de premier rang et la séparation des couleurs seront respectées. Le plan actuel sera conservé si aucun placement n’est trouvé.",apply);else apply();};
  $("clear").onclick=()=>confirmAction("Libérer toutes les places ?","Les élèves resteront dans votre liste.",()=>{room.seats.fill(null);selected=null;save();render();});
  $("cancelConfirm").onclick=()=>{confirmation=null;$("confirmDialog").close();};$("acceptConfirm").onclick=()=>{const action=confirmation;confirmation=null;$("confirmDialog").close();if(action)action();};$("confirmDialog").addEventListener("cancel",()=>confirmation=null);
  $("createFirstClass").onclick=()=>{$("classesDialog").showModal();renderClasses();$("newClassName").focus();};
  $("loginButton").onclick=async()=>{
    $("loginButton").disabled=true;
    try{await login($("trustedDevice").checked);}catch(error){$("authMessage").textContent="Connexion impossible : "+error.message;}
    finally{$("loginButton").disabled=false;}
  };
  $("logoutButton").onclick=async()=>{try{await logout();}catch(error){notify(error.message);}};
  $("trustedDevice").checked=connect(remote=>{
    if(!remote){
      ready=false;data={classes:[],active:null,preferences:normalizePreferences()};state=null;room=null;selected=null;returnToList=false;applyAppearance();
      document.querySelectorAll("dialog[open]").forEach(d=>d.close());
      render();return;
    }
    try{
      const classes=remote.classes.map(normalizeClass);
      const active=remote.active||data.active;
      data={classes,active:classes.some(c=>c.id===active)?active:classes[0]?.id||null,preferences:normalizePreferences(remote.preferences)};
      applyAppearance();
      state=classes.find(c=>c.id===data.active)||null;
      room=state?.rooms.find(r=>r.id===state.activeRoom)||null;
      if(!state?.students.some(s=>s.id===selected))selected=null;
      ready=true;render();
      if($("classesDialog").open)renderClasses();
      if($("roomsDialog").open&&state)renderRooms();
      if($("listDialog").open&&state)renderList();
    }catch(error){$("authMessage").textContent="Impossible de charger les classes : "+error.message;}
  },status=>{
    currentUser=status.user||null;
    renderProfile();
    $("authPanel").hidden=!!status.user;
    $("accountControls").hidden=!status.user;
    $("classControls").hidden=!status.user;
    $("accountName").replaceChildren();const avatar=element("span","account-avatar");renderAvatar(avatar,status.user);$("accountName").append(avatar,element("span","",status.user?.displayName||status.user?.email||""));
    $("logoutButton").disabled=status.pending;
    const text=status.error?"Erreur de synchronisation : "+status.error.message:status.offline?(status.pending?"Hors ligne · modifications en attente":"Hors ligne · données en cache"):status.pending?"Synchronisation en cours…":status.fromCache?"Données en cache · connexion au serveur…":ready?"Données synchronisées":"Chargement des classes…";
    $("syncStatus").hidden=!status.user;$("syncStatus").textContent=text;$("saveStatus").textContent=text;
    if(status.error){$("authMessage").textContent=text;notify(text);}
  });
  // Require both ends of the pointer gesture to be outside the dialog.
  document.querySelectorAll("dialog").forEach(dialog=>{
    let outside=false;
    const isOutside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
    dialog.addEventListener("pointerdown",e=>{outside=e.target===dialog&&isOutside(e);});
    dialog.addEventListener("click",e=>{if(outside&&e.target===dialog&&isOutside(e)){if(dialog.id==="studentDialog")returnToList=false;dialog.close();}outside=false;});
    dialog.addEventListener("cancel",()=>{if(dialog.id==="studentDialog")returnToList=false;});
    dialog.addEventListener("close",()=>{if(dialog.id==="confirmDialog")confirmation=null;});
  });
  applyAppearance();
  render();
})();
