import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Project.toml (one level up from gui directory)
const projectTomlPath = join(__dirname, '../../Project.toml');
// Path to package.json (in gui directory)
const packageJsonPath = join(__dirname, '../package.json');
// Path to package-lock.json (in gui directory)
const packageLockJsonPath = join(__dirname, '../package-lock.json');

try {
  // Read Project.toml
  const projectTomlContent = readFileSync(projectTomlPath, 'utf-8');
  
  // Extract version using regex (format: version = "x.y.z")
  const versionMatch = projectTomlContent.match(/^version\s*=\s*["']?([^"'\s]+)["']?\s*$/m);
  
  if (!versionMatch) {
    throw new Error('Could not find version in Project.toml');
  }

  const version = versionMatch[1];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version in Project.toml: ${version}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  if (typeof packageJson?.version !== 'string') {
    throw new Error('package.json must contain a root version string');
  }

  const packageLockJson = JSON.parse(readFileSync(packageLockJsonPath, 'utf-8'));
  const lockRootPackage = packageLockJson?.packages?.[''];
  if (typeof packageLockJson?.version !== 'string' || typeof lockRootPackage?.version !== 'string') {
    throw new Error('package-lock.json must contain root and packages[""] version strings');
  }

  const changedFiles = [];

  if (packageJson.version !== version) {
    packageJson.version = version;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    changedFiles.push('package.json');
  }

  if (packageLockJson.version !== version || lockRootPackage.version !== version) {
    packageLockJson.version = version;
    lockRootPackage.version = version;
    writeFileSync(packageLockJsonPath, JSON.stringify(packageLockJson, null, 2) + '\n', 'utf-8');
    changedFiles.push('package-lock.json');
  }

  if (changedFiles.length === 0) {
    console.log(`✓ Version already in sync: ${version}`);
  } else {
    console.log(`✓ Synchronized ${changedFiles.join(' and ')} to version ${version}`);
  }
} catch (error) {
  console.error('Error syncing version:', error.message);
  process.exit(1);
}
