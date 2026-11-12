"""Render the five-second Roads concept from the selected, real SATIFY recording.

Requires Pillow, numpy and FFmpeg. Pass --ffmpeg if it is not on PATH.
The source video and website selection remain untouched. Outputs are ignored.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tools/videos/output/roads-micro-pilot-v5'
FPS, WIDTH, HEIGHT = 30, 1280, 720
DURATION = 5
FRAME_COUNT = FPS * DURATION
NAVY, WHITE, MINT = '#0c1925', '#f5f8fc', '#a7d7a9'


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else
                              'C:/Windows/Fonts/segoeui.ttf', size)


def source_time(n, capture):
    times = capture['times']
    if n < 18:
        return min(.3, times['traceStart']/2)
    if n < 93:
        return times['traceStart'] + (n-18)/75*(times['traceEnd']-times['traceStart'])
    if n < 120:
        return times['previewReady'] + .1 + (n-93)/27*max(0, times['applyStart']-times['previewReady']-.2)
    if n < 132:
        return times['applyStart'] + (n-120)/12*(times['savedReady']-times['applyStart'])
    return times['savedReady'] + .25


def mascot_pose(sheet, half):
    # Split the generated pose sheet and trim only its transparent padding.
    w, h = sheet.size
    pose = sheet.crop((w // 2 * half, 0, w // 2 * (half + 1), h))
    return pose.crop(pose.getbbox())


def verify_output(ffmpeg, video):
    """Decode the complete export and save nine-frame sequences at every cut."""
    cuts = [18, 93, 120, 132, 138]
    process = subprocess.Popen([ffmpeg, '-v', 'error', '-i', str(video),
        '-vf', 'scale=640:360', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
        stdout=subprocess.PIPE)
    frames, count, changes, previous = {}, 0, [], None
    while True:
        raw = process.stdout.read(640*360*3)
        if not raw:
            break
        assert len(raw) == 640*360*3, 'Incomplete output frame'
        frame = Image.frombytes('RGB', (640, 360), raw)
        assert frame.convert('L').getextrema()[1] > 100, f'Black frame {count}'
        frames[count] = frame
        # Find large actual image changes as well as the known edit boundaries.
        pixels = np.asarray(frame.resize((160, 90)), dtype=np.int16)[15:65, :]
        if previous is not None:
            difference = float(np.abs(pixels-previous).mean())
            if difference > .8:
                changes.append((count, round(difference, 3)))
        previous = pixels
        count += 1
    assert process.wait() == 0 and count == FRAME_COUNT, count
    for n, _score in sorted(changes, key=lambda item: -item[1]):
        if all(abs(n-cut) > 4 for cut in cuts):
            cuts.append(n)
    for cut in cuts:
        sheet = Image.new('RGB', (1920, 1170), NAVY)
        draw = ImageDraw.Draw(sheet)
        for i, n in enumerate(range(max(0, cut-4), min(FRAME_COUNT, cut+5))):
            x, y = i%3*640, i//3*390
            sheet.paste(frames[n], (x, y))
            draw.text((x+8, y+362), f'Frame {n} / {n/FPS:.3f}s', font=font(18), fill=WHITE)
        sheet.save(OUT/f'cut-{cut}.jpg', quality=94)
    (OUT/'verification.json').write_text(json.dumps({
        'decodedFrames': count, 'decodeErrors': 0, 'blackFrames': 0,
        'cutSequences': sorted(cuts), 'imageChanges': changes}, indent=2)+'\n', encoding='utf-8')


def render(ffmpeg, recording):
    OUT.mkdir(parents=True, exist_ok=True)
    capture = json.loads(Path(recording).read_text(encoding='utf-8'))
    assert capture['origin'] == 'http://127.0.0.1:3030'
    assert capture['fitRevision'] == 2 and capture['previewApplyCountParity']
    assert capture['theme'] == 'dark' and capture['explainerVideos'] == 'off'
    source = Path(capture['rawVideo'])
    if not source.is_absolute():
        source = Path(recording).resolve().parent/source
    if capture.get('rawSha256'):
        assert hashlib.sha256(source.read_bytes()).hexdigest() == capture['rawSha256']
    times = [round(source_time(n, capture)*FPS) for n in range(FRAME_COUNT)]
    wanted = set(times)
    crop = capture.get('rawCrop')
    initial_crop = f"crop={crop['width']}:{crop['height']}:{crop['x']}:{crop['y']}," if crop else ''
    decoder = subprocess.Popen([ffmpeg, '-v', 'error', '-i', str(source),
        '-vf', 'fps=30,'+initial_crop+'crop=380:676:250:10,transpose=2,scale=1280:720',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
    frames = {}
    index = 0
    while True:
        raw = decoder.stdout.read(WIDTH*HEIGHT*3)
        if not raw:
            break
        if len(raw) != WIDTH*HEIGHT*3:
            raise RuntimeError('Incomplete decoded source frame')
        if index in wanted:
            frames[index] = Image.frombytes('RGB', (WIDTH, HEIGHT), raw)
        index += 1
    assert decoder.wait() == 0
    assert wanted <= frames.keys()

    sheet_path = ROOT / 'tools/videos/assets/micro/satellite-poses-v1.png'
    sheet = Image.open(sheet_path).convert('RGBA')
    assert sheet.getextrema()[3][0] == 0, 'Mascot must have real alpha'
    poses = [mascot_pose(sheet, half) for half in (0, 1)]
    logo = Image.open(ROOT/'web/assets/satify-logo.png').convert('RGBA')
    logo = logo.crop(logo.getbbox())
    logo.thumbnail((96, 96), Image.Resampling.LANCZOS)
    characters = []
    for pose in poses:
        pose.thumbnail((228, 201), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (228, 201))
        canvas.paste(pose, ((228-pose.width)//2, (201-pose.height)//2))
        characters.append(canvas)
    # Thin, transparent fades support the overlay text without dividing the image.
    shade = Image.new('RGBA', (WIDTH, HEIGHT))
    shade_draw = ImageDraw.Draw(shade)
    for y in range(HEIGHT):
        alpha = round(145*max(0, 1-y/170)**2 + 125*max(0, (y-590)/130)**2)
        shade_draw.line((0, y, WIDTH, y), fill=(8, 19, 29, alpha))
    output = OUT/'satify-roads-5s-v5.mp4'
    encoder = subprocess.Popen([ffmpeg, '-v', 'error', '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', '30',
        '-i', 'pipe:0', '-map', '0:v', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-t', str(DURATION), '-movflags', '+faststart',
        str(output)], stdin=subprocess.PIPE)
    keyframes = {}
    for n in range(FRAME_COUNT):
        frame = frames[times[n]].copy()
        frame.paste(shade, (0, 0), shade)
        draw = ImageDraw.Draw(frame)
        frame.paste(logo, (8, 8), logo)
        caption = 'Mark it roughly. SATIFY finds the road.'
        caption_font = font(44, True)
        bounds = draw.textbbox((WIDTH//2, 30), caption, anchor='mt', font=caption_font)
        assert bounds[0] > 120 and bounds[2] < WIDTH-24, bounds
        draw.text((WIDTH//2, 30), caption, anchor='mt',
                  font=caption_font, fill=WHITE, stroke_width=2, stroke_fill=NAVY)
        draw.text((36, 648), 'Rivers & Roads Pen', font=font(24, True),
                  fill=WHITE, stroke_width=1, stroke_fill=NAVY)
        # Saty stays in the same place and at the same size in every frame.
        # Only the expression changes, with a quiet crossfade at the saved result.
        happy = min(1, max(0, (n-132)/6))
        character = Image.blend(characters[0], characters[1], happy)
        frame.paste(character, (1038, 506), character)
        if n in {0, 17, 18, 40, 65, 92, 93, 105, 119, 120, 126, 131, 132, 135, 138, 149}:
            keyframes[n] = frame.copy()
        encoder.stdin.write(frame.tobytes())
    encoder.stdin.close()
    assert encoder.wait() == 0
    keyframes[18].save(OUT/'poster.jpg', quality=94)
    contact = Image.new('RGB', (1280, 4*204), NAVY)
    d = ImageDraw.Draw(contact)
    for i, (n, frame) in enumerate(keyframes.items()):
        x, y = (i%4)*320, (i//4)*204
        contact.paste(frame.resize((320, 180)), (x, y))
        d.text((x+6, y+181), f'{n/FPS:.2f}s / frame {n}', font=font(13), fill=WHITE)
    contact.save(OUT/'contact-sheet.jpg', quality=93)
    manifest = {'duration': DURATION, 'fps': FPS, 'frames': FRAME_COUNT, 'size': [WIDTH, HEIGHT],
        'source': str(source.relative_to(ROOT)),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'recording': str(Path(recording).resolve()), 'appVersion': capture['appVersion'],
        'origin': capture['origin'], 'fitRevision': capture['fitRevision'],
        'settings': capture['settings'], 'guide': capture['guide'],
        'pixelsWritten': capture['pixelsWritten'],
        'mascot': str(sheet_path.relative_to(ROOT)),
        'mascotMethod': 'Built-in image_gen, identity-preserving transparent pose adaptation',
        'audio': 'None; silent at the owner’s request',
        'framing': 'Single image, crop x=250 y=10 w=380 h=676, rotated 90 degrees counterclockwise; no image stretching',
        'overlays': 'Mark it roughly. SATIFY finds the road.; Rivers & Roads Pen; SATIFY logo; Saty always visible at fixed position and size',
        'overlayBounds': {'logo': [8, 8, 96, 96], 'saty': [1038, 506, 228, 201]},
        'sourceTimeline': {'0–0.6': 'Clean frame', '0.6–3.1': 'Actual loose guide stroke',
            '3.1–4.0': 'Actual ready preview', '4.0–4.4': 'Actual Apply',
            '4.4–5.0': 'Persisted result'}, 'sourceTimes': capture['times'],
        'note': 'Only editing, framing and graphics. No generated imagery or labels in the map.'}
    (OUT/'edit.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    preview = (ROOT/'tools/videos/previews/roads-micro.html').read_text(encoding='utf-8')
    preview = preview.replace('../output/roads-micro-pilot-v5/', './')
    (OUT/'index.html').write_text(preview, encoding='utf-8')
    verify_output(ffmpeg, output)
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--recording', required=True, help='Verified local recording.json')
    args = parser.parse_args()
    render(args.ffmpeg, args.recording)
