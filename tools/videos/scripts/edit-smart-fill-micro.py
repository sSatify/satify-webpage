"""Five-second Global-only Smart Fill edit, using the verified existing capture."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw

SPEC = importlib.util.spec_from_file_location('roads_micro', Path(__file__).with_name('edit-roads-micro.py'))
STYLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STYLE)
ROOT = STYLE.ROOT
OUT = ROOT/'tools/videos/output/smart-fill-micro-pilot-v1'
FPS, WIDTH, HEIGHT = 30, 1280, 720


def source_time(n):
    if n < 36:
        return 13.25
    if n < 72:
        return 13.25 + (n-36)/36*.1
    if n < 120:
        return 13.35 + (n-72)/48*.55
    return 14.1


def verify(ffmpeg, target, *, output_dir=OUT, edit_cuts=(36, 48, 72, 120, 126), expected_frames=150):
    cuts = list(edit_cuts)
    decoder = subprocess.Popen([ffmpeg, '-v', 'error', '-i', str(target), '-vf', 'scale=640:360',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
    frames, changes, previous = [], [], None
    while True:
        raw = decoder.stdout.read(640*360*3)
        if not raw:
            break
        assert len(raw) == 640*360*3
        frame = Image.frombytes('RGB', (640, 360), raw)
        assert frame.convert('L').getextrema()[1] > 100
        pixels = np.asarray(frame.resize((160, 90)), dtype=np.int16)[15:65]
        if previous is not None:
            delta = float(np.abs(pixels-previous).mean())
            if delta > .8:
                changes.append((len(frames), round(delta, 3)))
        previous = pixels
        frames.append(frame)
    assert decoder.wait() == 0 and len(frames) == expected_frames
    for n, _score in sorted(changes, key=lambda item: -item[1]):
        if all(abs(n-cut)>4 for cut in cuts):
            cuts.append(n)
    for cut in cuts:
        sheet = Image.new('RGB', (1920, 1170), STYLE.NAVY)
        draw = ImageDraw.Draw(sheet)
        for i, n in enumerate(range(max(0, cut-4), min(expected_frames, cut+5))):
            x, y = i%3*640, i//3*390
            sheet.paste(frames[n], (x,y))
            draw.text((x+8,y+362), f'Frame {n} / {n/FPS:.3f}s', font=STYLE.font(18), fill=STYLE.WHITE)
        sheet.save(output_dir/f'cut-{cut}.jpg', quality=94)
    sheet = Image.new('RGB', (2560, ((expected_frames+9)//10)*162), STYLE.NAVY)
    draw = ImageDraw.Draw(sheet)
    for n, frame in enumerate(frames):
        x, y = n%10*256, n//10*162
        sheet.paste(frame.resize((256,144)), (x,y))
        draw.text((x+5,y+145),f'{n} / {n/FPS:.2f}s',font=STYLE.font(12),fill=STYLE.WHITE)
    sheet.save(output_dir/'all-frames.jpg', quality=95)
    (output_dir/'verification.json').write_text(json.dumps({'decodedFrames':len(frames),'decodeErrors':0,
        'blackFrames':0,'cutSequences':sorted(cuts),'imageChanges':changes},indent=2)+'\n')


def render(ffmpeg):
    OUT.mkdir(parents=True, exist_ok=True)
    source = ROOT/'tools/videos/assets/sources/smart-fill.mp4'
    provenance = next(item for item in json.loads((source.parent/'recordings.json').read_text())
                      if item['scenario'] == 'smart-fill')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == provenance['sha256']
    assert provenance['verifiedModes']['Global'] > 0
    assert provenance['theme'] == 'dark' and provenance['explainerVideos'] == 'off'
    wanted = {round(source_time(n)*FPS) for n in range(150)}
    decoder = subprocess.Popen([ffmpeg,'-v','error','-i',str(source),
        '-vf','fps=30,crop=896:504:0:90,scale=1280:720','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    frames, index = {}, 0
    while True:
        raw = decoder.stdout.read(WIDTH*HEIGHT*3)
        if not raw:
            break
        assert len(raw) == WIDTH*HEIGHT*3
        if index in wanted:
            frames[index] = Image.frombytes('RGB',(WIDTH,HEIGHT),raw)
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
        alpha = round(165*max(0,1-y/170)**2 + 135*max(0,(y-590)/130)**2)
        draw.line((0,y,WIDTH,y),fill=(8,19,29,alpha))
    target = OUT/'satify-smart-fill-5s-v1.mp4'
    encoder = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30',
        '-i','pipe:0','-map','0:v','-an','-c:v','libx264','-preset','medium',
        '-crf','18','-pix_fmt','yuv420p','-t','5','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    keys = {}
    for n in range(150):
        frame = frames[round(source_time(n)*FPS)].copy()
        # Emphasise the actual recorded click location without altering image labels.
        if 36 <= n < 48:
            phase = (n-36)/12
            pulse = Image.new('RGBA',(WIDTH,HEIGHT))
            pulse_draw = ImageDraw.Draw(pulse)
            radius = 16+round(34*phase)
            pulse_draw.ellipse((210-radius,270-radius,210+radius,270+radius),
                               outline=(255,255,255,round(220*(1-phase))),width=3)
            if n < 40:
                pulse_draw.ellipse((204,264,216,276),fill=(255,204,51,180))
            frame.paste(pulse,(0,0),pulse)
        frame.paste(shade,(0,0),shade); frame.paste(logo,(8,8),logo)
        draw = ImageDraw.Draw(frame)
        caption = 'Click once. Label matching forest patches.'
        title_font = STYLE.font(42,True)
        bounds = draw.textbbox((WIDTH//2,30),caption,anchor='mt',font=title_font)
        assert bounds[0]>120 and bounds[2]<WIDTH-24,bounds
        draw.text((WIDTH//2,30),caption,anchor='mt',font=title_font,fill=STYLE.WHITE,stroke_width=2,stroke_fill=STYLE.NAVY)
        draw.text((36,648),'Smart Fill · Global',font=STYLE.font(24,True),fill=STYLE.WHITE,stroke_width=1,stroke_fill=STYLE.NAVY)
        happy = min(1,max(0,(n-120)/6))
        character = Image.blend(characters[0],characters[1],happy)
        frame.paste(character,(1038,506),character)
        if n in {0,18,35,36,40,47,48,71,72,84,96,119,120,126,138,149}:
            keys[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close(); assert encoder.wait() == 0
    keys[18].save(OUT/'poster.jpg',quality=94)
    contact = Image.new('RGB',(1280,4*204),STYLE.NAVY); draw = ImageDraw.Draw(contact)
    for i,(n,frame) in enumerate(keys.items()):
        x,y=i%4*320,i//4*204;contact.paste(frame.resize((320,180)),(x,y))
        draw.text((x+6,y+181),f'{n/FPS:.2f}s / {n}',font=STYLE.font(13),fill=STYLE.WHITE)
    contact.save(OUT/'contact-sheet.jpg',quality=94)
    (OUT/'edit.json').write_text(json.dumps({'duration':5,'fps':30,'frames':150,'size':[1280,720],
        'source':str(source.relative_to(ROOT)),'sourceSha256':provenance['sha256'],
        'origin':provenance['origin'],'appVersion':provenance['appVersion'],'recordedAt':provenance['recordedAt'],
        'scope':'Global only','verifiedGlobalPixels':provenance['verifiedModes']['Global'],
        'sourceWindowSeconds':[13.25,14.1],'crop':[0,90,896,504],
        'cursorEmphasis':'Pulse over the recorded click at (210,270); image and label pixels are from the original capture.',
        'caption':'Click once. Label matching forest patches.','audio':'None; silent at the owner’s request',
        'note':'Real recorded Global action and labels. Controls and existing captions cropped out. No generated data or labels.'},indent=2)+'\n')
    preview=(ROOT/'tools/videos/previews/smart-fill-micro.html').read_text(encoding='utf-8')
    (OUT/'index.html').write_text(preview.replace('../output/smart-fill-micro-pilot-v1/','./'),encoding='utf-8')
    verify(ffmpeg,target)
    print(target)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    render(parser.parse_args().ffmpeg)
