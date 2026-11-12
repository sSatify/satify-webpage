"""Silent five-second Select Similar pilot from a verified local capture."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

SPEC = importlib.util.spec_from_file_location('smart_micro', Path(__file__).with_name('edit-smart-fill-micro.py'))
SMART = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMART)
STYLE, ROOT = SMART.STYLE, SMART.STYLE.ROOT
OUT = ROOT/'tools/videos/output/similar-micro-pilot-v1'
FPS, WIDTH, HEIGHT = 30, 1280, 720
# Same geography throughout. Only the original single-image view is used:
# source strokes followed by the saved result, with no workspace resize cut.
CROP = (420, 300, 1140, 705)


def source_time(n, capture):
    times = capture['times']
    target_start = times.get('targetStart',times.get('forestStart'))
    target_end = times.get('targetEnd',times.get('forestEnd'))
    negative_start = times.get('negativeStart',times.get('waterStart'))
    negative_end = times.get('negativeEnd',times.get('waterEnd'))
    if n < 9:
        return .3
    if n < 54:
        return target_start+.65+(n-9)/44*(target_end-target_start-.72)
    if n < 93:
        return negative_start+.65+(n-54)/38*(negative_end-negative_start-.72)
    if n < 99:
        return negative_end+.15
    return times['resultReady']+.2


def render(ffmpeg, capture_path):
    global OUT, CROP
    capture = json.loads(capture_path.read_text())
    assert not capture.get('trial'), 'Still trials must pass visual review before recording and editing.'
    built_ground = capture.get('pair') == 'built-ground'
    if built_ground:
        OUT = ROOT/'tools/videos/output/similar-micro-pilot-v2'
        CROP = (510,250,1230,655)
    assert capture['origin'] == 'http://127.0.0.1:3030'
    assert capture['theme'] == 'dark' and capture['explainerVideos'] == 'off'
    target_key = 'target' if 'target' in capture['examples'] else 'forest'
    negative_key = 'negative' if 'negative' in capture['examples'] else 'water'
    assert capture['savedCounts'][target_key] == capture['examples'][target_key]+capture['pixelsWritten']
    assert capture['savedCounts'][negative_key] == capture['examples'][negative_key]
    runs = [r['body'] for r in capture['requests'] if r['body'].get('action') == 'similar-run']
    negative_color = capture.get('negativeColor','#3399ff')
    assert any(r['body'].get('negatives') == [{'color':negative_color}] for r in runs)
    source = Path(capture['rawVideo'])
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = {round(source_time(n, capture)*FPS) for n in range(150)}
    decoder = subprocess.Popen([ffmpeg, '-v', 'error', '-i', str(source), '-vf', 'fps=30',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
    frames, index = {}, 0
    source_width, source_height = capture['rawSize']['width'], capture['rawSize']['height']
    while True:
        raw = decoder.stdout.read(source_width*source_height*3)
        if not raw:
            break
        assert len(raw) == source_width*source_height*3
        if index in wanted:
            frame = Image.frombytes('RGB', (source_width, source_height), raw)
            frames[index] = frame.crop(CROP).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        index += 1
    assert decoder.wait() == 0 and wanted <= frames.keys()

    sheet = Image.open(ROOT/'tools/videos/assets/micro/satellite-poses-v1.png').convert('RGBA')
    characters = []
    for half in [0,1]:
        pose = STYLE.mascot_pose(sheet, half)
        pose.thumbnail((228,201), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (228,201))
        canvas.paste(pose, ((228-pose.width)//2, (201-pose.height)//2))
        characters.append(canvas)
    logo = Image.open(ROOT/'web/assets/satify-logo.png').convert('RGBA')
    logo = logo.crop(logo.getbbox()); logo.thumbnail((96,96), Image.Resampling.LANCZOS)
    shade = Image.new('RGBA', (WIDTH, HEIGHT)); draw = ImageDraw.Draw(shade)
    for y in range(HEIGHT):
        alpha = round(170*max(0,1-y/170)**2+135*max(0,(y-590)/130)**2)
        draw.line((0,y,WIDTH,y), fill=(8,19,29,alpha))

    target = OUT/('satify-similar-5s-v2.mp4' if built_ground else 'satify-similar-5s-v1.mp4')
    encoder = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30',
        '-i','pipe:0','-map','0:v','-an','-c:v','libx264','-preset','medium','-crf','18',
        '-pix_fmt','yuv420p','-t','5','-movflags','+faststart',str(target)], stdin=subprocess.PIPE)
    keys = {}
    for n in range(150):
        frame = frames[round(source_time(n,capture)*FPS)].copy()
        frame.paste(shade,(0,0),shade); frame.paste(logo,(8,8),logo)
        draw = ImageDraw.Draw(frame)
        title = 'Find these.' if n < 54 else 'Ignore those.' if n < 99 else 'Label the matches.'
        draw.text((WIDTH//2,30),title,anchor='mt',font=STYLE.font(46,True),fill=STYLE.WHITE,stroke_width=2,stroke_fill=STYLE.NAVY)
        draw.text((36,648),'Select Similar · Experimental',font=STYLE.font(24,True),
                  fill=STYLE.WHITE,stroke_width=1,stroke_fill=STYLE.NAVY)
        # Labels identify the examples in place. Their position never moves.
        # These are edit annotations; the strokes and final raster are real.
        def tag(x,y,text,color):
            font = STYLE.font(23,True)
            box = draw.textbbox((x+12,y+7),text,font=font)
            draw.rounded_rectangle((x,y,box[2]+12,box[3]+7),radius=7,fill=STYLE.NAVY,outline=color,width=2)
            draw.text((x+12,y+7),text,font=font,fill=STYLE.WHITE)
        if built_ground:
            tag(718,158,'Built-up', '#ff9999')
        else:
            tag(118,150,'Forest', '#75d773')
        if n >= 54:
            # Above the pond, away from Saty in the bottom-right corner.
            if built_ground:
                tag(118,338,'Bare ground', '#ffe000')
            else:
                tag(832,485,'Water', '#64b7ff')
        happy = min(1,max(0,(n-99)/6))
        character = Image.blend(characters[0],characters[1],happy)
        frame.paste(character,(1038,506),character)
        if n in {0,9,24,39,53,54,69,84,92,98,99,105,120,149}:
            keys[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close(); assert encoder.wait() == 0
    keys[24].save(OUT/'poster.jpg',quality=94)
    keys[84].save(OUT/'negative-review.png')
    keys[120].save(OUT/'result-review.png')
    contact = Image.new('RGB',(1280,4*204),STYLE.NAVY); draw = ImageDraw.Draw(contact)
    for i,(n,frame) in enumerate(keys.items()):
        x,y = i%4*320,i//4*204
        contact.paste(frame.resize((320,180)),(x,y))
        draw.text((x+6,y+181),f'{n/FPS:.2f}s / {n}',font=STYLE.font(13),fill=STYLE.WHITE)
    contact.save(OUT/'contact-sheet.jpg',quality=94)
    (OUT/'edit.json').write_text(json.dumps({'duration':5,'fps':30,'frames':150,'size':[WIDTH,HEIGHT],
        'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'origin':capture['origin'],'appVersion':capture['appVersion'],'recordedAt':capture['recordedAt'],
        'crop':CROP,'audio':'none','experimental':True,'target':capture['target'],'negatives':capture['negatives'],
        'examples':capture['examples'],'savedCounts':capture['savedCounts'],'pixelsWritten':capture['pixelsWritten'],
        'threshold':capture.get('threshold'),'beatsSeconds':{'target':.3,'negative':1.8,'savedResult':3.3},
        'extraTargetPoints':capture.get('extraTargetPoints'),
        'note':'Real recorded strokes and saved output. Class choices, learning and saving waits are cut. A fixed crop preserves the camera. Saty and the logo remain visible. No synthetic label pixels.'
            + (' A second recorded roof example below the crop is also used for learning.' if capture.get('extraTargetPoints') else '')},indent=2)+'\n')
    SMART.verify(ffmpeg,target,output_dir=OUT,edit_cuts=(9,54,93,99,105))
    print(target)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture',type=Path)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    args=parser.parse_args()
    render(args.ffmpeg,args.capture)
