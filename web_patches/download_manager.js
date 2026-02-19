;(function(){
if(window.__sfDownloadMgr)return;
window.__sfDownloadMgr=true;
var _items={};
var _panel=null;
var _pollId=null;
var _stateKey="sf_download_mgr_state_v1";
var _uiKey="sf_download_mgr_ui_v1";

function isTerminalStatus(status){
  return status==="completed"||status==="error"||status==="canceled";
}
function hasActiveDownloads(){
  var keys=Object.keys(_items);
  for(var i=0;i<keys.length;i++){
    var st=_items[keys[i]]&&_items[keys[i]].status;
    if(!isTerminalStatus(st))return true;
  }
  return false;
}
function escapeHtml(value){
  return String(value==null?"":value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function filenameFromKey(key){
  var parts=String(key||"").split("/");
  return parts.length?parts[parts.length-1]:String(key||"");
}
function persistState(){
  try{
    var cleaned={};
    var keys=Object.keys(_items);
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      var it=_items[k];
      cleaned[k]={
        filename:it.filename,
        progress:it.progress||0,
        total:it.total||0,
        status:it.status||"pending",
        error:it.error||null
      };
    }
    localStorage.setItem(_stateKey,JSON.stringify(cleaned));
  }catch(_e){}
}
function restoreState(){
  try{
    var raw=localStorage.getItem(_stateKey);
    if(!raw)return;
    var parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object")return;
    var keys=Object.keys(parsed);
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      var it=parsed[k]||{};
      _items[k]={
        filename:it.filename||filenameFromKey(k),
        progress:it.progress||0,
        total:it.total||0,
        status:it.status||"pending",
        error:it.error||null,
        btn:null
      };
    }
  }catch(_e){}
}
function persistUiState(){
  try{
    if(!_panel)return;
    var body=document.getElementById("sf-dm-body");
    var ui={
      hidden:_panel.style.display==="none",
      minimized:!!(body&&body.style.display==="none"),
      top:_panel.style.top||"",
      left:_panel.style.left||"",
      right:_panel.style.right||"",
      bottom:_panel.style.bottom||""
    };
    localStorage.setItem(_uiKey,JSON.stringify(ui));
  }catch(_e){}
}
function restoreUiState(){
  try{
    if(!_panel)return;
    var raw=localStorage.getItem(_uiKey);
    if(!raw)return;
    var ui=JSON.parse(raw);
    if(!ui||typeof ui!=="object")return;
    if(ui.top)_panel.style.top=ui.top;
    if(ui.left)_panel.style.left=ui.left;
    if(ui.right)_panel.style.right=ui.right;
    if(ui.bottom)_panel.style.bottom=ui.bottom;
    var body=document.getElementById("sf-dm-body");
    var minBtn=document.getElementById("sf-dm-min");
    if(body&&ui.minimized){
      body.style.display="none";
      if(minBtn)minBtn.textContent="+";
    }
    if(ui.hidden&&(!hasActiveDownloads())){
      _panel.style.display="none";
    }
  }catch(_e){}
}
function updateCloseButtonState(){
  var closeBtn=document.getElementById("sf-dm-close");
  if(!closeBtn)return;
  var canClose=!hasActiveDownloads();
  closeBtn.style.opacity=canClose?"1":"0.45";
  closeBtn.style.cursor=canClose?"pointer":"not-allowed";
  closeBtn.title=canClose?"Close":"Finish or cancel active downloads first";
}
function syncRowButton(item){
  if(!item||!item.btn)return;
  var status=item.status;
  if(status==="completed"){
    item.btn.textContent="Done!";
    item.btn.style.color="#4ade80";
    item.btn.disabled=true;
  }else if(status==="error"){
    item.btn.textContent="Error";
    item.btn.style.color="#f87171";
    item.btn.disabled=false;
  }else if(status==="canceled"){
    item.btn.textContent="Canceled";
    item.btn.style.color="#f59e0b";
    item.btn.disabled=false;
  }else if(status==="canceling"){
    item.btn.textContent="Canceling...";
    item.btn.style.color="#f59e0b";
    item.btn.disabled=true;
  }else if((item.total||0)>0){
    var p=Math.round((item.progress||0)/item.total*100);
    item.btn.textContent=p+"% ("+Math.round((item.progress||0)/1048576)+"/"+Math.round(item.total/1048576)+" MB)";
    item.btn.style.color="#fbbf24";
    item.btn.disabled=true;
  }else{
    item.btn.textContent="Downloading...";
    item.btn.style.color="#fbbf24";
    item.btn.disabled=true;
  }
}
function createPanel(){
  if(_panel)return;
  _panel=document.createElement("div");
  _panel.id="sf-download-mgr";
  _panel.innerHTML="<div id='sf-dm-header' style='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:move;user-select:none'><span style='font-weight:600;font-size:13px'>Downloads</span><div><span id='sf-dm-min' style='cursor:pointer;padding:0 4px;font-size:16px' title='Minimize'>_</span><span id='sf-dm-close' style='cursor:pointer;padding:0 4px;font-size:14px' title='Close'>X</span></div></div><div id='sf-dm-body' style='padding:0 12px 8px;max-height:300px;overflow-y:auto'></div>";
  _panel.style.cssText="position:fixed;bottom:20px;right:20px;width:380px;background:#1e1e2e;border:1px solid #444;border-radius:10px;color:#e0e0e0;font-family:system-ui,sans-serif;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,0.5)";
  document.body.appendChild(_panel);

  var hdr=document.getElementById("sf-dm-header");
  var minimized=false;
  document.getElementById("sf-dm-min").onclick=function(){
    var body=document.getElementById("sf-dm-body");
    minimized=!minimized;
    body.style.display=minimized?"none":"block";
    this.textContent=minimized?"+":"_";
    persistUiState();
  };
  document.getElementById("sf-dm-close").onclick=function(){
    if(hasActiveDownloads())return;
    _panel.style.display="none";
    persistUiState();
  };

  var dx=0,dy=0,mx=0,my=0,dragging=false;
  hdr.onmousedown=function(e){
    dragging=true;
    mx=e.clientX;
    my=e.clientY;
    document.onmousemove=function(e2){
      if(!dragging)return;
      dx=mx-e2.clientX;
      dy=my-e2.clientY;
      mx=e2.clientX;
      my=e2.clientY;
      _panel.style.top=(_panel.offsetTop-dy)+"px";
      _panel.style.left=(_panel.offsetLeft-dx)+"px";
      _panel.style.bottom="auto";
      _panel.style.right="auto";
    };
    document.onmouseup=function(){
      dragging=false;
      document.onmousemove=null;
      document.onmouseup=null;
      persistUiState();
    };
  };
}
function mergeStatus(st){
  st=st||{};
  var keys=Object.keys(st);
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    var src=st[k]||{};
    if(!_items[k]){
      _items[k]={
        filename:src.filename||filenameFromKey(k),
        progress:0,
        total:0,
        status:"pending",
        error:null,
        btn:null
      };
    }
    _items[k].filename=src.filename||_items[k].filename||filenameFromKey(k);
    _items[k].progress=src.progress||0;
    _items[k].total=src.total||0;
    _items[k].status=src.status||_items[k].status||"pending";
    _items[k].error=src.error||null;
    syncRowButton(_items[k]);
  }
  var localKeys=Object.keys(_items);
  for(var j=0;j<localKeys.length;j++){
    var localKey=localKeys[j];
    if(st[localKey])continue;
    var localItem=_items[localKey];
    if(localItem&&!isTerminalStatus(localItem.status)){
      localItem.status="canceled";
      localItem.error=localItem.error||"No longer tracked on server";
      syncRowButton(localItem);
    }
  }
}
function requestCancel(key){
  fetch("/api/download-model/cancel",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:key})
  }).then(function(r){return r.json()}).then(function(resp){
    if(!_items[key])return;
    if(resp.status==="canceling"){
      _items[key].status="canceling";
      _items[key].error=null;
    }else if(resp.status==="canceled"){
      _items[key].status="canceled";
      _items[key].error=null;
    }else if(resp.error){
      _items[key].status="canceled";
      _items[key].error=resp.error;
    }
    syncRowButton(_items[key]);
    updatePanel();
    startPolling();
  }).catch(function(){
    if(_items[key]){
      _items[key].status="error";
      _items[key].error="Cancel request failed";
      syncRowButton(_items[key]);
      updatePanel();
    }
  });
}
function updatePanel(){
  createPanel();
  var body=document.getElementById("sf-dm-body");
  if(!body)return;
  var keys=Object.keys(_items);
  var html="";
  if(keys.length===0){
    html="<div style='color:#888;font-size:12px;padding:4px 0'>No tracked downloads yet</div>";
  }
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    var it=_items[k]||{};
    var status=it.status||"pending";
    var pct=(it.total||0)>0?Math.round((it.progress||0)/it.total*100):0;
    if(pct<0)pct=0;
    if(pct>100)pct=100;
    var mb=Math.round((it.progress||0)/1048576);
    var totalMb=Math.round((it.total||0)/1048576);
    var barColor=status==="completed"?"#4ade80":status==="error"?"#f87171":status==="canceled"?"#f59e0b":"#76b900";
    var statusText="";
    if(status==="completed"){
      statusText="<span style='color:#4ade80'>Done</span>";
    }else if(status==="error"){
      statusText="<span style='color:#f87171'>Error: "+escapeHtml(it.error||"unknown")+"</span>";
    }else if(status==="canceled"){
      statusText="<span style='color:#f59e0b'>Canceled</span>";
    }else if(status==="canceling"){
      statusText="<span style='color:#f59e0b'>Canceling...</span>";
    }else if((it.total||0)>0){
      statusText=pct+"% ("+mb+"/"+totalMb+" MB)";
    }else{
      statusText="Downloading... "+mb+" MB";
    }
    var cancelBtn=isTerminalStatus(status)?"":"<button data-sf-cancel='"+escapeHtml(k)+"' style='padding:2px 6px;font-size:11px;border-radius:6px;border:1px solid #555;background:#2f2f40;color:#f7b267;cursor:pointer'>Cancel</button>";
    html+="<div style='margin:8px 0'><div style='display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px'><span style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px' title='"+escapeHtml(it.filename||filenameFromKey(k))+"'>"+escapeHtml(it.filename||filenameFromKey(k))+"</span><span>"+statusText+"</span></div><div style='width:100%;height:4px;background:#333;border-radius:2px;overflow:hidden'><div style='height:100%;width:"+pct+"%;background:"+barColor+";border-radius:2px;transition:width 0.3s'></div></div><div style='display:flex;justify-content:flex-end;margin-top:4px'>"+cancelBtn+"</div></div>";
    syncRowButton(it);
  }
  body.innerHTML=html;

  var cancelButtons=body.querySelectorAll("button[data-sf-cancel]");
  for(var j=0;j<cancelButtons.length;j++){
    cancelButtons[j].onclick=function(){
      var key=this.getAttribute("data-sf-cancel");
      if(!key)return;
      requestCancel(key);
    };
  }

  if(hasActiveDownloads())_panel.style.display="block";
  updateCloseButtonState();
  persistState();
  persistUiState();
}
function pollOnce(){
  return fetch("/api/download-model/status").then(function(r){return r.json()}).then(function(st){
    mergeStatus(st);
    updatePanel();
    if(!hasActiveDownloads()&&_pollId){
      clearInterval(_pollId);
      _pollId=null;
    }
  }).catch(function(){});
}
function startPolling(){
  if(_pollId)return;
  _pollId=setInterval(pollOnce,1000);
  pollOnce();
}
function hydrateFromServer(){
  fetch("/api/download-model/status").then(function(r){return r.json()}).then(function(st){
    mergeStatus(st);
    updatePanel();
    if(hasActiveDownloads())startPolling();
  }).catch(function(){
    updatePanel();
  });
}

window.__sfStartTracker=function(key,filename,btn){
  if(!key)return;
  createPanel();
  if(!_items[key]){
    _items[key]={filename:filename||filenameFromKey(key),progress:0,total:0,status:"pending",error:null,btn:null};
  }
  var it=_items[key];
  if(filename)it.filename=filename;
  it.status=isTerminalStatus(it.status)?"pending":(it.status||"pending");
  it.error=null;
  if(btn)it.btn=btn;
  _panel.style.display="block";
  syncRowButton(it);
  updatePanel();
  startPolling();
};

restoreState();
createPanel();
restoreUiState();
updatePanel();
hydrateFromServer();
if(hasActiveDownloads())startPolling();
})();
