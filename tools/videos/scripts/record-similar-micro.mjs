// Isolated, real local-app recording for the Select Similar micro pilot.
import {parseArgs} from 'node:util';
import {mkdir, open, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {configuration, launch, connect, readJson, writeJson, root} from './runtime.mjs';
import {setupProject, verifyAsset, resetProject} from './project.mjs';
import {chooseClass, preparePropagate} from './showcase-v2.mjs';
import {presentation, waitForCanvas} from './presentation.mjs';
import {trackEditorWrites, waitForMutation} from './editor-api.mjs';
import {countSeriesLabels} from './series-recording.mjs';

const {values} = parseArgs({options:{url:{type:'string'},project:{type:'string'},
  'expect-version':{type:'string'},inspect:{type:'boolean',default:false},
  pair:{type:'string',default:'forest-water'},trial:{type:'boolean',default:false},
  model:{type:'string',default:'logistic'},threshold:{type:'string'}}});
const pairs={
  'forest-water':{target:'Forest',negative:'Water',targetColor:'#44aa44',negativeColor:'#3399ff',
    targetPoints:[[.18,.40],[.19,.43],[.20,.46],[.21,.48]],negativePoints:[[.587,.615],[.596,.619],[.604,.628]]},
  'built-ground':{target:'Built-up',negative:'Open ground',targetColor:'#e85d5d',negativeColor:'#ffe000',
    targetPoints:[[.60,.350],[.615,.350],[.625,.348]],
    extraTargetPoints:[[.225,.866],[.24,.871],[.255,.872]],
    negativePoints:[[.244,.461],[.255,.464],[.266,.465]],threshold:.8},
  'industrial-roofs':{target:'Roofs',negative:'Bare ground',targetColor:'#e85d5d',negativeColor:'#ffe000',
    scene:'assets/industrial-scene.json',threshold:.55,
    targetPoints:[[.2392,.6706],[.2490,.6765],[.2608,.6824]],
    extraTargetStrokes:[[[.5294,.8157],[.5529,.8157],[.5784,.8157]],
      [[.4353,.6804],[.4392,.7059],[.4412,.7294]]],
    negativePoints:[[.6373,.6412],[.6667,.6569],[.6961,.6706]]},
};
const pair=pairs[values.pair];if(!pair)throw Error('Unknown example pair.');
if(!['logistic','boosting'].includes(values.model))throw Error('Unknown model.');
if(values.threshold!==undefined){pair.threshold=Number(values.threshold);if(!(pair.threshold>=0&&pair.threshold<=1))throw Error('Invalid threshold.');}
if(values.url!=='http://127.0.0.1:3030')throw Error('Explicit --url http://127.0.0.1:3030 required.');
if(!values['expect-version'])throw Error('Pass --expect-version for the intended local build.');
const config=await configuration({url:values.url,project:values.project||(pair.scene
  ?'SATIFY micro industrial roofs showcase 2026-11-12':'SATIFY micro select similar showcase 2026-11-12')});
if(pair.scene){config.scene=pair.scene;config.labels=config.labels.map(label=>({...label,
  labelName:label.color===pair.targetColor?pair.target:label.color===pair.negativeColor?pair.negative:label.labelName}));}
config.selectedLabel='Forest';
const scene=await readJson(resolve(root,config.scene));
const bytes=await verifyAsset(scene,resolve(root,'assets',scene.file));
await mkdir(config.stateDir,{recursive:true});
const lockPath=resolve(config.stateDir,'run.lock'),lock=await open(lockPath,'wx');
await lock.writeFile(String(process.pid));
const directory=resolve(root,'output',new Date().toISOString().replace(/[:.]/g,'-')+'-local-similar-micro');
await mkdir(directory,{recursive:true});
let runtime,page,recording=false,cleanup=false,state;
try{
  console.log(`Target: ${config.baseUrl} · Project: ${config.projectName}`);
  runtime=await launch(config);await connect(runtime,config);
  page=await runtime.context.newPage();await page.goto(config.baseUrl+'/');
  const version=`v${values['expect-version'].replace(/^v/,'')}`;
  await page.getByText(version,{exact:true}).waitFor();
  if(await page.evaluate(()=>localStorage.getItem('explainerVideos'))!=='off')throw Error('Tool videos must be off.');
  console.log(`Verified ${version}, Tool videos off.`);
  state=await setupProject({api:runtime.api,config,scene,bytes,state:await readJson(config.stateFile,null),
    save:async value=>{await writeJson(config.stateFile,value);await runtime.saveAuth()}});
  // A newly prepared project starts empty. Never clear an unexpected layer.
  await page.reload();await page.getByRole('button',{name:'Overview',exact:true}).click();
  const switched=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/session/switch'));
  await page.getByRole('button',{name:`Open ${config.projectName} in editor`,exact:true}).click();
  const response=await switched;
  if(!response.ok()||(await response.json()).sid!==state.sid)throw Error('Wrong recording project.');
  await page.locator('.ol-paint-host').first().waitFor();
  const frame=await preparePropagate(page,{scene,state,runtime});
  await page.locator('html[data-theme="dark"].dark').waitFor();
  const writes=trackEditorWrites(page);
  const count=color=>countSeriesLabels(page,runtime.api,{...state,sceneIds:[state.sceneId]},state.sceneId,color);
  async function saveTiles(prefix){
    const base=`/session/labeltiles/${state.sceneId}/Drawing%20Layer%201`,query=`sid=${state.sid}`;
    const listing=await runtime.api('GET',`${base}?${query}`);
    const {writeFile}=await import('node:fs/promises');
    for(const {x,y} of listing.tiles){
      const png=await runtime.api('GET',`${base}/${x}/${y}.png?${query}`,{responseType:'buffer',allowNotFound:true});
      if(png)await writeFile(resolve(directory,`${prefix}-${x}-${y}.png`),png);
    }
  }
  if(await count()!==0)throw Error('The dedicated recording layer must start empty.');
  const demo=await presentation(page,scene,frame);
  await waitForCanvas(page);await page.screenshot({path:resolve(directory,'before.png')});
  await writeJson(resolve(directory,'inspection.json'),{origin:config.baseUrl,version,frame,sceneId:state.sceneId});
  if(values.inspect){
    await page.getByRole('button',{name:'Select similar',exact:true}).click();
    await waitForCanvas(page);await page.screenshot({path:resolve(directory,'tool.png')});
    console.log((await page.locator('body').innerText()).slice(-6500));
    console.log(`Inspection: ${directory}`);
  }else{
    const requests=[],results=[],pending=[];
    page.on('response',response=>{
      if(!new URL(response.url()).pathname.includes('/similar/'))return;
      pending.push((async()=>{
        if(response.request().method()==='POST')requests.push({path:new URL(response.url()).pathname,body:response.request().postDataJSON()});
        if(response.headers()['content-type']?.includes('application/json'))results.push({path:new URL(response.url()).pathname,status:response.status(),body:await response.json()});
      })().catch(()=>{}));
    });
    const began=performance.now(),stamp=()=>Number(((performance.now()-began)/1000).toFixed(3)),times={};
    if(!values.trial){await page.screencast.start({path:resolve(directory,'capture.webm'),size:frame.viewport,fps:30});recording=true;}
    await page.waitForTimeout(600);
    await chooseClass(page,pair.target);
    cleanup=true;times.targetStart=stamp();
    await demo.stroke(pair.targetPoints,1500);
    times.targetEnd=stamp();await writes();await waitForCanvas(page);
    await page.screenshot({path:resolve(directory,'target-example.png')});
    const extraTargetStrokes=pair.extraTargetStrokes||(pair.extraTargetPoints?[pair.extraTargetPoints]:[]);
    if(extraTargetStrokes.length){
      times.extraTargetStart=stamp();
      times.extraStrokes=[];
      for(const points of extraTargetStrokes){const start=stamp();await demo.stroke(points,900);times.extraStrokes.push({start,end:stamp()});}
      times.extraTargetEnd=stamp();await writes();
    }
    await chooseClass(page,pair.negative);times.negativeStart=stamp();
    await demo.stroke(pair.negativePoints,1100);
    times.negativeEnd=stamp();await writes();await waitForCanvas(page);
    await page.screenshot({path:resolve(directory,'examples.png')});
    const examples={target:await count(pair.targetColor),negative:await count(pair.negativeColor)};
    await saveTiles('examples');
    if(examples.target<20||examples.negative<10)throw Error('Both real example classes must be saved.');
    await chooseClass(page,pair.target);
    times.toolStart=stamp();await page.getByRole('button',{name:'Select similar',exact:true}).click();
    await page.getByRole('button',{name:'Pan',exact:true}).click();
    const panel=page.getByRole('region',{name:'Select similar',exact:true});
    async function setRecordingThreshold(value=pair.threshold){
      if(value===undefined)return;
      const plot=panel.getByRole('group',{name:/^How alike each pixel/});
      await plot.scrollIntoViewIfNeeded();
      const box=await plot.boundingBox();
      const slider=panel.getByRole('slider',{name:/^At least/});
      const handle=await slider.locator('rect').first().boundingBox();
      const y=handle.y+handle.height/2;
      await page.mouse.move(handle.x+handle.width/2,y);await page.mouse.down();
      await page.mouse.move(box.x+10+value*(box.width-20),y,{steps:15});await page.mouse.up();
      await page.waitForFunction(value=>{
        const slider=document.querySelector('[role="region"][aria-label="Select similar"] [role="slider"]');
        return slider&&Math.abs(Number(slider.getAttribute('aria-valuenow'))-value)<.01;
      },value,{timeout:3000});
      const actual=Number(await slider.getAttribute('aria-valuenow'));
      return actual;
    }
    await panel.getByRole('button',{name:'Whole image',exact:true}).click();
    // Single-pixel selection keeps the learned exclusion visible independently
    // of a precomputed region boundary.
    await panel.getByRole('button',{name:'Pixels',exact:true}).click();
    await panel.getByRole('button',{name:'Update',exact:true}).waitFor({timeout:120000});
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="region"][aria-label="Select similar"] button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:120000});
    const baselineThreshold=await setRecordingThreshold();
    await page.mouse.move(1140,650);await waitForCanvas(page);times.baselineReady=stamp();
    await page.screenshot({path:resolve(directory,'baseline.png')});
    await panel.getByRole('checkbox',{name:`Avoid areas like ${pair.negative}`,exact:true}).check();
    if(values.model==='boosting'){
      await panel.getByRole('combobox',{name:'How the tool learns from your labels',exact:true}).click();
      await page.getByRole('option',{name:'Gradient boosting (slower, more flexible)',exact:true}).click();
    }
    times.findStart=stamp();await panel.getByRole('button',{name:'Update',exact:true}).click();
    await panel.getByRole('button',{name:'Apply',exact:true}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="region"][aria-label="Select similar"] button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:120000});
    const sweep=[];
    if(values.trial){
      for(const value of [.01,.05,.1,.2,.35,.5,.65,.8]){
        const actual=await setRecordingThreshold(value);await page.mouse.move(1140,650);await waitForCanvas(page);
        const text=await panel.innerText();sweep.push({threshold:actual,selection:text.match(/≈[^\n]+/)?.[0]});
        await page.screenshot({path:resolve(directory,`threshold-${value}.png`)});
      }
    }
    const threshold=await setRecordingThreshold();
    await page.mouse.move(1140,650);await waitForCanvas(page);times.previewReady=stamp();
    await page.screenshot({path:resolve(directory,'preview.png')});
    console.log((await panel.innerText()).slice(-2500));
    await page.waitForTimeout(1200);
    const saved=waitForMutation(page,'similar');times.applyStart=stamp();
    await panel.getByRole('button',{name:'Apply',exact:true}).click();
    const applied=await saved;if(!applied.ok())throw Error('Select Similar Apply failed.');
    const receipt=await applied.json();if(!(receipt.pixels_written>0))throw Error('No selection pixels were saved.');
    await writes();await waitForCanvas(page);times.savedReady=stamp();
    await page.screenshot({path:resolve(directory,'saved-stage.png')});
    await page.getByRole('button',{name:'Exit',exact:true}).click();
    await page.mouse.move(1400,650);await waitForCanvas(page);times.resultReady=stamp();
    await page.screenshot({path:resolve(directory,'result.png')});
    const savedCounts={target:await count(pair.targetColor),negative:await count(pair.negativeColor)};
    if(savedCounts.target!==examples.target+receipt.pixels_written||savedCounts.negative!==examples.negative)throw Error('Saved counts do not match the selection receipt or exclusion examples changed.');
    await saveTiles('saved');
    await page.waitForTimeout(1000);times.end=stamp();
    if(recording){await page.screencast.stop();recording=false;}await Promise.all(pending);
    await writeJson(resolve(directory,'recording.json'),{scenario:'select-similar',origin:config.baseUrl,
      appVersion:version,theme:'dark',explainerVideos:'off',project:config.projectName,sid:state.sid,
      sourceSha256:scene.sha256,frame,rawSize:frame.viewport,rawVideo:values.trial?null:resolve(directory,'capture.webm'),trial:values.trial,
      pair:values.pair,target:pair.target,negatives:[pair.negative],targetColor:pair.targetColor,negativeColor:pair.negativeColor,
      targetPoints:pair.targetPoints,extraTargetPoints:pair.extraTargetPoints,extraTargetStrokes,negativePoints:pair.negativePoints,
      model:values.model==='boosting'?'Gradient boosting':'Linear (fast)',selectAs:'Pixels',scope:'Whole image',
      examples,savedCounts,pixelsWritten:receipt.pixels_written,baselineThreshold,threshold,sweep,times,requests,results,
      recordedAt:new Date().toISOString(),published:false});
    console.log(`Recorded: ${directory} · ${receipt.pixels_written} additional ${pair.target} pixels; ${pair.negative} unchanged.`);
  }
}catch(error){
  await page?.screenshot({path:resolve(directory,'failure.png')}).catch(()=>{});
  console.error(`Diagnostics: ${directory}`);throw error;
}finally{
  try{
    if(recording)await page.screencast.stop().catch(()=>{});
    if(cleanup&&runtime){
      // Close all editor pages before resetting only this recorder's layer.
      await Promise.all(runtime.context.pages().map(p=>p.close()));
      await resetProject({api:runtime.api,config,scene,state});
      const check=await runtime.context.newPage();
      const remaining=await countSeriesLabels(check,runtime.api,{...state,sceneIds:[state.sceneId]},state.sceneId);
      if(remaining!==0)throw Error('The isolated recording layer is not empty after cleanup.');
      const manifest=await readJson(resolve(directory,'recording.json'),null);
      if(manifest)await writeJson(resolve(directory,'recording.json'),{...manifest,cleanupVerifiedCount:0});
      console.log('Reset the isolated recording layer and verified zero remaining labels.');
    }
  }finally{try{await runtime?.close()}
  finally{await lock.close();await unlink(lockPath)}
  }
}
