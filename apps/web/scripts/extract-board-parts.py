"""
Cuts sprite parts out of the design board docs/concept/sprite-stress-test.png
and writes real atlases + manifests for lizard, robot and blob under
apps/web/public/parts/<kind>/, in the format docs/SPRITES.md describes.

The board is a flattened composite, so this is an approximation of proper
exports: soft alpha from background distance, bodies and parts converted to
tint-ready grays, whites and darks split into an untinted detail layer, and
pivots/attach points estimated from each crop's box. Replace with the real
exports when design delivers them; the manifest shape stays the same.

Usage: python3 apps/web/scripts/extract-board-parts.py
"""
import json, os
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # apps/web
SRC = os.path.join(ROOT, '..', '..', 'docs', 'concept', 'sprite-stress-test.png')
OUT = os.path.join(ROOT, 'public', 'parts')
PAD = 8

board = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)

def cut(box, bg_box=None, margin=4):
    """Crop a box, return (rgb float array, alpha 0..1) with background removed."""
    x0, y0, w, h = box
    x0 -= margin; y0 -= margin; w += margin * 2; h += margin * 2
    crop = board[y0:y0 + h, x0:x0 + w]
    border = np.concatenate([crop[0], crop[-1], crop[:, 0], crop[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((crop - bg) ** 2).sum(axis=2))
    hard = dist > 30
    hard = ndimage.binary_closing(ndimage.binary_opening(hard, iterations=1), iterations=2)
    lab, n = ndimage.label(hard)
    if n > 1:
        sizes = ndimage.sum(hard, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.04 * sizes.max()])
    else:
        keep = hard
    keep = ndimage.binary_dilation(keep, iterations=2)
    soft = np.clip((dist - 10) / 24, 0, 1)
    alpha = soft * keep
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    return crop, alpha

def to_layers(rgb, alpha, split_detail=True, target_median=200):
    """Tintable gray base + untinted detail (whites/darks: eyes, teeth, pupils)."""
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    opaque = alpha > 0.5
    detail_mask = np.zeros_like(opaque)
    if split_detail:
        detail_mask = opaque & (((lum > 226) & (sat < 40)) | (lum < 70))
        # eyes are compact; drop stray specks
        detail_mask = ndimage.binary_opening(detail_mask, iterations=1)
        detail_mask = ndimage.binary_dilation(detail_mask, iterations=1) & opaque
    base = lum.copy()
    if opaque.any():
        med = np.median(lum[opaque & ~detail_mask]) if (opaque & ~detail_mask).any() else np.median(lum[opaque])
        base = np.clip(lum * (target_median / max(1, med)), 0, 255)
    # under the detail layer, fill the base with a local mid-gray so tint stays even
    if detail_mask.any():
        fill = ndimage.median_filter(base, size=9)
        base = np.where(detail_mask, fill, base)
    base_rgba = np.dstack([base, base, base, alpha * 255]).astype(np.uint8)
    det_alpha = np.where(detail_mask, alpha, 0)
    det_rgba = np.dstack([rgb[..., 0], rgb[..., 1], rgb[..., 2], det_alpha * 255]).astype(np.uint8)
    return Image.fromarray(base_rgba, 'RGBA'), (Image.fromarray(det_rgba, 'RGBA') if split_detail else None)

def keep_color(rgb, alpha):
    return Image.fromarray(np.dstack([rgb[..., 0], rgb[..., 1], rgb[..., 2], alpha * 255]).astype(np.uint8), 'RGBA')

# Boxes from the survey (x, y, w, h) on the 1448x1086 board.
KINDS = {
  'lizard': {
    'unit': 52, 'motion': 'organic',
    'bodies': {'baby': (29, 223, 128, 96), 'grown': (165, 200, 177, 119)},
    'body_pivot': (0.5, 0.62), 'body_size': (2.0, 2.4),
    'head': (0.30, -0.40), 'tail': (-0.42, 0.05), 'spikes': (-0.05, -0.45), 'face': (0.30, -0.40), 'horns': (0.30, -0.47),
    'parts': {
      'tail.stub': ('tail_stub', (24, 453, 35, 45), (0.85, 0.5), 'behind', 'primary', True),
      'tail.long': ('tail_long', (71, 441, 50, 63), (0.85, 0.5), 'behind', 'primary', True),
      'tail.club': ('tail_club', (129, 443, 44, 59), (0.85, 0.5), 'behind', 'primary', True),
      'tail.fan': ('tail_fan', (181, 438, 49, 66), (0.85, 0.5), 'behind', 'primary', True),
      'spike': ('spike', (249, 432, 44, 39), (0.5, 1.0), 'front', 'accent', True),
      'horn': ('horn', (320, 434, 20, 31), (0.5, 1.0), 'front', 'accent', True),
      'face.villain': ('face_villain', (408, 432, 61, 30), (0.5, 0.5), 'front', 'none', False),
    },
    'omit': ['spike'],
  },
  'robot': {
    'unit': 54, 'motion': 'rigid',
    'bodies': {'baby': (518, 220, 120, 99), 'grown': (641, 192, 171, 127)},
    'body_pivot': (0.5, 0.6), 'body_size': (1.9, 2.3),
    'head': (0.12, -0.42), 'tail': (-0.45, 0.0), 'spikes': (-0.05, -0.42), 'face': (0.12, -0.42), 'horns': (0.05, -0.50),
    'parts': {
      'tail.stub': ('thruster', (510, 445, 49, 57), (0.9, 0.5), 'behind', 'secondary', True),
      'tail.long': ('drill', (560, 456, 44, 49), (0.9, 0.5), 'behind', 'secondary', True),
      'tail.club': ('cannon', (602, 446, 57, 56), (0.9, 0.5), 'behind', 'secondary', True),
      'tail.fan': ('stabilizer', (658, 439, 50, 64), (0.9, 0.5), 'behind', 'secondary', True),
      'spike': ('plate', (732, 433, 40, 40), (0.5, 1.0), 'front', 'accent', True),
      'horn': ('antenna', (806, 433, 21, 43), (0.5, 1.0), 'front', 'none', False),
      'face.villain': ('face_villain', (880, 433, 60, 31), (0.5, 0.5), 'front', 'none', False),
    },
    'omit': ['wings', 'head', 'spike'],
  },
  'blob': {
    'unit': 60, 'motion': 'wobble',
    'bodies': {'baby': (984, 230, 112, 88), 'grown': (1121, 199, 168, 121)},
    'body_pivot': (0.5, 0.58), 'body_size': (2.4, 1.9),
    'head': (0.05, -0.12), 'tail': (-0.45, 0.15), 'spikes': (0.0, -0.5), 'face': (0.05, -0.12), 'horns': (0.0, -0.5),
    'parts': {
      'tail.stub': ('nub', (979, 473, 25, 29), (0.9, 0.5), 'behind', 'primary', True),
      'tail.long': ('trail', (1014, 454, 57, 49), (0.9, 0.5), 'behind', 'primary', True),
      'tail.club': ('bubbles', (1080, 463, 39, 39), (0.9, 0.5), 'behind', 'primary', True),
      'tail.fan': ('drip', (1131, 453, 37, 51), (0.9, 0.5), 'behind', 'primary', True),
      'spike': ('crystal_nub', (1196, 434, 38, 42), (0.5, 1.0), 'front', 'accent', True),
      'face.villain': ('face_villain', (1358, 466, 54, 52), (0.5, 0.5), 'front', 'none', False),
    },
    'omit': ['wings', 'horn', 'head', 'spike'],
  },
}

def pack(frames, width=1024):
    x = y = PAD; row_h = 0; placed = []
    for name, img in frames:
        if x + img.width + PAD > width:
            x = PAD; y += row_h + PAD; row_h = 0
        placed.append((name, img, x, y)); x += img.width + PAD; row_h = max(row_h, img.height)
    height = y + row_h + PAD
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    meta = {'frames': {}, 'meta': {'image': '', 'size': {'w': width, 'h': height}, 'scale': '1'}}
    for name, img, px, py in placed:
        atlas.paste(img, (px, py), img)
        meta['frames'][name] = {'frame': {'x': px, 'y': py, 'w': img.width, 'h': img.height}, 'rotated': False, 'trimmed': False,
                                'spriteSourceSize': {'x': 0, 'y': 0, 'w': img.width, 'h': img.height}, 'sourceSize': {'w': img.width, 'h': img.height}}
    return atlas, meta

for kind, K in KINDS.items():
    frames = []
    u = K['unit']
    bodies = {}
    for stage, box in K['bodies'].items():
        rgb, alpha = cut(box)
        base, detail = to_layers(rgb, alpha, split_detail=True)
        frames.append((f'body_{stage}', base)); frames.append((f'body_{stage}_detail', detail))
        bw, bh = base.width / u, base.height / u
        # attach points as fractions of the crop, relative to the pivot, in body units
        px, py = K['body_pivot']
        rel = lambda f: [round((f[0]) * bw, 3), round((f[1]) * bh, 3)]
        head = rel(K['head'])
        bodies[stage] = {
            'frame': f'body_{stage}', 'detail': f'body_{stage}_detail', 'size': [round(bw * 0.85, 2), round(bh * 0.8, 2)], 'pivot': list(K['body_pivot']),
            'attach': {'head': [head], 'wings': [0, -0.25], 'tail': rel(K['tail']), 'spikes': rel(K['spikes']), 'horns': rel(K['horns']), 'face': rel(K['face'])},
            'anchors': {'head': head, 'mouth': [round(head[0] + 0.35 * bw, 3), round(head[1] + 0.08 * bh, 3)], 'back': rel(K['spikes']),
                        'feet': [0, round(bh * (1 - py), 3)], 'attackOrigin': [round(bw * 0.5, 3), 0], 'effectOrigin': [0, round(-bh * 0.1, 3)]},
            'bounds': {'selection': [round(bw, 2), round(bh, 2)], 'selectionOffset': [0, round(bh * (0.5 - py), 3)], 'footprint': [round(bw * 0.9, 2), 0.5]},
        }
    parts = {}
    for key, (frame, box, pivot, z, tint, gray) in K['parts'].items():
        rgb, alpha = cut(box)
        img = to_layers(rgb, alpha, split_detail=False)[0] if gray else keep_color(rgb, alpha)
        frames.append((frame, img))
        parts[key] = {'frame': frame, 'pivot': list(pivot), 'z': z, 'tint': tint}
    atlas, meta = pack(frames)
    meta['meta']['image'] = f'{kind}.png'
    d = os.path.join(OUT, kind); os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, f'{kind}.png'))
    json.dump(meta, open(os.path.join(d, f'{kind}.atlas.json'), 'w'), indent=1)
    manifest = {'kind': kind, 'atlas': kind, 'unit': u, 'displayName': kind.capitalize(), 'source': 'docs/concept/sprite-stress-test.png (extracted)',
                'bodies': bodies, 'parts': parts, 'omit': K['omit'], 'motion': K['motion']}
    json.dump(manifest, open(os.path.join(d, f'{kind}.json'), 'w'), indent=1)
    print(f'{kind}: atlas {atlas.width}x{atlas.height}, {len(frames)} frames')
