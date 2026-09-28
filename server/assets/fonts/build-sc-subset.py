# Builds NotoSansSC-{Regular,Bold}-subset.ttf from the Noto Sans SC variable font. See README.md.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
chars=set()
for b1 in range(0xA1,0xF8):
    for b2 in range(0xA1,0xFF):
        try: chars.add(bytes([b1,b2]).decode('gb2312'))
        except: pass
rng=[(0x20,0x7E),(0xA0,0x17F),(0x2000,0x206F),(0x20A0,0x20BF),(0x2100,0x215F),(0x2190,0x21FF),(0x2460,0x24FF),(0x3000,0x303F),(0xFF00,0xFFEF)]
for a,b in rng:
    for c in range(a,b+1): chars.add(chr(c))
extra=open('extra.txt',encoding='utf8').read()
chars |= set(extra)
chars={c for c in chars if ord(c)>=0x20}
print(len(chars))
for w,name in [(400,'NotoSansSC-Regular-subset.ttf'),(700,'NotoSansSC-Bold-subset.ttf')]:
    f=TTFont('sc.ttf')
    inst=instancer.instantiateVariableFont(f,{'wght':w})
    opts=subset.Options(); opts.hinting=False; opts.layout_features=['*']; opts.name_IDs=['*']; opts.notdef_outline=True; opts.drop_tables+=['STAT','MVAR','HVAR']
    s=subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(inst)
    # fontkit (used by pdf-lib) re-subsets with loca offsets; unpadded (odd-length)
    # glyphs get truncated there, so keep every glyph 4-byte aligned.
    inst['glyf'].padding = 4
    inst.save(name)
