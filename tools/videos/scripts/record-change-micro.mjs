// Local-only preparation and capture for the short Change Detection pilot.
import {parseArgs} from 'node:util';
import {mkdir,open,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {configuration,launch,connect,readJson,writeJson,root} from './runtime.mjs';
import {verifyAsset} from './project.mjs';
import {setupSeriesProject} from './series-project.mjs';
import {tidy} from './showcase-v2.mjs';
import {waitForCanvas} from './presentation.mjs';
import {waitForMutation,trackEditorWrites} from './editor-api.mjs';
import {countSeriesLabels} from './series-recording.mjs';

const {values}=parseArgs({options:{url:{type:'string'},project:{type:'string'},
  'expect-version':{type:'string'},prepare:{type:'boolean',default:false},inspect:{type:'boolean',default:false},
  histogram:{type:'boolean',default:false}}});
if(values.url!=='http://127.0.0.1:3030')throw Error('Explicit --url http://127.0.0.1:3030 required.');
if(!values['expect-version'])throw Error('Pass --expect-version for the intended local build.');
const config=await configuration({url:values.url,dataset:'time-series',
  project:values.project||'SATIFY micro change showcase 2026-11-12'});
config.scenes=config.scenes.slice(1);
config.labels=[{id:1,labelName:'NDVI decrease',color:'#ffe000'}];
config.selectedLabel='NDVI decrease';
const assets=await Promise.all(config.scenes.map(async path=>{
  const scene=await readJson(resolve(root,path));
  return {scene,bytes:await verifyAsset(scene,resolve(root,dirname(path),scene.file))};
}));
await mkdir(config.stateDir,{recursive:true});
const lockPath=resolve(config.stateDir,'run.lock');
const lock=await open(lockPath,'wx');await lock.writeFile(String(process.pid));
const directory=resolve(root,'output',new Date().toISOString().replace(/[:.]/g,'-')+'-local-change-micro');
await mkdir(directory,{recursive:true});
let runtime,page,recording=false,applied=false,state;
try{
  console.log(`Target: ${config.baseUrl} · Project: ${config.projectName}`);
  runtime=await launch(config);await connect(runtime,config);
  page=await runtime.context.newPage();await page.goto(config.baseUrl+'/');
  const version=`v${values['expect-version'].replace(/^v/,'')}`;
  await page.getByText(version,{exact:true}).waitFor();
  if(await page.evaluate(()=>localStorage.getItem('explainerVideos'))!=='off')throw Error('Tool videos must be off.');
  console.log(`Verified ${version}, dark mode, Tool videos off.`);
  state=await setupSeriesProject({api:runtime.api,config,assets,state:await readJson(config.stateFile,null),
    save:async value=>{await writeJson(config.stateFile,value);await runtime.saveAuth()}});
  if(values.prepare){console.log('Managed local two-date project is ready.');}
  else{
    await page.setViewportSize({width:1600,height:972});await page.reload();
    await page.getByRole('button',{name:'Overview',exact:true}).click();
    const switched=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/session/switch'));
    await page.getByRole('button',{name:`Open ${config.projectName} in editor`,exact:true}).click();
    const response=await switched;
    if(!response.ok()||(await response.json()).sid!==state.sid)throw Error('Wrong recording project.');
    await page.locator('.ol-paint-host').first().waitFor();
    await page.getByRole('combobox',{name:'Current file',exact:true}).selectOption({label:'[2] Coastal farmland 2022-09-04'});
    await tidy(page);await page.getByRole('button',{name:'Fit image',exact:true}).click();
    await waitForCanvas(page);
    await page.getByRole('button',{name:'Change detection',exact:true}).click();
    await page.getByRole('combobox',{name:'Reference image',exact:true}).selectOption(state.sceneIds[0]);
    await page.getByRole('combobox',{name:'Index',exact:true}).selectOption('NDVI');
    await page.getByRole('button',{name:'Viewport',exact:true}).click();
    await page.getByRole('checkbox',{name:'Show all',exact:true}).uncheck();
    // All maps share the actual app camera. Zoom towards the farmland, away
    // from tidal changes, before choosing an aligned landscape crop.
    await page.mouse.move(340,260);await page.mouse.wheel(0,-300);
    await page.waitForTimeout(1600);
    const bar=page.getByRole('slider',{name:/^Boundary 1/});
    const handle=await bar.locator('rect').first().boundingBox();
    const plot=await page.getByRole('group',{name:/^Histogram of the difference/}).boundingBox();
    const lo=Number(await bar.getAttribute('aria-valuemin'));
    const hi=Number(await bar.getAttribute('aria-valuemax'));
    const before=Number(await bar.getAttribute('aria-valuenow'));
    const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    const initialThreshold=values.histogram?0:-.2;
    await page.mouse.move(start.x+(initialThreshold-before)/(hi-lo)*(plot.width-20),start.y,{steps:20});
    await page.mouse.up();await page.mouse.move(1000,550);
    await page.waitForTimeout(2000);
    const count=folder=>countSeriesLabels(page,runtime.api,state,folder,'#ffe000');
    if((await Promise.all(state.sceneIds.map(count))).some(n=>n!==0))throw Error('Preserve existing labels; managed dates must be empty.');
    let threshold=Number(await bar.getAttribute('aria-valuenow'));
    if(Math.abs(threshold-initialThreshold)>.015)throw Error('Unexpected initial NDVI threshold.');
    await page.locator('html[data-theme="dark"].dark').waitFor();
    await waitForCanvas(page);
    await page.screenshot({path:resolve(directory,'before.png')});
    if(values.inspect){console.log(`Inspection: ${directory}`);}
    else{
      const writesFinished=trackEditorWrites(page);
      const began=performance.now();const stamp=()=>Number(((performance.now()-began)/1000).toFixed(3));
      await page.screencast.start({path:resolve(directory,'capture.webm'),size:{width:1600,height:972},fps:30});recording=true;
      await page.waitForTimeout(600);const cleanReady=stamp();
      await page.waitForTimeout(700);
      await page.getByRole('checkbox',{name:'Show Range 1',exact:true}).check();
      await page.getByRole('list',{name:'Ranges',exact:true}).getByRole('button',{name:/^Range 1 /}).click();
      await page.mouse.move(1000,550);
      const apply=page.getByRole('button',{name:'Apply to image',exact:true});
      await apply.waitFor();await apply.click({trial:true});
      let histogramStart,histogramEnd;
      const histogramThresholds=[];
      if(values.histogram){
        await waitForCanvas(page);
        const handle=await bar.locator('rect').first().boundingBox();
        const plot=await page.getByRole('group',{name:/^Histogram of the difference/}).boundingBox();
        const initial=Number(await bar.getAttribute('aria-valuenow'));
        const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
        const travel=(-.2-initial)/(hi-lo)*(plot.width-20);
        await page.mouse.move(x,y);histogramStart=stamp();await page.mouse.down();
        for(let i=1;i<=40;i++){
          await page.mouse.move(x+travel*i/40,y);
          histogramThresholds.push({time:stamp(),value:Number(await bar.getAttribute('aria-valuenow'))});
          await page.waitForTimeout(40);
        }
        await page.mouse.up();histogramEnd=stamp();
        threshold=Number(await bar.getAttribute('aria-valuenow'));
        if(Math.abs(threshold+.2)>.015)throw Error('Expected final NDVI cutoff near -0.2.');
        await page.mouse.move(1000,550);
      }
      await waitForCanvas(page);const previewReady=stamp();
      await page.waitForTimeout(800);
      const saved=waitForMutation(page,'convey');const applyStart=stamp();
      await apply.click();const response=await saved;
      if(!response.ok())throw Error('Change labels could not be saved.');
      const receipt=await response.json();
      if(!(receipt.pixels_written>0))throw Error('No changed pixels were saved.');
      applied=true;await writesFinished();
      await page.getByRole('status').filter({hasText:/pixels labelled NDVI decrease/}).waitFor();
      const counts=await Promise.all(state.sceneIds.map(count));
      if(counts[1]!==receipt.pixels_written||counts[0]!==0)throw Error('Apply receipt and saved date counts differ.');
      await page.mouse.move(1000,550);await waitForCanvas(page);const savedReady=stamp();
      await page.waitForTimeout(1200);const end=stamp();
      await page.screencast.stop();recording=false;
      await page.screenshot({path:resolve(directory,'poster.png')});
      await writeJson(resolve(directory,'recording.json'),{scenario:'change-detection',origin:config.baseUrl,
        appVersion:version,theme:'dark',explainerVideos:'off',project:config.projectName,sid:state.sid,
        dates:assets.map(a=>a.scene.acquisition_date),sourceSha256:assets.map(a=>a.scene.sha256),
        sceneIds:state.sceneIds,index:'NDVI',threshold,label:'NDVI decrease',color:'#ffe000',scope:'Viewport',
        pixelsWritten:receipt.pixels_written,verifiedSavedCounts:counts,
        beforeCrop:{x:888,y:180,width:624,height:351},afterCrop:{x:128,y:180,width:624,height:351},
        rawVideo:resolve(directory,'capture.webm'),rawSize:{width:1600,height:972},
        times:{cleanReady,histogramStart,histogramEnd,previewReady,applyStart,savedReady,end},histogramThresholds,
        recordedAt:new Date().toISOString(),published:false});
      console.log(`Recorded ${directory} · ${counts[1]} verified saved NDVI-decrease pixels.`);
    }
  }
}catch(error){
  await page?.screenshot({path:resolve(directory,'failure.png')}).catch(()=>{});
  console.error(`Diagnostics: ${directory}`);throw error;
}finally{
  try{
    if(recording)await page.screencast.stop().catch(()=>{});
    if(applied){
      await page.getByRole('button',{name:/^Undo/}).click();
      let clean=false;
      for(let n=0;n<60;n++){
        const counts=await Promise.all(state.sceneIds.map(id=>countSeriesLabels(page,runtime.api,state,id)));
        if(counts.every(value=>value===0)){clean=true;break}await page.waitForTimeout(200);
      }
      if(!clean)throw Error('Recorded labels could not be undone to empty.');
      const manifest=await readJson(resolve(directory,'recording.json'),null);
      if(manifest)await writeJson(resolve(directory,'recording.json'),{...manifest,cleanupVerifiedCounts:state.sceneIds.map(()=>0)});
      console.log('Undid the recording operation and verified both dates are empty.');
    }
  }finally{try{await runtime?.close()}finally{await lock.close();await unlink(lockPath)}}
}
