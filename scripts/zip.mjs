import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { deflateAsync } from '@gfx/zopfli';

export async function zipHTML(html){
  const data=Buffer.from(html),name=Buffer.from('index.html');
  const normal=deflateRawSync(data,{level:9}),strong=Buffer.from(await deflateAsync(data,{numiterations:15}));
  const compressed=strong.length<normal.length?strong:normal;
  if(!inflateRawSync(compressed).equals(data))throw Error('Compressed HTML failed its round-trip check');
  let crc=0xffffffff;
  for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+compressed.length,16);
  return {zip:Buffer.concat([local,name,compressed,central,name,end]),deflateSaving:normal.length-compressed.length};
}
