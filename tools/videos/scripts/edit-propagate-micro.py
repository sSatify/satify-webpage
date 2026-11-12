"""Five-second silent Propagate labels pilot from the selected real capture."""
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
STYLE = SMART.STYLE
ROOT = STYLE.ROOT
OUT = ROOT/'tools/videos/output/propagate-micro-pilot-v2'
FPS, WIDTH, HEIGHT = 30, 1280, 720
CAPTION = 'Teach a little. Label a lot.'
# A single landscape image containing the visible Forest, Water and Built-up
# examples. The Propagate workspace shifts the map by (-177, +24) source pixels;
# compensate in the crop to keep the geography fixed at the saved-result cut.
EXAMPLES_CROP = (420,210,1140,615)
RESULT_CROP = (243,234,963,639)


def source_time(n):
    if n < 15:
        return .3
    if n < 46:
        return 4.7+(n-15)/30*1.5
    if n < 77:
        return 10.2+(n-46)/30*1.4
    if n < 108:
        return 14.9+(n-77)/30*1.6
    if n < 114:
        return 16.5
    return 23.5


def render(ffmpeg):
    OUT.mkdir(parents=True,exist_ok=True)
    source = ROOT/'web/assets/videos/propagate.mp4'
    provenance = next(item for item in json.loads((source.parent/'recordings.json').read_text())
                      if item['scenario'] == 'propagate')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == provenance['sha256']
    assert provenance['theme'] == 'dark'
    assert (provenance['width'],provenance['height']) == (1600,900)
    wanted = {round(source_time(n)*FPS) for n in range(150)}
    decoder = subprocess.Popen([ffmpeg,'-v','error','-i',str(source),'-vf','fps=30',
        '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    frames,index = {},0
    while True:
        raw = decoder.stdout.read(1600*900*3)
        if not raw:
            break
        assert len(raw) == 1600*900*3
        if index in wanted:
            original = Image.frombytes('RGB',(1600,900),raw)
            crop = RESULT_CROP if index >= round(23.5*FPS) else EXAMPLES_CROP
            frames[index] = original.crop(crop).resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)
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
        alpha = round(170*max(0,1-y/170)**2+135*max(0,(y-590)/130)**2)
        draw.line((0,y,WIDTH,y),fill=(8,19,29,alpha))
    target = OUT/'satify-propagate-5s-v2.mp4'
    encoder = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30',
        '-i','pipe:0','-map','0:v','-an','-c:v','libx264','-preset','medium','-crf','18',
        '-pix_fmt','yuv420p','-t','5','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    keys = {}
    for n in range(150):
        frame = frames[round(source_time(n)*FPS)].copy()
        frame.paste(shade,(0,0),shade); frame.paste(logo,(8,8),logo)
        draw = ImageDraw.Draw(frame)
        title_font = STYLE.font(46,True)
        bounds = draw.textbbox((WIDTH//2,30),CAPTION,anchor='mt',font=title_font)
        assert bounds[0]>120 and bounds[2]<WIDTH-24,bounds
        draw.text((WIDTH//2,30),CAPTION,anchor='mt',font=title_font,fill=STYLE.WHITE,stroke_width=2,stroke_fill=STYLE.NAVY)
        draw.text((36,648),'Propagate labels · Experimental',font=STYLE.font(24,True),
                  fill=STYLE.WHITE,stroke_width=1,stroke_fill=STYLE.NAVY)
        happy = min(1,max(0,(n-114)/6))
        character = Image.blend(characters[0],characters[1],happy)
        frame.paste(character,(1038,506),character)
        if n in {0,12,15,30,45,46,61,76,77,92,107,113,114,120,135,149}:
            keys[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close(); assert encoder.wait() == 0
    keys[12].save(OUT/'poster.jpg',quality=94)
    contact = Image.new('RGB',(1280,4*204),STYLE.NAVY); draw = ImageDraw.Draw(contact)
    for i,(n,frame) in enumerate(keys.items()):
        x,y = i%4*320,i//4*204
        contact.paste(frame.resize((320,180)),(x,y))
        draw.text((x+6,y+181),f'{n/FPS:.2f}s / {n}',font=STYLE.font(13),fill=STYLE.WHITE)
    contact.save(OUT/'contact-sheet.jpg',quality=94)
    (OUT/'edit.json').write_text(json.dumps({'duration':5,'fps':30,'frames':150,'size':[WIDTH,HEIGHT],
        'source':str(source.relative_to(ROOT)),'sourceSha256':provenance['sha256'],
        'origin':provenance['origin'],'appVersion':provenance['appVersion'],'recordedAt':provenance['recordedAt'],
        'workflow':'Recorded Forest, Water and Built-up examples followed by the applied Propagate labels result',
        'sourceWindowsSeconds':[[.3,.3],[4.7,6.2],[10.2,11.6],[14.9,16.5],[23.5,23.5]],
        'outputBeatsSeconds':{'forest':.5,'water':46/FPS,'builtUp':77/FPS,'savedResult':3.8},
        'drawingFramesPerStroke':31,'savedResultHoldSeconds':1.2,
        'examplesCrop':EXAMPLES_CROP,'savedResultCrop':RESULT_CROP,
        'caption':CAPTION,'audio':'None; silent at the owner’s request','experimental':True,
        'note':'Only real recorded label pixels. Example strokes are accelerated; setup and model waiting are cut. The result is the saved output, not a prediction animation. The crop shows one of the two Forest strokes used in the original run.'},indent=2)+'\n')
    preview = (ROOT/'tools/videos/previews/propagate-micro.html').read_text(encoding='utf-8')
    (OUT/'index.html').write_text(preview.replace('../output/propagate-micro-pilot-v2/','./'),encoding='utf-8')
    SMART.verify(ffmpeg,target,output_dir=OUT,edit_cuts=(15,46,77,108,114,120))
    print(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg')
    render(parser.parse_args().ffmpeg)
