(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const status = $("live-status");
  const run = $("live-run");
  const pause = $("live-pause");
  const single = $("live-step");
  const reset = $("live-reset");
  const inputs = ["live-mode", "live-rate", "live-seed"];
  const samples = { one: [], two: [] };
  const palette = ["#83e5ce", "#f5c27c", "#8596ff"];
  let runtimePromise = null;
  let wasm = null;
  let state = 0;
  let config = null;
  let time = 0;
  let running = false;
  let raf = 0;
  let lastStep = -1;
  let lastA = 0;
  let lastB = 0;
  let lastObjective = 0;
  let lastY0 = 0;
  let lastY1 = 0;
  let correlation1 = null;
  let correlation2 = null;
  let show = "output";
  let errors = [];

  function measure() { return {n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0}; }
  function addCorrelation(c, x, y) {
    c.n++; c.sx += x; c.sy += y; c.sxx += x*x; c.syy += y*y; c.sxy += x*y;
    const dx = c.n*c.sxx - c.sx*c.sx, dy = c.n*c.syy - c.sy*c.sy;
    return dx > 0 && dy > 0 ? (c.n*c.sxy - c.sx*c.sy)/Math.sqrt(dx*dy) : 0;
  }
  function number(value, digits = 4) { return Number.isFinite(value) ? value.toLocaleString("en-GB", {maximumFractionDigits: digits}) : "—"; }
  function message(value, error = false) {
    status.textContent = value;
    status.classList.toggle("live-error", error);
  }
  function controlBusy(busy) {
    for (const id of inputs) $(id).disabled = busy;
  }
  function syncButtons() {
    run.disabled = running || !wasm;
    pause.disabled = !running;
    single.disabled = running || !wasm || (config && time >= config.total);
    reset.disabled = !wasm;
    run.textContent = time >= (config?.total || Infinity) ? "Run again ↗" : (state ? "Resume training ↗" : "Start training ↗");
    controlBusy(!!state);
  }
  function plotMode() { return $("live-view").value; }
  function plotLines() {
    if (show === "objective") return [{name:"Flow log variance ratio", color:palette[1], values: samples.one.map(x => [x.t, x.f])}];
    if (show === "correlation") return config?.mode === 1 ?
      [{name:"Signal / output Pearson r", color:palette[2], values:samples.one.map(x=>[x.t,x.c1])}] :
      [{name:"Correlation 1", color:palette[0], values:samples.one.map(x=>[x.t,x.c1])},
       {name:"Correlation 2", color:palette[1], values:samples.one.map(x=>[x.t,x.c2])}];
    return config?.mode === 1 ?
      [{name:"Flow output", color:palette[0], values:samples.one.map(x=>[x.t,x.y0])}] :
      [{name:"Flow output 1", color:palette[0], values:samples.one.map(x=>[x.t,x.y0])},
       {name:"Flow output 2", color:palette[1], values:samples.one.map(x=>[x.t,x.y1])}];
  }
  function canvasSize(canvas, minHeight) {
    const w = Math.max(240, canvas.getBoundingClientRect().width || 800);
    const h = Math.max(minHeight, canvas.getBoundingClientRect().height || minHeight);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return {ctx, w, h};
  }
  function drawTrace() {
    const {ctx,w,h} = canvasSize($("live-chart"), 295);
    const lines = plotLines();
    ctx.clearRect(0, 0, w, h);
    const left = 59, right = 20, top = 15, bottom = 36;
    const pw = w-left-right, ph = h-top-bottom;
    const values = lines.flatMap(line => line.values.map(row => row[1]));
    let vmin = values.length ? Math.min(...values) : -1;
    let vmax = values.length ? Math.max(...values) : 1;
    if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) { vmin = -1; vmax = 1; }
    if (vmin === vmax) {vmin -= 1; vmax += 1;}
    const pad = (vmax-vmin)*0.1;vmin -= pad;vmax += pad;
    const range = Math.max(1, config ? config.train : 100);
    const x = step => left + (step / range)*pw;
    const y = v => top+(vmax-v)/(vmax-vmin)*ph;
    ctx.font = "11px ui-monospace, monospace";
    for (let i=0;i<=4;i++) {
      const py = top+ph*i/4;
      ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(left+pw,py);ctx.strokeStyle="#344653";ctx.lineWidth=1;ctx.stroke();
      ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillStyle="#9bb0b7";
      ctx.fillText(number(vmax-(vmax-vmin)*i/4,2),left-8,py);
      ctx.textAlign="center";ctx.textBaseline="alphabetic";
      ctx.fillText(String(Math.round(range*i/4)),left+pw*i/4,h-9);
    }
    ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
    for (const line of lines) {
      ctx.beginPath();
      line.values.forEach(([step,value], i)=>{if(i===0)ctx.moveTo(x(step),y(value));else ctx.lineTo(x(step),y(value));});
      ctx.lineWidth=2;ctx.strokeStyle=line.color;ctx.lineJoin="round";ctx.stroke();
    }
    ctx.restore();
    const legend = $("live-legend");legend.replaceChildren();
    for (const line of lines) {
      const item = document.createElement("span"), dot = document.createElement("i");
      dot.style.background = line.color;item.append(dot, document.createTextNode(line.name));legend.append(item);
    }
    $("live-chart").setAttribute("aria-label", "Live Flow training " + lines.map(l=>l.name + ": " + l.values.length + " measured samples").join("; "));
  }
  function drawField() {
    const canvas = $("live-field");
    const {ctx,w,h} = canvasSize(canvas, 245);
    ctx.clearRect(0,0,w,h);
    if (!state || !config) return;
    if (config.mode === 1) {
      const n = 101;
      const col = Math.max(1,(w-30)/n);
      let max = 1e-12;
      const weights = Array.from({length:n}, (_,i)=>wasm._sfa_web_weight(state,i));
      for (const weight of weights) max = Math.max(max,Math.abs(weight));
      for(let i=0;i<n;i++){
        const value=weights[i]/max;
        const base=h/2, size=(h/2-20)*Math.abs(value);
        ctx.fillStyle=i===lastA-1?"#f5c27c":(value>=0?"#83e5ce":"#ed8297");
        ctx.fillRect(15+i*col,base-(value>=0?size:0),Math.max(1,col-1),size||1);
      }
      ctx.strokeStyle="#526774";ctx.beginPath();ctx.moveTo(10,h/2);ctx.lineTo(w-10,h/2);ctx.stroke();
      $("live-field-caption").textContent="101 learned weights; gold = current one-hot input";
    } else {
      const n=51;
      const weights=Array.from({length:2601},(_,i)=>wasm._sfa_web_weight(state,i*2));
      const max=Math.max(1e-12,...weights.map(Math.abs));
      const side=Math.min(w-20,h-12),x0=(w-side)/2,y0=(h-side)/2,unit=side/n;
      for(let i=0;i<2601;i++){
        const intensity=Math.min(1,Math.abs(weights[i])/max);
        const base=[26,52,66],accent=weights[i]>=0?[131,229,206]:[237,130,151];
        ctx.fillStyle="rgb("+base.map((v,j)=>Math.round(v+(accent[j]-v)*intensity)).join(",")+")";
        ctx.fillRect(x0+(i%n)*unit,y0+Math.floor(i/n)*unit,Math.ceil(unit),Math.ceil(unit));
      }
      const col=lastA-1,row=lastB-1;
      if(col>=0&&col<51&&row>=0&&row<51){
        ctx.strokeStyle="#f5c27c";ctx.lineWidth=2;
        ctx.strokeRect(x0+col*unit,y0+row*unit,Math.max(2,unit),Math.max(2,unit));
      }
      $("live-field-caption").textContent="Final/current weights for output 1, 51 × 51; gold square = active input";
    }
  }
  function updateHUD() {
    if (!config) return;
    const burn = time < config.burn;
    const completed = time >= config.total;
    const stage = completed?"COMPLETE":(burn?"BURN-IN":"ADAPTIVE LEARNING");
    $("live-phase").textContent=stage;
    $("live-progress").value=time;
    $("live-progress").max=config.total;
    $("live-percent").textContent=number(time/config.total*100,1)+"%";
    $("live-iteration").textContent=number(time,0)+" / "+number(config.total,0);
    $("live-output").textContent=number(lastY0,5)+(config.mode===2?" / "+number(lastY1,5):"");
    $("live-objective").textContent=number(lastObjective,4);
    $("live-correlation").textContent=number(correlation1?.value??0,4)+(config.mode===2?" / "+number(correlation2?.value??0,4):"");
    $("live-sample").textContent="Input: "+lastA+(config.mode===2?" × "+lastB:"");
    syncButtons();
  }
  function configure() {
    const mode=Number($("live-mode").value);
    const rate=Number($("live-rate").value);
    const seed=Number($("live-seed").value);
    if (!Number.isInteger(mode)||![1,2].includes(mode)||!Number.isInteger(rate)||rate<2||rate>200||!Number.isSafeInteger(seed)||seed<1||seed>2147483646) {
      throw new Error("Use a rate between 2 and 200 and a seed between 1 and 2,147,483,646.");
    }
    return {mode,rate,seed,burn:4*rate,train:50*rate,total:54*rate,storeEvery:Math.max(1,Math.ceil(50*rate/1500))};
  }
  function freeState() {
    running=false;cancelAnimationFrame(raf);
    if(wasm&&state)wasm._sfa_web_destroy(state);
    state=0;time=0;lastStep=-1;lastA=0;lastB=0;lastY0=0;lastY1=0;lastObjective=0;
    correlation1=measure();correlation2=measure();correlation1.value=0;correlation2.value=0;
    samples.one.length=0;samples.two.length=0;
    controlBusy(false);syncButtons();
  }
  function createState() {
    if (state) return;
    config=configure();
    state=wasm._sfa_web_create(config.rate,config.mode,config.seed);
    if (!state)throw new Error("The Flow SFA solver could not allocate its model.");
    $("live-view").querySelector("option[value='objective']").disabled=false;
    $("live-progress").max=config.total;
    message("Training runs locally in Flow WebAssembly; no server inference or replay.");
    updateHUD();drawTrace();drawField();
  }
  function advance(count) {
    if(!state||!config)return;
    const end=Math.min(config.total,time+count);
    for(;time<end;time++){
      if(config.mode===2&&time===config.burn)wasm._sfa_web_reset_history(state);
      const adapt=time>=config.burn?1:0;
      wasm._sfa_web_step(state,time,adapt);
      lastA=wasm._sfa_web_input_a(state,time);
      lastB=config.mode===2?wasm._sfa_web_input_b(state,time):0;
      lastY0=wasm._sfa_web_y0(state);
      lastY1=config.mode===2?wasm._sfa_web_y1(state):0;
      lastObjective=wasm._sfa_web_objective(state);
      if(![lastY0,lastY1,lastObjective].every(Number.isFinite))throw new Error("Non-finite output at Flow training step "+time);
      if(adapt){
        const a=addCorrelation(correlation1,lastA,lastY0);correlation1.value=a;
        if(config.mode===2)correlation2.value=addCorrelation(correlation2,lastB,lastY1);
        const step=time-config.burn;
        if(step%config.storeEvery===0||time===config.total-1){
          samples.one.push({t:step,y0:lastY0,y1:lastY1,f:lastObjective,c1:a,c2:correlation2.value});
        }
      }
      lastStep=time;
    }
  }
  function finishFrame() {
    updateHUD();
    drawTrace();
    drawField();
  }
  function tick() {
    if (!running) return;
    try {
      const speeds=[1,3,10,25,60,110];
      const steps=speeds[Math.max(0,Math.min(5,Number($("live-speed").value)-1))];
      advance(steps);
      finishFrame();
      if(time>=config.total){running=false;message("Complete: "+number(config.train,0)+" adaptive Flow learning steps executed locally.");syncButtons();return;}
      raf=requestAnimationFrame(tick);
    } catch(error){running=false;message(String(error.message||error),true);syncButtons();}
  }
  async function load() {
    if(runtimePromise)return runtimePromise;
    runtimePromise=(async()=>{
      if (typeof window.createFlowModule!=="function")throw new Error("Compiled Flow WebAssembly is unavailable on this deployment.");
      const module=await window.createFlowModule({locateFile:name=>"./wasm/"+name});
      const exports=["create","destroy","step","reset_history","y0","y1","objective","input_a","input_b","weight","input_count","output_count"];
      for(const name of exports)if(typeof module["_sfa_web_"+name]!=="function")throw new Error("Missing Flow WASM export: "+name);
      wasm=module;message("Flow WebAssembly ready. Choose an experiment and start training.");syncButtons();
      return module;
    })();
    return runtimePromise;
  }
  run.addEventListener("click",async()=>{
    try {
      await load();
      if(!state||time>=config.total){freeState();createState();}
      running=true;syncButtons();raf=requestAnimationFrame(tick);
    }catch(error){message(String(error.message||error),true);syncButtons();}
  });
  pause.addEventListener("click",()=>{running=false;cancelAnimationFrame(raf);message("Paused at native Flow learning step "+time+".");syncButtons();});
  single.addEventListener("click",async()=>{
    try {await load();if(!state||time>=config.total){freeState();createState();}advance(1);finishFrame();if(time>=config.total)message("Experiment finished.");}
    catch(error){message(String(error.message||error),true);syncButtons();}
  });
  reset.addEventListener("click",()=>{freeState();config=null;message("Experiment reset. Change the configuration and start a new native Flow model.");drawTrace();drawField();setIdle();});
  function setIdle() {
    $("live-phase").textContent="READY";$("live-progress").value=0;$("live-percent").textContent="0%";
    $("live-iteration").textContent="—";$("live-output").textContent="—";$("live-objective").textContent="—";
    $("live-correlation").textContent="—";$("live-sample").textContent="Input: —";
  }
  $("live-view").addEventListener("change",()=>{show=plotMode();drawTrace();});
  window.addEventListener("resize",()=>{drawTrace();drawField();});
  message("Loading native Flow WebAssembly…");
  syncButtons();drawTrace();
  load().catch(error=>{message(String(error.message||error),true);syncButtons();});
})();
