import { connect, login, logout, persist } from "./firebase.js";
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let serial = 0;
  const makeId = () => Date.now().toString(36) + "-" + (++serial) + "-" + Math.random().toString(36).slice(2,8);
  function makeClass(className) {
    return {id:makeId(),className,rows:5,columns:4,students:[],seats:Array(40).fill(null)};
  }
  function normalizeClass(saved) {
    if(!saved || !Array.isArray(saved.students) || !Array.isArray(saved.seats) || !Number.isInteger(saved.rows) || saved.rows<1 || saved.rows>12 || !Number.isInteger(saved.columns) || saved.columns<1 || saved.columns>8) throw new Error("Invalid saved class");
    const studentIds=new Set();
    const students=saved.students.filter(s=>s && typeof s.id==="string" && typeof s.name==="string" && !studentIds.has(s.id) && (studentIds.add(s.id),true)).slice(0,200);
    const seen=new Set();
    const seats=Array.from({length:saved.rows*saved.columns*2},(_,i)=>{const id=saved.seats[i];if(!id || seen.has(id) || !students.some(s=>s.id===id))return null;seen.add(id);return id;});
    return {...saved,id:typeof saved.id==="string"?saved.id:makeId(),className:typeof saved.className==="string"&&saved.className.trim()?saved.className.slice(0,60):"Ma classe",students,seats};
  }
  let data={classes:[],active:null}, state=null, ready=false;
  let selected=null, editing=null, targetSeat=null, listMode="manage", returnToList=false, confirmation=null, toastTimer;
  const initials = name => name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
  const positionText = index => "Rangée "+(Math.floor(index/(state.columns*2))+1)+" · place "+(index%(state.columns*2)+1);
  function element(tag, className, text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function notify(message) {$("toast").textContent=message;$("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").hidden=true,3200);}
  function save() { if(ready) persist(data); }
  function confirmAction(title, description, action) {$("confirmTitle").textContent=title;$("confirmDescription").textContent=description;confirmation=action;$("confirmDialog").showModal();}
  function placeStudent(id,index) {if(!state.students.some(s=>s.id===id)||index<0||index>=state.seats.length)return;const previous=state.seats.indexOf(id), occupant=state.seats[index];if(previous>=0)state.seats[previous]=occupant;state.seats[index]=id;selected=null;save();render();}
  function openList(mode="manage",index=null) {listMode=mode;targetSeat=index;$("search").value="";renderList();$("listDialog").showModal();}
  function renderList() {
    const picker=listMode==="pick";
    $("listTitle").textContent=picker?"Choisir un élève":"Élèves de la classe";
    $("listDescription").textContent=picker?positionText(targetSeat)+". Seuls les élèves non placés apparaissent ici.":"Ajoutez, modifiez ou supprimez les élèves de votre classe.";
    const available=state.students.filter(s=>!picker||!state.seats.includes(s.id)), query=$("search").value.trim().toLocaleLowerCase("fr"), filtered=available.filter(s=>s.name.toLocaleLowerCase("fr").includes(query));
    $("listCount").textContent=available.length+" élève"+(available.length>1?"s":"")+(picker?" à placer":" dans la classe");
    $("studentList").replaceChildren();
    if(!filtered.length)$("studentList").append(element("div","empty",query?"Aucun élève trouvé.":picker?"Tous les élèves sont déjà placés. Vous pouvez en ajouter.":"Votre liste est vide. Ajoutez vos premiers élèves."));
    filtered.forEach(student=>{
      const item=element(picker?"button":"div","student"+(picker?" pick":""));
      if(picker){item.type="button";item.onclick=()=>{const index=targetSeat;$("listDialog").close();placeStudent(student.id,index);};}
      const name=element("span","student-name",student.name), index=state.seats.indexOf(student.id);
      name.append(element("small","",index<0?"À placer":positionText(index)));
      item.append(element("span","avatar",initials(student.name)),name);
      if(picker)item.append(element("span","","＋"));
      else {
        const edit=element("button","icon-btn","✎"), remove=element("button","icon-btn","×");
        edit.setAttribute("aria-label","Modifier "+student.name);edit.onclick=()=>openStudentDialog(student.id);
        remove.setAttribute("aria-label","Supprimer "+student.name);remove.onclick=()=>confirmAction("Supprimer cet élève ?","« "+student.name+" » sera retiré de la liste et du plan.",()=>{state.students=state.students.filter(s=>s.id!==student.id);state.seats=state.seats.map(id=>id===student.id?null:id);if(selected===student.id)selected=null;save();render();renderList();});
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
  function switchClass(id) {if(state)finishRename();data.active=id;state=data.classes.find(c=>c.id===id);selected=null;save();render();}
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
      info.append(name,element("small","",c.students.length+" élèves · "+c.rows+" rangées"+(c.id===data.active?" · Classe active":"")));
      const open=element("button","",c.id===data.active?"Ouverte":"Ouvrir");open.onclick=()=>{switchClass(c.id);$("classesDialog").close();};
      const copy=element("button","icon-btn","⧉");copy.setAttribute("aria-label","Dupliquer "+c.className);
      copy.onclick=()=>{const ids=new Map();const students=c.students.map(s=>{const id=makeId();ids.set(s.id,id);return{id,name:s.name};});data.classes.push({...c,id:makeId(),className:(c.className+" — copie").slice(0,60),students,seats:c.seats.map(id=>ids.get(id)||null)});save();render();renderClasses();notify("Classe dupliquée.");};
      const remove=element("button","icon-btn","×");remove.setAttribute("aria-label","Supprimer "+c.className);remove.disabled=false;
      remove.onclick=()=>confirmAction("Supprimer "+c.className+" ?","La classe, ses élèves et son placement seront supprimés.",()=>{data.classes=data.classes.filter(x=>x.id!==c.id);if(data.active===c.id){data.active=data.classes[0]?.id||null;state=data.classes[0]||null;}selected=null;save();render();renderClasses();});
      row.append(info,open,copy,remove);$("classList").append(row);
    });
  }
  function render() {
    renderClassSelect();
    $("planPanel").hidden=!ready||!state;
    $("emptyPanel").hidden=!ready||!!state;
    $("classSelect").disabled=!ready||!state;
    $("manageClasses").disabled=!ready;
    if(!state)return;
    $("rows").value=state.rows;$("columns").value=state.columns;$("studentNumber").value=state.students.length;
    if(document.activeElement!==$("className"))$("className").value=state.className||"Ma classe";
    const placed=state.seats.filter(Boolean).length, shortage=Math.max(0,state.students.length-state.seats.length);
    $("stats").textContent=state.students.length+" élèves · "+placed+" placés · "+(state.students.length-placed)+" à placer";
    $("capacity").textContent=state.rows*state.columns+" tables · "+state.seats.length+" places";$("freeCount").textContent=(state.seats.length-placed)+" places libres";
    $("notice").hidden=!shortage;$("notice").textContent="Il manque "+shortage+" place"+(shortage>1?"s":"")+" pour accueillir toute la classe. Augmentez les rangées ou les tables par rangée.";
    $("shuffle").disabled=!state.students.length;$("clear").disabled=!placed;
    const pupil=state.students.find(s=>s.id===selected);$("selectionBar").hidden=!pupil;if(pupil)$("selectionText").textContent=pupil.name+" — cliquez sur un autre élève pour échanger leurs places.";
    $("room").style.minWidth=Math.max(340,state.columns*175+50)+"px";$("desks").style.gridTemplateColumns="repeat("+state.columns+",minmax(0,1fr))";$("desks").replaceChildren();
    for(let table=0;table<state.rows*state.columns;table++){
      const desk=element("div","desk");
      for(let side=0;side<2;side++){
        const index=table*2+side, student=state.students.find(s=>s.id===state.seats[index]), seat=element("button","seat"+(student?" occupied":"")+(student&&selected===student.id?" active":""));
        seat.type="button";seat.setAttribute("aria-label",positionText(index)+(student?", "+student.name:", choisir un élève"));seat.append(element("span","seat-number",index%(state.columns*2)+1));
        if(student){seat.append(element("span","initial",initials(student.name)),element("span","seat-name",student.name));seat.draggable=true;seat.ondragstart=e=>{e.dataTransfer.setData("text/plain",student.id);e.dataTransfer.effectAllowed="move";};seat.ondragend=()=>document.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"));}
        else seat.append(element("span","plus","＋"),element("span","empty-label","Choisir un élève"));
        seat.onclick=()=>{if(!student){selected=null;render();openList("pick",index);}else if(selected&&selected!==student.id)placeStudent(selected,index);else{selected=selected===student.id?null:student.id;render();}};
        seat.ondragover=e=>{e.preventDefault();seat.classList.add("drag-over");};seat.ondragleave=()=>seat.classList.remove("drag-over");seat.ondrop=e=>{e.preventDefault();seat.classList.remove("drag-over");const id=e.dataTransfer.getData("text/plain");if(id)placeStudent(id,index);};desk.append(seat);
      }
      ["left","right"].forEach(side=>{const chair=element("span","chair "+side);chair.setAttribute("aria-hidden","true");desk.append(chair);});$("desks").append(desk);
    }
  }
  // Keep pupils at the same row, table and seat when the room dimensions change.
  function resizeRoom() {
    if(!$("rows").checkValidity()||!$("columns").checkValidity()){$("rows").reportValidity();$("columns").reportValidity();render();return;}
    const rows=Number($("rows").value), columns=Number($("columns").value), nextSeats=Array(rows*columns*2).fill(null);let displaced=0;
    for(let row=0;row<state.rows;row++)for(let table=0;table<state.columns;table++)for(let side=0;side<2;side++){const id=state.seats[(row*state.columns+table)*2+side];if(!id)continue;if(row<rows&&table<columns)nextSeats[(row*columns+table)*2+side]=id;else displaced++;}
    const apply=()=>{state.rows=rows;state.columns=columns;state.seats=nextSeats;selected=null;save();render();};
    if(displaced){render();confirmAction("Réduire le nombre de tables ?",displaced+" élève"+(displaced>1?"s retourneront":" retournera")+" dans la liste des élèves non placés. Leurs noms seront conservés.",apply);}else apply();
  }
  function resizeStudents() {
    const field=$("studentNumber");if(!field.checkValidity()){field.reportValidity();render();return;}
    const count=Number(field.value);if(count===state.students.length)return;
    if(count>state.students.length){let number=1;const used=new Set(state.students.map(s=>s.name));while(state.students.length<count){while(used.has("Élève "+number))number++;const name="Élève "+number++;used.add(name);state.students.push({id:makeId(),name});}save();render();notify("Élèves ajoutés. Modifiez leurs noms dans « Gérer les élèves ».");return;}
    const removed=state.students.slice(count);render();
    confirmAction("Réduire la liste à "+count+" élèves ?","Les "+removed.length+" derniers élèves seront supprimés : "+removed.slice(0,4).map(s=>s.name).join(", ")+(removed.length>4?", …":".")+" Vous pouvez aussi les supprimer individuellement.",()=>{const ids=new Set(removed.map(s=>s.id));state.students=state.students.slice(0,count);state.seats=state.seats.map(id=>ids.has(id)?null:id);if(ids.has(selected))selected=null;save();render();});
  }
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
  $("names").oninput=()=>$("names").setCustomValidity("");$("cancelSelection").onclick=()=>{selected=null;render();};$("unplace").onclick=()=>{state.seats=state.seats.map(id=>id===selected?null:id);selected=null;save();render();};
  $("shuffle").onclick=()=>{const apply=()=>{const ids=state.students.map(s=>s.id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}state.seats=Array.from({length:state.rows*state.columns*2},(_,i)=>ids[i]||null);selected=null;save();render();};if(state.seats.some(Boolean))confirmAction("Redistribuer les places ?","Les élèves seront répartis au hasard. Les élèves restants apparaîtront dans la liste des non placés.",apply);else apply();};
  $("clear").onclick=()=>confirmAction("Libérer toutes les places ?","Les élèves resteront dans votre liste.",()=>{state.seats.fill(null);selected=null;save();render();});
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
      ready=false;data={classes:[],active:null};state=null;selected=null;returnToList=false;
      document.querySelectorAll("dialog[open]").forEach(d=>d.close());
      render();return;
    }
    try{
      const classes=remote.classes.map(normalizeClass);
      const active=remote.active||data.active;
      data={classes,active:classes.some(c=>c.id===active)?active:classes[0]?.id||null};
      state=classes.find(c=>c.id===data.active)||null;
      if(!state?.students.some(s=>s.id===selected))selected=null;
      ready=true;render();
      if($("classesDialog").open)renderClasses();
      if($("listDialog").open&&state)renderList();
    }catch(error){$("authMessage").textContent="Impossible de charger les classes : "+error.message;}
  },status=>{
    $("authPanel").hidden=!!status.user;
    $("accountControls").hidden=!status.user;
    $("classControls").hidden=!status.user;
    $("accountName").textContent=status.user?.displayName||status.user?.email||"";
    $("logoutButton").disabled=status.pending;
    const text=status.error?"Erreur de synchronisation : "+status.error.message:status.offline?(status.pending?"Hors ligne · modifications en attente":"Hors ligne · données en cache"):status.pending?"Synchronisation en cours…":status.fromCache?"Données en cache · connexion au serveur…":ready?"Données synchronisées":"Chargement des classes…";
    $("syncStatus").textContent=text;$("saveStatus").textContent=text;
    if(status.error){$("authMessage").textContent=text;notify(text);}
  });
  render();
})();
