import { stat } from 'node:fs/promises';
try{
  const bytes=(await stat('dist/sunwake-rush.zip')).size;
  console.log(`ZIP: ${bytes.toLocaleString()} bytes (${(bytes/1024).toFixed(2)} KB).`);
  console.log(bytes<=13312?`${13312-bytes} bytes below the eventual js13k target.`:`${bytes-13312} bytes above the eventual js13k target. Size is not enforced for this first pass.`);
}catch{console.error('Run npm run build first.');process.exitCode=1;}
