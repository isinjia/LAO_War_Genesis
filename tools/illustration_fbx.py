"""Minimal read-only FBX geometry decoder for original illustration meshes."""
import struct,zlib
from functools import lru_cache
from pathlib import Path
import numpy as np

@lru_cache(maxsize=12)
def read(path):
 data=Path(path).read_bytes();version=struct.unpack_from('<I',data,23)[0];wide=version>=7500
 header='<QQQB' if wide else '<IIIB';hs=struct.calcsize(header);zero=25 if wide else 13
 def prop(at):
  t=chr(data[at]);at+=1
  if t in 'YCLFDI':
   fmt={'Y':'h','C':'?','L':'q','F':'f','D':'d','I':'i'}[t];return struct.unpack_from('<'+fmt,data,at)[0],at+struct.calcsize(fmt)
  if t in 'SR':
   n=struct.unpack_from('<I',data,at)[0];at+=4;v=data[at:at+n];return (v.decode('utf-8',errors='replace') if t=='S' else v),at+n
  if t in 'fdilbc':
   n,enc,size=struct.unpack_from('<III',data,at);at+=12;raw=data[at:at+size];raw=zlib.decompress(raw) if enc else raw
   return np.frombuffer(raw,dtype={'f':'<f4','d':'<f8','i':'<i4','l':'<i8','b':'u1','c':'u1'}[t]),at+size
  raise ValueError(t)
 def node(at):
  end,count,length,nlen=struct.unpack_from(header,data,at)
  if not end:return None,at+zero
  at+=hs;name=data[at:at+nlen].decode();at+=nlen;props=[]
  for _ in range(count):p,at=prop(at);props.append(p)
  children=[]
  while at<end-zero:
   child,at=node(at)
   if child:children.append(child)
  return (name,props,children),end
 nodes=[];at=27
 while at<len(data)-zero:
  n,at=node(at)
  if not n:break
  nodes.append(n)
 return nodes

def geometry(path,name):
 objects=next(n for n in read(path) if n[0]=='Objects')[2]
 matches=[n for n in objects if n[0]=='Geometry' and n[1][1].split('\x00')[0].replace('Geometry::','')==name]
 if not matches:
  model=next(n for n in objects if n[0]=='Model' and n[1][1].split('\x00')[0].replace('Model::','')==name)
  links=next(n for n in read(path) if n[0]=='Connections')[2]
  ids={n[1][1] for n in links if n[1][0]=='OO' and n[1][2]==model[1][0]}
  matches=[n for n in objects if n[0]=='Geometry' and n[1][0] in ids]
 if not matches:raise ValueError('Missing FBX geometry '+name)
 g=matches[0];children={n[0]:n for n in g[2]}
 verts=children['Vertices'][1][0].reshape(-1,3)
 polys=children['PolygonVertexIndex'][1][0]
 uvnode=children['LayerElementUV'];uc={n[0]:n for n in uvnode[2]}
 uv=uc['UV'][1][0].reshape(-1,2);uvix=uc.get('UVIndex');uvix=uvix[1][0] if uvix else np.arange(len(polys))
 out=[];poly=[]
 for i,idx in enumerate(polys):
  last=idx<0;idx=int(-idx-1 if last else idx);poly.append((idx,int(uvix[i])))
  if last:
   for j in range(1,len(poly)-1):out.append([poly[0],poly[j],poly[j+1]])
   poly=[]
 return verts,uv,np.array(out)

def clusters(path,name):
 nodes=read(path);objects=next(n for n in nodes if n[0]=='Objects')[2];byid={n[1][0]:n for n in objects}
 links=[n[1] for n in next(n for n in nodes if n[0]=='Connections')[2] if n[1][0]=='OO']
 model=next(n for n in objects if n[0]=='Model' and n[1][1].split('\x00')[0].replace('Model::','')==name)
 geo=next(byid[a] for _,a,b in links if b==model[1][0] and a in byid and byid[a][0]=='Geometry')
 skins=[a for _,a,b in links if b==geo[1][0] and a in byid and byid[a][0]=='Deformer']
 result=[]
 for skin in skins:
  for _,a,b in links:
   if b!=skin or a not in byid or byid[a][0]!='Deformer':continue
   cluster=byid[a];d={n[0]:n for n in cluster[2]}
   if 'Indexes' not in d:continue
   bone=next(byid[x] for _,x,y in links if y==a and x in byid and byid[x][0]=='Model')
   transform=d['Transform'][1][0].reshape(4,4).T
   link=d['TransformLink'][1][0].reshape(4,4).T
   result.append((bone[1][1].split('\x00')[0].replace('Model::',''),d['Indexes'][1][0],d['Weights'][1][0],np.linalg.inv(link)@transform,link,transform))
 return result
