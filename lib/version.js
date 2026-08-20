const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const pkg = require(path.join(PROJECT_ROOT, 'version.json'));

function readGit(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

// version.json's semver is bumped by hand on meaningful releases; the git
// commit is the actual source of truth for "which build is this machine
// running", since every machine updates independently via update.sh.
const commit = readGit('git rev-parse --short HEAD');
const commitDate = readGit('git log -1 --format=%cI');

const VERSION_INFO = {
  name: pkg.name,
  version: pkg.version,
  commit,
  commitDate,
  // The shell (and therefore which quick-command presets make sense) is
  // whatever this *server* is running on, not the browser's OS — those two
  // can differ (e.g. an iPhone opening a Mac's webcli).
  platform: process.platform,
};

module.exports = { VERSION_INFO };
