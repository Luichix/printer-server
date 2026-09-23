// Personalizar una COPIA del Node base antes de pkg: así pkg calcula las
// posiciones del contenido sobre el binario final, sin desplazar su payload.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ResEdit = require('resedit');
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Genera el ejecutable en Windows x64.');
  if (process.env.PKG_NODE_PATH) throw new Error('Retira PKG_NODE_PATH para usar la base verificada del proyecto.');
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  const pkgRequire = createRequire(require.resolve('@yao-pkg/pkg'));
  const base = await pkgRequire('@yao-pkg/pkg-fetch').need({ nodeRange: 'node24', platform: 'win', arch: 'x64' });
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(base));
  const resources = ResEdit.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'assets/printer-server.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups.length ? groups : [{ id: 1, lang: 1033 }]) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map(item => item.data));
  }
  resources.outputResource(exe);
  const targetDirectory = path.join(root, 'dist/windows/base');
  fs.mkdirSync(targetDirectory, { recursive: true });
  // Conservar el nombre: pkg utiliza la versión del nombre del binario base.
  const customBase = path.join(targetDirectory, path.basename(base));
  fs.writeFileSync(customBase, Buffer.from(exe.generate()));
  process.env.PKG_NODE_PATH = customBase;
  try {
    await require('@yao-pkg/pkg').exec(['entry.cjs', '--config', 'package.json', '--targets', 'node24-win-x64', '--output', 'dist/windows/printer-server.exe']);
  } finally { delete process.env.PKG_NODE_PATH; }
  require('./windows-gui.cjs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
