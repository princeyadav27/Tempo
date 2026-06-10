/* ==========================================================================
   TEMPO — Mechanical Pomodoro Timer
   App logic: timer engine, audio synthesis, themes, focus intelligence
   ========================================================================== */

(function(){
  "use strict";

  /* ---------- storage (safe in sandboxed iframes) ---------- */
  var mem = {};
  var store = {
    get:function(k,d){ try{ var v = localStorage.getItem("tempo_"+k); return v===null?d:JSON.parse(v); }catch(e){ return (k in mem)?mem[k]:d; } },
    set:function(k,v){ try{ localStorage.setItem("tempo_"+k, JSON.stringify(v)); }catch(e){} mem[k]=v; }
  };

  /* ---------- state ---------- */
  var durations = store.get("durations", {focus:25, short:5, long:15}); // minutes
  var mode = "focus";
  var running = false;
  var totalMs = durations.focus*60000;
  var remainMs = totalMs;
  var lastTs = null;
  var lastWholeSec = -1;
  var cycleCount = store.get("cycle", 0);       // 0..4 pomodoros in current cycle
  var tickOn = store.get("tickOn", true);
  var chimeOn = store.get("chimeOn", true);
  var history = store.get("history", []);       // [{t:epoch, mode, mins}]
  var theme = store.get("theme", "classic");

  /* ---------- elements ---------- */
  function $(id){ return document.getElementById(id); }
  var wedge=$("wedge"), handPath=$("handPath"), secHand=$("secHand"), dialDigits=$("dialDigits"),
      startBtn=$("startBtn"), startCap=$("startCap"), clockWrap=$("clockWrap");

  /* ---------- focus purity (distraction) tracking ---------- */
  var offTabMs=0, awayAt=null, sessionStartWall=null;
  function goAway(){ if(awayAt===null) awayAt=Date.now(); }
  function comeBack(){ if(awayAt!==null){ offTabMs+=Date.now()-awayAt; awayAt=null; } }
  document.addEventListener("visibilitychange",function(){
    if(!running||mode!=="focus") return;
    if(document.hidden) goAway(); else comeBack();
  });
  window.addEventListener("blur",function(){ if(running&&mode==="focus") goAway(); });
  window.addEventListener("focus",function(){ if(running&&mode==="focus") comeBack(); });
  function currentPurity(){
    var elapsed=totalMs-remainMs;
    if(elapsed<4000) return null; /* too early to judge */
    var off=offTabMs+(awayAt!==null?Date.now()-awayAt:0);
    return Math.max(0,Math.min(1,(elapsed-off)/elapsed));
  }
  function resetPurity(){ offTabMs=0; awayAt=null; }

  /* ---------- purity gauge ---------- */
  var gaugeNeedle=$("gaugeNeedle"), purityVal=$("purityVal"), purityNote=$("purityNote");
  (function buildGaugeTicks(){
    var NS="http://www.w3.org/2000/svg", g=$("gaugeTicks"), i;
    for(i=0;i<=10;i++){
      var a=(-90+i*18)*Math.PI/180;
      var x1=64+44*Math.sin(a), y1=66-44*Math.cos(a);
      var x2=64+48*Math.sin(a), y2=66-48*Math.cos(a);
      var ln=document.createElementNS(NS,"line");
      ln.setAttribute("x1",x1); ln.setAttribute("y1",y1);
      ln.setAttribute("x2",x2); ln.setAttribute("y2",y2);
      ln.setAttribute("stroke","var(--label)"); ln.setAttribute("stroke-width",i%5===0?1.6:.8);
      ln.setAttribute("opacity",i%5===0?.7:.35); ln.setAttribute("stroke-linecap","round");
      g.appendChild(ln);
    }
  })();
  function renderGauge(){
    var p=(running&&mode==="focus")?currentPurity():lastPurityShown;
    if(p===null||p===undefined){
      gaugeNeedle.setAttribute("transform","rotate(-90 64 66)");
      purityVal.textContent="—";
      purityNote.textContent=(running&&mode==="focus")?"measuring…":"time on-tab this session";
      return;
    }
    gaugeNeedle.setAttribute("transform","rotate("+(-90+p*180).toFixed(1)+" 64 66)");
    purityVal.textContent=Math.round(p*100)+"%";
    purityNote.textContent=(running&&mode==="focus")?"live · time on-tab":"last focus session";
  }
  var lastPurityShown=null;

  /* ---------- build dial ticks & numbers ---------- */
  (function buildDial(){
    var ticks=$("ticks"), numbers=$("numbers"), i, a, rad, x1,y1,x2,y2, major;
    var NS="http://www.w3.org/2000/svg";
    for(i=0;i<60;i++){
      a = i*6; rad = a*Math.PI/180;
      major = (i%5===0);
      var rO=96, rI = major? 87.5 : 91.5;
      x1=100+rO*Math.sin(rad); y1=100-rO*Math.cos(rad);
      x2=100+rI*Math.sin(rad); y2=100-rI*Math.cos(rad);
      var ln=document.createElementNS(NS,"line");
      ln.setAttribute("x1",x1); ln.setAttribute("y1",y1);
      ln.setAttribute("x2",x2); ln.setAttribute("y2",y2);
      ln.setAttribute("stroke","var(--tick)");
      ln.setAttribute("stroke-width", major? 2.4 : 1);
      ln.setAttribute("stroke-linecap","round");
      ln.setAttribute("opacity", major? .9 : .55);
      ticks.appendChild(ln);
    }
    /* counter-clockwise minute numerals like a classic Time Timer (0,5,10...55) */
    for(i=0;i<12;i++){
      a = -i*30; rad = a*Math.PI/180;
      var tx=100+76*Math.sin(rad), ty=100-76*Math.cos(rad);
      var t=document.createElementNS(NS,"text");
      t.setAttribute("x",tx); t.setAttribute("y",ty+4.4);
      t.setAttribute("text-anchor","middle");
      t.setAttribute("font-size","11");
      t.setAttribute("font-weight","700");
      t.setAttribute("font-family","'Avenir Next','Futura',sans-serif");
      t.setAttribute("fill","var(--ink)");
      t.textContent = i*5;
      numbers.appendChild(t);
    }
  })();

  /* ---------- audio (Web Audio, zero assets) ---------- */
  var AC=null;
  function ctx(){ if(!AC){ var C=window.AudioContext||window.webkitAudioContext; if(C) AC=new C(); } if(AC&&AC.state==="suspended") AC.resume(); return AC; }
  function tickSound(alt){
    if(!tickOn) return; var ac=ctx(); if(!ac) return;
    var t=ac.currentTime;
    var o=ac.createOscillator(), g=ac.createGain(), f=ac.createBiquadFilter();
    o.type="square"; o.frequency.value = alt? 2050 : 1650;
    f.type="bandpass"; f.frequency.value = alt? 2100 : 1700; f.Q.value=9;
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.11,t+.002);
    g.gain.exponentialRampToValueAtTime(.0001,t+.045);
    o.connect(f); f.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t+.06);
  }
  function clickSound(down){
    var ac=ctx(); if(!ac) return; var t=ac.currentTime;
    var o=ac.createOscillator(), g=ac.createGain();
    o.type="triangle"; o.frequency.setValueAtTime(down?340:520,t);
    o.frequency.exponentialRampToValueAtTime(down?120:240,t+.06);
    g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.0001,t+.09);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+.1);
  }
  function bellSound(){
    if(!chimeOn) return; var ac=ctx(); if(!ac) return;
    var t=ac.currentTime, freqs=[523.25, 659.25, 783.99, 1046.5];
    freqs.forEach(function(f,i){
      var o=ac.createOscillator(), g=ac.createGain();
      o.type="sine"; o.frequency.value=f;
      var st=t+i*.16, amp=.16/(i*0.5+1);
      g.gain.setValueAtTime(.0001,st);
      g.gain.exponentialRampToValueAtTime(amp,st+.012);
      g.gain.exponentialRampToValueAtTime(.0001,st+1.6);
      o.connect(g); g.connect(ac.destination); o.start(st); o.stop(st+1.7);
    });
  }

  /* ---------- geometry ---------- */
  function pt(angleDeg, r){
    var rad=angleDeg*Math.PI/180;
    return [100+r*Math.sin(rad), 100-r*Math.cos(rad)];
  }
  function drawWedge(frac){
    if(frac<=0.0008){ wedge.setAttribute("d",""); return; }
    if(frac>=0.9995){ frac=0.9995; }
    var a = -frac*360;                 /* wedge sweeps counter-clockwise from 12 */
    var p1 = pt(a, 84), p2 = pt(0, 84);
    var large = frac>0.5 ? 1 : 0;
    wedge.setAttribute("d",
      "M100,100 L"+p1[0].toFixed(2)+","+p1[1].toFixed(2)+
      " A84,84 0 "+large+" 1 "+p2[0].toFixed(2)+","+p2[1].toFixed(2)+" Z");
  }
  function drawHand(frac){
    var a=-frac*360;
    handPath.setAttribute("transform","rotate("+a+" 100 100)");
  }
  function drawSecHand(){
    /* sweeps clockwise once per minute, smooth like a mechanical movement */
    var elapsed=(totalMs-remainMs)/1000;
    var a=(elapsed%60)/60*360;
    secHand.setAttribute("transform","rotate("+a+" 100 100)");
  }
  /* hand shape: pointer with tail */
  handPath.setAttribute("d","M97.8,114 L97.2,30 Q100,24 102.8,30 L102.2,114 Q100,118 97.8,114 Z");

  /* ---------- rendering ---------- */
  function fmt(ms){
    var s=Math.max(0,Math.ceil(ms/1000));
    var m=Math.floor(s/60); s=s%60;
    return (m<10?"0":"")+m+":"+(s<10?"0":"")+s;
  }
  function render(){
    var frac = totalMs>0 ? remainMs/totalMs : 0;
    /* scale wedge fraction to dial: full duration = full circle */
    drawWedge(frac);
    drawHand(frac);
    drawSecHand();
    dialDigits.textContent = fmt(remainMs);
  }
  function isDone(h){ return h.done===undefined ? true : !!h.done; } /* legacy rows = completed */
  function renderStats(){
    var today = new Date().toDateString();
    var n=0,i;
    for(i=0;i<history.length;i++){ if(history[i].mode==="focus" && isDone(history[i]) && new Date(history[i].t).toDateString()===today) n++; }
    $("statToday").textContent=n;
    $("statStreak").textContent = computeStreak()+"🔥";
    var dots=$("dots").children;
    for(i=0;i<4;i++) dots[i].className = "dot"+(i<cycleCount?" done":"");
  }
  function computeStreak(){
    var days={}, i;
    for(i=0;i<history.length;i++){ if(history[i].mode==="focus" && isDone(history[i])) days[new Date(history[i].t).toDateString()]=1; }
    var streak=0, d=new Date();
    if(!days[d.toDateString()]) d.setDate(d.getDate()-1); /* allow today not yet done */
    while(days[d.toDateString()]){ streak++; d.setDate(d.getDate()-1); }
    return streak;
  }
  function renderHistory(){
    var el=$("historyList");
    if(!history.length){ el.innerHTML='<div class="empty">No sessions yet — wind it up!</div>'; return; }
    var html="", i, h;
    for(i=history.length-1; i>=Math.max(0,history.length-12); i--){
      h=history[i];
      var d=new Date(h.t);
      var when=d.toLocaleDateString(undefined,{month:"short",day:"numeric"})+" "+
               d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
      var label=h.mode==="focus"?"Focus":(h.mode==="short"?"Short break":"Long break");
      var extra=isDone(h)?(h.mins+'m'):('✕ '+(h.el||0)+'/'+h.mins+'m');
      if(h.pur!==null && h.pur!==undefined && h.mode==="focus") extra+=' · '+h.pur+'%';
      html+='<div class="h-row"><span>'+when+'</span><span style="'+(isDone(h)?'':'opacity:.55;')+'">'+label+' · '+extra+'</span></div>';
    }
    el.innerHTML=html;
  }

  /* ---------- timer loop ---------- */
  function loop(ts){
    if(!running) return;
    if(lastTs!==null){
      remainMs -= (ts-lastTs);
    }
    lastTs=ts;
    var sec=Math.ceil(remainMs/1000);
    if(sec!==lastWholeSec){ tickSound(sec%2===0); lastWholeSec=sec; if(sec%2===0) renderGauge(); }
    if(remainMs<=0){ remainMs=0; render(); complete(); return; }
    render();
    requestAnimationFrame(loop);
  }
  function start(){
    running=true; lastTs=null; lastWholeSec=Math.ceil(remainMs/1000);
    if(sessionStartWall===null){ sessionStartWall=Date.now(); resetPurity(); }
    startCap.textContent="PAUSE"; startBtn.classList.add("running");
    requestAnimationFrame(loop);
  }
  function pause(){
    running=false; startCap.textContent="START"; startBtn.classList.remove("running");
    comeBack();
  }
  function logSession(completed){
    var elapsedMin=Math.round((totalMs-remainMs)/60000);
    var p=currentPurity();
    history.push({
      t:Date.now(), mode:mode, mins:durations[mode],
      done:completed?1:0,
      el:elapsedMin,                       /* minutes actually elapsed */
      pur:p===null?null:Math.round(p*100)  /* focus purity % */
    });
    if(history.length>500) history=history.slice(-500);
    store.set("history",history);
    if(mode==="focus" && p!==null) lastPurityShown=p;
    sessionStartWall=null; resetPurity();
  }
  function flushAbandon(){
    /* a started-but-unfinished session (>30s in) counts as an abandon */
    if(sessionStartWall!==null && (totalMs-remainMs)>=30000 && remainMs>0){
      logSession(false);
      renderStats(); renderHistory();
    }else{ sessionStartWall=null; resetPurity(); }
  }
  function reset(){
    flushAbandon();
    pause();
    totalMs=durations[mode]*60000; remainMs=totalMs; render(); renderGauge();
    maybeSuggest();
  }
  function complete(){
    pause();
    bellSound();
    clockWrap.classList.add("flash");
    setTimeout(function(){ clockWrap.classList.remove("flash"); },2600);
    logSession(true);
    if(mode==="focus"){
      cycleCount=Math.min(4,cycleCount+1);
      store.set("cycle",cycleCount);
      setMode(cycleCount>=4 ? "long" : "short");
      if(cycleCount>=4){ cycleCount=0; store.set("cycle",0); renderStats(); }
    }else{
      setMode("focus");
    }
    renderStats(); renderHistory();
  }

  /* ---------- modes ---------- */
  function setMode(m){
    mode=m;
    var btns=$("modes").children, i;
    for(i=0;i<btns.length;i++) btns[i].classList.toggle("active", btns[i].dataset.mode===m);
    reset();
  }
  $("modes").addEventListener("click",function(e){
    var b=e.target.closest("button"); if(!b) return;
    clickSound(true); setMode(b.dataset.mode);
  });

  /* ---------- controls ---------- */
  startBtn.addEventListener("click",function(){
    clickSound(running);
    if(running) pause(); else start();
  });
  $("resetBtn").addEventListener("click",function(){ clickSound(true); reset(); });
  $("settingsBtn").addEventListener("click",function(){ clickSound(false); renderHistory(); openOverlay("settingsOverlay"); });

  /* ---------- overlays ---------- */
  function openOverlay(id){ $(id).classList.add("open"); }
  function closeOverlay(id){ $(id).classList.remove("open"); }
  $("closeSettings").addEventListener("click",function(){ clickSound(true); closeOverlay("settingsOverlay"); });
  $("settingsOverlay").addEventListener("click",function(e){ if(e.target===this) closeOverlay("settingsOverlay"); });

  /* ---------- settings: steppers ---------- */
  var limits={focus:[5,90], short:[1,30], long:[5,60]};
  document.querySelectorAll("[data-adj]").forEach(function(b){
    b.addEventListener("click",function(){
      clickSound(true);
      var p=this.dataset.adj.split(","), k=p[0], d=+p[1];
      durations[k]=Math.min(limits[k][1], Math.max(limits[k][0], durations[k]+d));
      store.set("durations",durations);
      renderDurations();
      if(mode===k && !running) reset();
    });
  });
  function renderDurations(){
    $("vFocus").textContent=durations.focus+" min";
    $("vShort").textContent=durations.short+" min";
    $("vLong").textContent=durations.long+" min";
  }
  function bindToggle(id, get, set){
    var el=$(id);
    el.classList.toggle("on", get());
    el.addEventListener("click",function(){
      set(!get()); el.classList.toggle("on", get()); clickSound(get());
    });
  }
  bindToggle("tickToggle", function(){return tickOn;}, function(v){tickOn=v; store.set("tickOn",v);});
  bindToggle("chimeToggle", function(){return chimeOn;}, function(v){chimeOn=v; store.set("chimeOn",v);});

  /* ---------- themes ---------- */
  function applyTheme(t){
    theme=t; store.set("theme",t);
    document.body.setAttribute("data-theme",t);
    document.querySelectorAll(".swatch").forEach(function(s){
      s.classList.toggle("sel", s.dataset.themeId===t);
    });
  }
  $("tray").addEventListener("click",function(e){
    var s=e.target.closest(".swatch"); if(!s) return;
    clickSound(false); applyTheme(s.dataset.themeId);
  });

  /* ---------- adaptive session length (lightweight bandit) ---------- */
  var suggestDismissedAt = store.get("sugDismiss", 0);
  var suggestEl=$("suggest"), suggestText=$("suggestText"), suggestedMins=null;
  function focusRows(n){
    var out=[], i;
    for(i=history.length-1; i>=0 && out.length<n; i--){
      if(history[i].mode==="focus" && history[i].done!==undefined) out.push(history[i]);
    }
    return out; /* newest first */
  }
  function computeSuggestion(){
    var rows=focusRows(8);
    if(rows.length<4) return null;                    /* need data */
    var doneN=0, abandonEl=[], i, r;
    for(i=0;i<rows.length;i++){ r=rows[i]; if(r.done) doneN++; else if(r.el>=2) abandonEl.push(r.el); }
    var rate=doneN/rows.length;
    var cur=durations.focus;
    /* struggling: low completion → suggest just below the typical abandon point */
    if(rate<0.5 && abandonEl.length>=2){
      var avgEl=abandonEl.reduce(function(a,b){return a+b;},0)/abandonEl.length;
      var target=Math.max(10, Math.round((avgEl*0.9)/5)*5);
      if(target<cur) return {mins:target, msg:"You tend to stop around "+Math.round(avgEl)+" min. Shorter "+target+"-min sessions may help you finish strong."};
    }
    /* crushing it: high completion at current length → nudge up */
    if(rate>=0.9 && rows.length>=6 && cur<60){
      var target2=Math.min(60, cur+5);
      return {mins:target2, msg:"You've completed "+doneN+" of your last "+rows.length+" sessions. Ready to wind up to "+target2+" min?"};
    }
    return null;
  }
  function maybeSuggest(){
    if(running){ suggestEl.hidden=true; return; }
    if(Date.now()-suggestDismissedAt < 6*3600*1000){ suggestEl.hidden=true; return; } /* snooze 6h */
    var s=computeSuggestion();
    if(!s || s.mins===durations.focus){ suggestEl.hidden=true; suggestedMins=null; return; }
    suggestedMins=s.mins; suggestText.textContent=s.msg; suggestEl.hidden=false;
  }
  $("suggestApply").addEventListener("click",function(){
    if(suggestedMins===null) return;
    clickSound(true);
    durations.focus=suggestedMins; store.set("durations",durations);
    renderDurations();
    suggestEl.hidden=true;
    if(mode==="focus" && !running){ totalMs=durations.focus*60000; remainMs=totalMs; render(); }
  });
  $("suggestDismiss").addEventListener("click",function(){
    suggestDismissedAt=Date.now(); store.set("sugDismiss",suggestDismissedAt);
    suggestEl.hidden=true;
  });

  /* ---------- focus insights ---------- */
  function renderInsights(){
    var now=Date.now(), week=7*86400000, i, h;
    var fAll=[], f7=[];
    for(i=0;i<history.length;i++){
      h=history[i];
      if(h.mode!=="focus") continue;
      if(h.done!==undefined) fAll.push(h);
      if(now-h.t<week) f7.push(h);
    }
    /* completion rate (tracked sessions only) */
    var doneN=fAll.filter(function(x){return x.done;}).length;
    $("insRate").textContent = fAll.length? Math.round(doneN/fAll.length*100)+"%" : "—";
    /* peak hour: best completion-weighted hour */
    var byHour={}, best=null;
    for(i=0;i<history.length;i++){
      h=history[i];
      if(h.mode!=="focus"||!isDone(h)) continue;
      var hr=new Date(h.t).getHours();
      byHour[hr]=(byHour[hr]||0)+1;
      if(best===null||byHour[hr]>byHour[best]) best=hr;
    }
    $("insPeak").textContent = best===null? "—" :
      ((best%12===0?12:best%12)+(best<12?" AM":" PM"));
    /* avg purity 7d */
    var purs=f7.filter(function(x){return x.pur!==null&&x.pur!==undefined;}).map(function(x){return x.pur;});
    $("insAvgPurity").textContent = purs.length? Math.round(purs.reduce(function(a,b){return a+b;},0)/purs.length)+"%" : "—";
    /* total focus minutes 7d (elapsed for abandons, full for completes) */
    var tot=0;
    for(i=0;i<f7.length;i++){ h=f7[i]; tot+= isDone(h)? h.mins : (h.el||0); }
    $("insTotal").textContent = tot;
    /* 14-day sparkline bars */
    var NS="http://www.w3.org/2000/svg", svg=$("sparkSvg");
    svg.innerHTML="";
    var counts=[], maxC=1, d;
    for(i=13;i>=0;i--){
      d=new Date(); d.setDate(d.getDate()-i);
      var key=d.toDateString(), c=0, j;
      for(j=0;j<history.length;j++){
        if(history[j].mode==="focus"&&isDone(history[j])&&new Date(history[j].t).toDateString()===key) c++;
      }
      counts.push(c); if(c>maxC) maxC=c;
    }
    for(i=0;i<14;i++){
      var bh=counts[i]/maxC*46;
      var rect=document.createElementNS(NS,"rect");
      rect.setAttribute("x",6+i*19.5); rect.setAttribute("width",12);
      rect.setAttribute("y",54-Math.max(2,bh)); rect.setAttribute("height",Math.max(2,bh));
      rect.setAttribute("rx",2.5);
      rect.setAttribute("fill", counts[i]? "var(--accent)" : "rgba(255,255,255,.1)");
      rect.setAttribute("opacity", i===13? 1 : .55+ (i/13)*.4);
      svg.appendChild(rect);
    }
    /* hint line */
    var hint="";
    if(fAll.length<4) hint="Complete a few more sessions and Tempo will start learning your rhythm — peak hours, ideal session length, and focus purity trends.";
    else{
      var rate=doneN/fAll.length;
      if(rate>=0.85) hint="Excellent discipline — you finish "+Math.round(rate*100)+"% of what you start. The adaptive engine may suggest longer sessions soon.";
      else if(rate<0.5) hint="You finish under half of your sessions. Watch for a suggestion to shorten your focus length — smaller wins build streaks.";
      else hint="Solid rhythm. Keep sessions on-tab to raise your purity score, and your best hours will sharpen with more data.";
    }
    $("insHint").textContent=hint;
  }
  $("plaque").addEventListener("click",function(){ clickSound(false); renderInsights(); openOverlay("insightsOverlay"); });
  $("closeInsights").addEventListener("click",function(){ clickSound(true); closeOverlay("insightsOverlay"); });
  $("insightsOverlay").addEventListener("click",function(e){ if(e.target===this) closeOverlay("insightsOverlay"); });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown",function(e){
    if(e.code==="Space"){ e.preventDefault(); startBtn.click(); }
    if(e.key==="r"||e.key==="R"){ reset(); }
  });

  /* ---------- init ---------- */
  applyTheme(theme);
  renderDurations();
  reset();
  renderStats();
  renderHistory();
})();
