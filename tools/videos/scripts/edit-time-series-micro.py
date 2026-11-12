"""Five-second silent Sync labelling edit from the verified three-date capture."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageOps

SPEC = importlib.util.spec_from_file_location('smart_fill_micro', Path(__file__).with_name('edit-smart-fill-micro.py'))
SMART = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMART)
STYLE = SMART.STYLE
ROOT = STYLE.ROOT
OUT = ROOT/'tools/videos/output/time-series-micro-pilot-v2'
FPS, WIDTH, HEIGHT = 30, 1280, 720
DATES = ['2021-09-01', '2022-08-15', '2022-09-04']
# Matching positions within the three recorded panes. The coastal crops exclude
# controls and old captions, preserving each date's own imagery and saved mask.
CROPS = [(384,350,582,684), (888,350,1086,684), (1396,350,1594,684)]
STARTS, WIDTHS = [0,426,853], [426,427,427]


def source_time(n):
    # Jump over pending/hover states: both target dates arrive together.
    # Every pane still comes from the same real source frame at each beat.
    if n < 18:
        return 6.25
    if n < 27:
        return 6.4
    if n < 60:
        return 7.1
    if n < 72:
        return 17.2
    if n < 99:
        return 18.0
    return 20.8


def render(ffmpeg):
    OUT.mkdir(parents=True, exist_ok=True)
    source = ROOT/'web/assets/videos/time-series.mp4'
    provenance = next(item for item in json.loads((source.parent/'recordings.json').read_text())
                      if item['scenario'] == 'time-series')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == provenance['sha256']
    for label in ['Water', 'Seagrass']:
        assert len(provenance['verifiedClasses'][label]) == 3
        assert all(count > 0 for count in provenance['verifiedClasses'][label])
    assert provenance['theme'] == 'dark' and provenance['explainerVideos'] == 'off'
    wanted = {round(source_time(n)*FPS) for n in range(150)}
    decoder = subprocess.Popen([ffmpeg,'-v','error','-i',str(source),'-vf','fps=30',
        '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    frames, index = {}, 0
    while True:
        raw = decoder.stdout.read(1600*900*3)
        if not raw:
            break
        assert len(raw) == 1600*900*3
        if index in wanted:
            original = Image.frombytes('RGB',(1600,900),raw)
            frame = Image.new('RGB',(WIDTH,HEIGHT))
            for crop, start, width in zip(CROPS,STARTS,WIDTHS):
                image = ImageOps.fit(original.crop(crop),(width,HEIGHT),method=Image.Resampling.LANCZOS)
                frame.paste(image,(start,0))
            frames[index] = frame
        index += 1
    assert decoder.wait() == 0 and wanted <= frames.keys()
    sheet = Image.open(ROOT/'tools/videos/assets/micro/satellite-poses-v1.png').convert('RGBA')
    characters = []
    for half in [0,1]:
        pose = STYLE.mascot_pose(sheet,half)
        pose.thumbnail((228,201),Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA',(228,201))
        canvas.paste(pose,((228-pose.width)//2,(201-pose.height)//2))
        characters.append(canvas)
    logo = Image.open(ROOT/'web/assets/satify-logo.png').convert('RGBA')
    logo = logo.crop(logo.getbbox()); logo.thumbnail((96,96),Image.Resampling.LANCZOS)
    shade = Image.new('RGBA',(WIDTH,HEIGHT)); draw = ImageDraw.Draw(shade)
    for y in range(HEIGHT):
        alpha = round(170*max(0,1-y/205)**2+135*max(0,(y-590)/130)**2)
        draw.line((0,y,WIDTH,y),fill=(8,19,29,alpha))
    target = OUT/'satify-time-series-5s-v2.mp4'
    encoder = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30',
        '-i','pipe:0','-map','0:v','-an','-c:v','libx264','-preset','medium',
        '-crf','18','-pix_fmt','yuv420p','-t','5','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    keys = {}
    for n in range(150):
        frame = frames[round(source_time(n)*FPS)].copy()
        # Emphasise the real Water / first Seagrass seed locations.
        pulse_start = 18 if n < 60 else 60
        if pulse_start <= n < pulse_start+12:
            phase = (n-pulse_start)/12
            cx,cy = (49,512) if n < 60 else (77,295)
            pulse = Image.new('RGBA',(WIDTH,HEIGHT)); draw = ImageDraw.Draw(pulse)
            radius = 18+round(30*phase)
            draw.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),
                         outline=(255,255,255,round(220*(1-phase))),width=3)
            if n < pulse_start+4:
                draw.ellipse((cx-6,cy-6,cx+6,cy+6),fill=(255,204,51,180))
            frame.paste(pulse,(0,0),pulse)
        frame.paste(shade,(0,0),shade); frame.paste(logo,(8,8),logo)
        draw = ImageDraw.Draw(frame)
        draw.line((426,0,426,720),fill='#48616e',width=1)
        draw.line((853,0,853,720),fill='#48616e',width=1)
        caption = 'Label once. Sync across dates.'
        title_font = STYLE.font(46,True)
        bounds = draw.textbbox((WIDTH//2,30),caption,anchor='mt',font=title_font)
        assert bounds[0]>120 and bounds[2]<WIDTH-24,bounds
        draw.text((WIDTH//2,30),caption,anchor='mt',font=title_font,fill=STYLE.WHITE,stroke_width=2,stroke_fill=STYLE.NAVY)
        # Dates remain fixed, matching the originals; no additional step labels.
        for date,start,width in zip(DATES,STARTS,WIDTHS):
            center = start+width//2
            draw.rounded_rectangle((center-94,121,center+94,159),radius=8,fill=STYLE.NAVY)
            draw.text((center,124),date,anchor='mt',font=STYLE.font(23,True),fill=STYLE.WHITE)
        draw.text((36,648),'Sync labelling · Water + Seagrass',font=STYLE.font(24,True),fill=STYLE.WHITE,stroke_width=1,stroke_fill=STYLE.NAVY)
        happy = min(1,max(0,(n-99)/6))
        character = Image.blend(characters[0],characters[1],happy)
        frame.paste(character,(1038,506),character)
        if n in {0,12,17,18,26,27,48,59,60,71,72,90,98,99,120,149}:
            keys[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close(); assert encoder.wait() == 0
    keys[120].save(OUT/'poster.jpg',quality=94)
    contact = Image.new('RGB',(1280,4*204),STYLE.NAVY); draw = ImageDraw.Draw(contact)
    for i,(n,frame) in enumerate(keys.items()):
        x,y=i%4*320,i//4*204;contact.paste(frame.resize((320,180)),(x,y))
        draw.text((x+6,y+181),f'{n/FPS:.2f}s / {n}',font=STYLE.font(13),fill=STYLE.WHITE)
    contact.save(OUT/'contact-sheet.jpg',quality=94)
    (OUT/'edit.json').write_text(json.dumps({'duration':5,'fps':30,'frames':150,'size':[1280,720],
        'source':str(source.relative_to(ROOT)),'sourceSha256':provenance['sha256'],
        'origin':provenance['origin'],'appVersion':provenance['appVersion'],'recordedAt':provenance['recordedAt'],
        'workflow':'Recorded Water and Seagrass fills, synchronised across three dates',
        'dates':DATES,'verifiedWaterPixelsByDate':provenance['verifiedClasses']['Water'],
        'verifiedSeagrassPixelsByDate':provenance['verifiedClasses']['Seagrass'],
        'sourceSnapshotSeconds':[6.25,6.4,7.1,17.2,18.0,20.8],
        'outputBeatsSeconds':{'waterSource':.6,'waterTargetsTogether':.9,
            'seagrassSource':2,'seagrassTargetsTogether':2.4,'finalSeagrassInterior':3.3},'crops':CROPS,
        'caption':caption,'audio':'None; silent at the owner’s request',
        'cursorEmphasis':'Pulses over the recorded Water and first Seagrass seed locations.',
        'note':'All panes use the same source frame at each beat. Jump cuts omit pending states so both targets appear together. Labels are actual recorded results; playback timing is edited.'},indent=2)+'\n')
    preview=(ROOT/'tools/videos/previews/time-series-micro.html').read_text(encoding='utf-8')
    (OUT/'index.html').write_text(preview.replace('../output/time-series-micro-pilot-v2/','./'),encoding='utf-8')
    SMART.verify(ffmpeg,target,output_dir=OUT,edit_cuts=(18,27,30,60,72,99,105))
    print(target)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    render(parser.parse_args().ffmpeg)
