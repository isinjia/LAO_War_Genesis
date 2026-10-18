"""Reconstruct base-outfit full-body art from Unity's 2D sprite prefab."""
import json
import math
import re
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageChops
from illustration_fbx import geometry, clusters
import build_sd as sd
from roster import UNITS

ROOT = Path(sd.ROOT)
OUT = Path(__file__).resolve().parent.parent

def matrix(n):
    x,y,z,w=n['q']
    r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0], [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0], [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],dtype=float)
    r[:3,:3] *= np.array(n['s'])[None,:]
    r[:3,3]=n['t']
    return r

def compose(model, dest):
    prefab=ROOT/'AssetBundleResource/Character_2D'/f'2DModel_{model}.prefab'
    atlas=sd.Atlas();nodes=sd.build_prefab(str(prefab),atlas)
    worlds=[]; active=[]; pieces=[]
    for n in nodes:
        parent=n['p'];world=matrix(n)
        if parent>=0:world=worlds[parent]@world
        worlds.append(world);active.append(bool(n['a']) and (parent<0 or active[parent]))
    names={n['n']:i for i,n in enumerate(nodes)}
    for ni,n in enumerate(nodes):
        # The spring-only secondary strand is outside the lobby's static pose.
        if model == 'BR_Khan_N' and n['n'] == 'kh_parts_hair_4':continue
        world=worlds[ni]
        sr=n.get('sr')
        sk=n.get('skin')
        if sk and sk['e'] and active[ni]:
            guid,fid=sk['mesh'];fbx=sd.guid_index().get(guid)
            if not fbx:raise RuntimeError('Missing FBX '+str(guid))
            texguid=sd.mat_texture(sk['mat']);tex=atlas.texture(texguid)
            if tex is None:continue
            v,uv,tri=geometry(fbx,sd.mesh_name(fbx,fid))
            im=Image.open(atlas.textures[tex][1]).convert('RGBA');tw,th=im.size
            local=np.column_stack([v,np.ones(len(v))]).T
            weighted=np.zeros((4,len(v)));total=np.zeros(len(v));convert=np.diag([-.01,.01,.01,1])
            bones={nodes[i]['n']:i for i in sk['bones'] if i>=0}
            for name,indices,weights,bind,link,offset in clusters(fbx,sd.mesh_name(fbx,fid)):
                bone=bones.get(name,names.get(name))
                if bone is None:raise RuntimeError('Missing illustration bone '+name)
                # These source FBXs serialize a per-cluster mesh-to-bone offset
                # in Transform (already inverse bind), rather than a shared mesh matrix.
                weighted[:,indices]+=(worlds[bone]@convert@offset@local[:,indices])*weights[None,:]
                total[indices]+=weights
            if (total<.99).any():raise RuntimeError('Unbound illustration vertices '+n['n'])
            projected=(weighted/total[None,:])[[0,1,3],:]
            pieces.append((sk['L'],sk['o'],world[2,3],im,None,projected,1,(projected,uv,tri)))
        if not sr or not sr['e'] or not active[ni]:continue
        if not sr.get('s') and n['n'].lower()=='face':
            face=ROOT/'AssetBundleResource/Texture/face'/model/f'{model}_Idle.png'
            if face.exists():
                guid=re.search(r'guid: ([0-9a-f]+)',Path(str(face)+'.meta').read_text()).group(1)
                sr['s']=atlas.sprite({'guid':guid,'fileID':21300000})
        if not sr.get('s') or sr['c'][3]<=0:continue
        tex,x,y,w,h,px,py,wu,hu=atlas.sprites[sr['s']]
        image=Image.open(atlas.textures[tex][1]).convert('RGBA');tw,th=image.size
        x,y,w,h=[round(a) for a in (x*tw,y*th,w*tw,h*th)]
        image=image.crop((x,th-y-h,x+w,th-y))
        if sr['s'] in atlas.outlines:
            _,_,paths=atlas.outlines[sr['s']]
            mask=Image.new('L',image.size);draw=ImageDraw.Draw(mask)
            for path in paths:draw.polygon([(w/2+vx,h/2-vy) for vx,vy in path],fill=255)
            image.putalpha(ImageChops.multiply(image.getchannel('A'),mask))
        local=np.array([[wu/w,0,-px*wu],[0,-hu/h,(1-py)*hu],[0,0,0],[0,0,1]],dtype=float)
        if sr['fx']:local[0]*=-1
        if sr['fy']:local[1]*=-1
        projected=(world@local)[[0,1,3],:]
        if abs(np.linalg.det(projected))<1e-10:continue
        corners=projected@np.array([[0,w,w,0],[0,0,h,h],[1,1,1,1]])
        pieces.append((sr['L'],sr['o'],world[2,3],image,projected,corners,sr['c'][3]))
    if not pieces:raise RuntimeError('No sprites: '+model)
    points=np.concatenate([p[5] for p in pieces],axis=1)
    lo=points[:2].min(axis=1);hi=points[:2].max(axis=1)
    scale=1100/(hi[1]-lo[1]);size=(math.ceil((hi[0]-lo[0])*scale)+4,1104)
    view=np.array([[scale,0,-lo[0]*scale+2],[0,-scale,hi[1]*scale+2],[0,0,1]])
    result=Image.new('RGBA',size)
    for piece in sorted(pieces,key=lambda p:(p[0],p[1],-p[2])):
        _,_,_,im,transform,_,alpha=piece[:7]
        if len(piece)==8:
            projected,uv,tri=piece[7];screen=(view@projected)[:2].T
            pixels=np.asarray(im);tw,th=im.size
            rendered=np.zeros((size[1],size[0],4),dtype=np.uint8)
            for triangle in tri:
                pts=screen[triangle[:,0]]
                x0,y0=np.maximum(np.floor(pts.min(0)).astype(int),0)
                x1,y1=np.minimum(np.ceil(pts.max(0)).astype(int)+1,size)
                if x1<=x0 or y1<=y0:continue
                basis=np.vstack([pts.T,np.ones(3)])
                if abs(np.linalg.det(basis))<1e-8:continue
                yy,xx=np.mgrid[y0:y1,x0:x1]
                weights=np.linalg.inv(basis)@np.vstack([xx.ravel()+.5,yy.ravel()+.5,np.ones(xx.size)])
                mask=(weights>=-1e-6).all(0)
                coords=weights.T@uv[triangle[:,1]]
                tx=np.clip(coords[:,0]*tw-.5,0,tw-1);ty=np.clip((1-coords[:,1])*th-.5,0,th-1)
                ix=tx.astype(int);iy=ty.astype(int);jx=np.minimum(ix+1,tw-1);jy=np.minimum(iy+1,th-1)
                wx=(tx-ix)[:,None];wy=(ty-iy)[:,None]
                rgba=(pixels[iy,ix]*(1-wx)*(1-wy)+pixels[iy,jx]*wx*(1-wy)+pixels[jy,ix]*(1-wx)*wy+pixels[jy,jx]*wx*wy).astype(np.uint8)
                rendered[yy.ravel()[mask],xx.ravel()[mask]]=rgba[mask]
            layer=Image.fromarray(rendered)
        else:
            inv=np.linalg.inv(view@transform)
            layer=im.transform(size,Image.Transform.AFFINE,tuple(inv[:2].flatten()),Image.Resampling.BICUBIC)
            if alpha<1:layer.putalpha(layer.getchannel('A').point(lambda a:round(a*alpha)))
        result=Image.alpha_composite(result,layer)
    if not result.getbbox():raise RuntimeError('Empty illustration '+model)
    result=result.crop(result.getbbox())
    result.save(dest,'WEBP',quality=90,method=6)
    print(model,len(pieces),'sprites',result.size)
    return result

if __name__=='__main__':
    sys.path.insert(0,str(Path(__file__).parent/'ui_ref'));import ngui
    sd._guid_index=ngui.guid_index()
    ids=sys.argv[1:] or [uid for uid,model in list(UNITS.items())[16:] if not (ROOT/'AssetBundleResourceSub/Texture/FullbodyImg'/f'FullbodyIMG_{model}.png').exists()]
    for uid in ids:compose(UNITS[uid],OUT/'assets/full'/f'{uid}.webp')
    manifest=OUT/'js/assets.js';text=manifest.read_text(encoding='utf-8')
    match=re.search(r'window.FULL = (\{[\s\S]*?\});',text)
    full=json.loads(match.group(1))
    for uid in ids:full[uid]=f'assets/full/{uid}.webp'
    text=text[:match.start(1)]+json.dumps(full,indent=0)+text[match.end(1):]
    manifest.write_text(text,encoding='utf-8')
    print('Full-body manifest:',len(full))

