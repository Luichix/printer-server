// Icono vectorial simple y sus versiones ICO/PNG, sin dependencias gráficas.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const directory = path.join(__dirname, '../assets');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'printer-server.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#21765b"/><path d="M20 13h24v13H20z" fill="white"/><rect x="12" y="24" width="40" height="24" rx="6" fill="white"/><path d="M19 36h26v17H19z" fill="#21765b"/><path d="M23 39h18v12H23z" fill="white"/><circle cx="44" cy="30" r="2" fill="#21765b"/></svg>\n`);
function inside(x,y,left,top,width,height,r=0) {
  const dx=Math.max(left+r-x,0,x-(left+width-r));
  const dy=Math.max(top+r-y,0,y-(top+height-r));
  return x>=left && x<=left+width && y>=top && y<=top+height && dx*dx+dy*dy<=r*r;
}
function pixel(x,y) {
  if (!inside(x,y,2,2,60,60,14)) return [0,0,0,0];
  let white=inside(x,y,20,13,24,13)||inside(x,y,12,24,40,24,6);
  if (inside(x,y,19,36,26,17)) white=false;
  if (inside(x,y,23,39,18,12)) white=true;
  if ((x-44)**2+(y-30)**2<=4) white=false;
  return white?[255,255,255,255]:[33,118,91,255];
}
function raster(size) {
  const data=Buffer.alloc(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const sum=[0,0,0,0];
    for(let sy=0;sy<4;sy++) for(let sx=0;sx<4;sx++) {
      const p=pixel((x+(sx+.5)/4)*64/size,(y+(sy+.5)/4)*64/size);
      for(let c=0;c<3;c++) sum[c]+=p[c]*p[3]/255;
      sum[3]+=p[3];
    }
    const i=(y*size+x)*4;
    for(let c=0;c<3;c++) data[i+c]=sum[3]?Math.round(sum[c]*255/sum[3]):0;
    data[i+3]=Math.round(sum[3]/16);
  }
  return data;
}
const sizes=[16,20,24,32,48,64,128,256];
const header=Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
const frames=[];let offset=header.length;
sizes.forEach((size,index)=>{
  const pixels=raster(size), maskStride=Math.ceil(size/32)*4;
  const dib=Buffer.alloc(40+pixels.length+maskStride*size);
  dib.writeUInt32LE(40);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(pixels.length,20);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const src=(y*size+x)*4,dst=40+((size-1-y)*size+x)*4;
    dib[dst]=pixels[src+2];dib[dst+1]=pixels[src+1];dib[dst+2]=pixels[src];dib[dst+3]=pixels[src+3];
    if(!pixels[src+3]) dib[40+pixels.length+(size-1-y)*maskStride+(x>>3)]|=128>>(x%8);
  }
  const entry=6+index*16; header[entry]=size%256;header[entry+1]=size%256;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(dib.length,entry+8);header.writeUInt32LE(offset,entry+12);
  frames.push(dib);offset+=dib.length;
});
fs.writeFileSync(path.join(directory,'printer-server.ico'),Buffer.concat([header,...frames]));
function chunk(type,data){const bytes=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);bytes.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
const size=256,pixels=raster(size),scanlines=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)pixels.copy(scanlines,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
fs.writeFileSync(path.join(directory,'printer-server.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]));
