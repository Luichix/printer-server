const fs = require('node:fs');
const path = require('node:path');
function createJobStore(directory) {
  const file = path.join(directory, 'jobs.json');
  return {
    load: () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [],
    save(jobs) {
      fs.mkdirSync(directory, { recursive: true });
      const temporary = file + '.tmp';
      const descriptor = fs.openSync(temporary, 'w', 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify(jobs)); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      fs.renameSync(temporary, file);
    },
  };
}
module.exports = { createJobStore };
