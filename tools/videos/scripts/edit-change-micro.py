"""Eight-second Change Detection: dates, NDVI, histogram, selected NDVI, labels."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

SPEC = importlib.util.spec_from_file_location('smart_fill_micro', Path(__file__).with_name('edit-smart-fill-micro.py'))
SMART = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMART)
STYLE, ROOT = SMART.STYLE, SMART.ROOT
OUT = ROOT/'tools/videos/output/change-micro-pilot-v3'
FPS, WIDTH, HEIGHT = 30,1280,720
DURATION, FRAME_COUNT = 8,240
CAPTION = 'What changed?'
DIFFERENCE_CROP = (128,608,752,959)
HISTOGRAM_CROP = (850,628,1588,750)
LEGEND_CROP = (88,928,263,959)


def shot(n):
    if n < 27:
        return 'before'
    if n < 54:
        return 'after'
    if n < 90:
        return 'difference'
    if n < 165:
        return 'histogram'
    return 'saved' if n >= 204 else 'selected_difference'


def histogram_time(n, capture):
    start,end = capture['times']['histogramStart'],capture['times']['histogramEnd']+.15
    return start+min(1,max(0,(n-90)/57))*(end-start)


def render(ffmpeg, recording):
    capture = json.loads(recording.read_text())
    assert capture['origin'] == 'http://127.0.0.1:3030'
    assert capture['theme'] == 'dark' and capture['explainerVideos'] == 'off'
    assert capture['index'] == 'NDVI' and abs(capture['threshold']+.2) < .015
    assert capture['verifiedSavedCounts'] == [0,capture['pixelsWritten']] and capture['pixelsWritten'] > 0
    assert capture['cleanupVerifiedCounts'] == [0,0]
    assert capture['times']['histogramEnd'] > capture['times']['histogramStart']
    source = Path(capture['rawVideo'])
    if not source.is_absolute():
        source = Path(recording).resolve().parent/source
    if capture.get('rawSha256'):
        assert hashlib.sha256(source.read_bytes()).hexdigest() == capture['rawSha256']
    source_frames = {'clean':round(capture['times']['cleanReady']*FPS),
                     'preview':round((capture['times']['previewReady']+.15)*FPS),
                     'saved':round((capture['times']['savedReady']+.2)*FPS)}
    histogram_wanted = {round(histogram_time(n,capture)*FPS) for n in range(90,165)}
    raw_width, raw_height = capture['rawSize']['width'],capture['rawSize']['height']
    assert (raw_width,raw_height) == (1600,972)
    OUT.mkdir(parents=True,exist_ok=True)
    decoder = subprocess.Popen([ffmpeg,'-v','error','-i',str(source),'-vf','fps=30',
        '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    originals,histograms,index = {},{},0
    while True:
        raw = decoder.stdout.read(raw_width*raw_height*3)
        if not raw:
            break
        assert len(raw) == raw_width*raw_height*3
        if index in source_frames.values() or index in histogram_wanted:
            original = Image.frombytes('RGB',(raw_width,raw_height),raw)
            if index in source_frames.values():
                originals[index] = original
            if index in histogram_wanted:
                histograms[index] = original.crop(HISTOGRAM_CROP).resize((1200,198),Image.Resampling.LANCZOS)
        index += 1
    assert decoder.wait() == 0 and set(source_frames.values()) <= originals.keys() and histogram_wanted <= histograms.keys()
    frames = {}
    for name in ['before','after','saved']:
        crop = capture['beforeCrop' if name == 'before' else 'afterCrop']
        box = (crop['x'],crop['y'],crop['x']+crop['width'],crop['y']+crop['height'])
        original = originals[source_frames['saved' if name == 'saved' else 'clean']]
        frames[name] = original.crop(box).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
    clean = originals[source_frames['clean']]
    frames['difference'] = clean.crop(DIFFERENCE_CROP).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
    # Return to the actual difference-panel preview after the drag. It shows
    # selected pixels in blue over the dimmed NDVI ramp, before Apply.
    frames['selected_difference'] = originals[source_frames['preview']].crop(DIFFERENCE_CROP).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
    # Reframe the genuine UI plot and its ramp key. The selected tail and cutoff
    # are recorded pixels; these are presentation crops, not a reconstructed plot.
    legend = clean.crop(LEGEND_CROP).resize((280,50),Image.Resampling.LANCZOS)
    frames['histogram'] = Image.new('RGB',(WIDTH,HEIGHT),STYLE.NAVY)
    sheet = Image.open(ROOT/'tools/videos/assets/micro/satellite-poses-v1.png').convert('RGBA')
    characters = []
    for half in [0,1]:
        pose = STYLE.mascot_pose(sheet,half)
        pose.thumbnail((228,201),Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA',(228,201))
        canvas.paste(pose,((228-pose.width)//2,(201-pose.height)//2))
        characters.append(canvas)
    logo = Image.open(ROOT/'web/assets/satify-logo.png').convert('RGBA')
    logo = logo.crop(logo.getbbox());logo.thumbnail((96,96),Image.Resampling.LANCZOS)
    shade = Image.new('RGBA',(WIDTH,HEIGHT));draw = ImageDraw.Draw(shade)
    for y in range(HEIGHT):
        alpha = round(170*max(0,1-y/205)**2+135*max(0,(y-590)/130)**2)
        draw.line((0,y,WIDTH,y),fill=(8,19,29,alpha))
    target = OUT/'satify-change-8s-v3.mp4'
    encoder = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30',
        '-i','pipe:0','-map','0:v','-an','-c:v','libx264','-preset','medium','-crf','18',
        '-pix_fmt','yuv420p','-t',str(DURATION),'-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    keys = {}
    for n in range(FRAME_COUNT):
        name = shot(n)
        frame = frames[name].copy()
        if name == 'histogram':
            frame.paste(histograms[round(histogram_time(n,capture)*FPS)],(40,240))
        frame.paste(shade,(0,0),shade);frame.paste(logo,(8,8),logo)
        draw = ImageDraw.Draw(frame)
        draw.text((WIDTH//2,30),CAPTION,anchor='mt',font=STYLE.font(46,True),fill=STYLE.WHITE,stroke_width=2,stroke_fill=STYLE.NAVY)
        if name in {'difference','selected_difference'}:
            # Cover the clipped original ramp key, then show that same key intact.
            draw.rectangle((0,630,WIDTH,HEIGHT),fill=STYLE.NAVY)
            frame.paste(legend,(36,574));draw = ImageDraw.Draw(frame)
        phase = {'difference':'NDVI difference','histogram':'NDVI difference histogram',
                 'selected_difference':'NDVI < −0.20'}.get(name)
        label = phase or capture['dates'][0 if name == 'before' else 1]
        half_width = 200 if phase else 94
        draw.rounded_rectangle((640-half_width,121,640+half_width,159),radius=8,fill=STYLE.NAVY)
        draw.text((640,124),label,anchor='mt',font=STYLE.font(23,True),fill=STYLE.WHITE)
        if name == 'histogram':
            hint = 'Select the decrease' if n < 147 else 'NDVI < −0.20'
            draw.text((640,474),hint,anchor='mt',font=STYLE.font(30,True),fill=STYLE.WHITE)
            # A brief graphic ring directs attention to the real boundary handle.
            if 150 <= n < 162:
                phase = (n-150)/12
                pulse = Image.new('RGBA',(WIDTH,HEIGHT));pulse_draw = ImageDraw.Draw(pulse)
                radius = 17+round(22*phase)
                pulse_draw.ellipse((380-radius,255-radius,380+radius,255+radius),
                    outline=(167,215,169,round(210*(1-phase))),width=3)
                frame.paste(pulse,(0,0),pulse);draw = ImageDraw.Draw(frame)
        draw.text((36,648),'Change detection · NDVI decrease',font=STYLE.font(24,True),
                  fill=STYLE.WHITE,stroke_width=1,stroke_fill=STYLE.NAVY)
        character = Image.blend(characters[0],characters[1],min(1,max(0,(n-204)/6)))
        frame.paste(character,(1038,506),character)
        if n in {0,26,27,53,54,89,90,120,147,164,165,183,203,204,210,239}:
            keys[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close();assert encoder.wait() == 0
    keys[0].save(OUT/'poster.jpg',quality=94)
    contact = Image.new('RGB',(1280,4*204),STYLE.NAVY);draw = ImageDraw.Draw(contact)
    for i,(n,frame) in enumerate(keys.items()):
        x,y = i%4*320,i//4*204;contact.paste(frame.resize((320,180)),(x,y))
        draw.text((x+6,y+181),f'{n/FPS:.2f}s / {n}',font=STYLE.font(13),fill=STYLE.WHITE)
    contact.save(OUT/'contact-sheet.jpg',quality=94)
    (OUT/'edit.json').write_text(json.dumps({'duration':DURATION,'fps':FPS,'frames':FRAME_COUNT,'size':[WIDTH,HEIGHT],
        'recording':str(recording.resolve()),'rawSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'origin':capture['origin'],'appVersion':capture['appVersion'],'recordedAt':capture['recordedAt'],
        'dates':capture['dates'],'sourceFrames':source_frames,'beforeCrop':capture['beforeCrop'],'afterCrop':capture['afterCrop'],
        'caption':CAPTION,'outputCutsSeconds':[.9,1.8,3,5.5,6.8],'selectedNdviHoldSeconds':1.3,'savedResultHoldSeconds':1.2,
        'differenceCrop':DIFFERENCE_CROP,'histogramCrop':HISTOGRAM_CROP,'legendCrop':LEGEND_CROP,
        'sourceHistogramWindowSeconds':[capture['times']['histogramStart'],capture['times']['histogramEnd']+.15],
        'index':capture['index'],'threshold':capture['threshold'],'verifiedSavedPixels':capture['pixelsWritten'],
        'audio':'None','note':'Sequential real footage: reference date, current date, NDVI difference, histogram drag, return to the NDVI panel with its actual selected blue mask, then saved yellow labels. The ramp key is repositioned intact. The drag is retimed and a graphic ring emphasises the final cutoff; no plot or mask is simulated. NDVI decrease does not attribute a cause.'},indent=2)+'\n')
    preview = (ROOT/'tools/videos/previews/change-micro.html').read_text(encoding='utf-8')
    (OUT/'index.html').write_text(preview.replace('../output/change-micro-pilot-v3/','./'),encoding='utf-8')
    SMART.verify(ffmpeg,target,output_dir=OUT,edit_cuts=(27,54,90,147,150,162,165,204,210),expected_frames=FRAME_COUNT)
    print(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    parser.add_argument('--recording',type=Path,required=True)
    args = parser.parse_args()
    render(args.ffmpeg,args.recording)
