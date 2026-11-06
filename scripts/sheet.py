# Dev tool: combines captured stills into one contact sheet. Usage: sheet.py <dir> <out> <cols> name name ...
import sys
from PIL import Image

d, out, cols, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f"{d}/{n}.png").convert('RGB') for n in names]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (w * cols, h * rows))
for i, im in enumerate(ims):
    s.paste(im, ((i % cols) * w, (i // cols) * h))
s.save(f"{d}/{out}.png")
print(s.size)
