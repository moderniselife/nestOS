#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// Get the root directory of the repository
const rootDir = execSync('git rev-parse --show-toplevel').toString().trim();

// Get the current version from package.json
const packageJsonPath = `${rootDir}/package.json`;
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Get the diff stats
const diffStats = execSync('git diff --shortstat HEAD^ HEAD || git diff --shortstat', { cwd: rootDir }).toString();
const match = diffStats.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

if (!match) {
  // No changes, keep current version
  console.log(currentVersion);
  process.exit(0);
}

const [, filesChanged, insertions = 0, deletions = 0] = match;
const totalChanges = parseInt(insertions) + parseInt(deletions);

// Calculate new version based on change size
let newVersion;
if (totalChanges > 1000) {
  // Major change
  newVersion = `${major + 1}.0.0`;
} else if (totalChanges > 100) {
  // Minor change
  newVersion = `${major}.${minor + 1}.0`;
} else {
  // Patch change
  newVersion = `${major}.${minor}.${patch + 1}`;
}

try {
  // Update package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  // Also update the version in the workspace packages
  const workspacePackages = ['control-panel', 'system-service', 'iso-builder'];
  for (const pkg of workspacePackages) {
    const pkgPath = `${rootDir}/packages/${pkg}/package.json`;
    if (fs.existsSync(pkgPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkgJson.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
    }
  }

  // Output the new version for GitHub Actions
  console.log(newVersion);
} catch (error) {
  console.error('Error updating version:', error);
  process.exit(1);
}