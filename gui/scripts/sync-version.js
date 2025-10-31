import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Project.toml (one level up from gui directory)
const projectTomlPath = join(__dirname, '../../Project.toml');
// Path to package.json (in gui directory)
const packageJsonPath = join(__dirname, '../package.json');

try {
  // Read Project.toml
  const projectTomlContent = readFileSync(projectTomlPath, 'utf-8');
  
  // Extract version using regex (format: version = "x.y.z")
  const versionMatch = projectTomlContent.match(/^version\s*=\s*["']?([^"'\s]+)["']?\s*$/m);
  
  if (!versionMatch) {
    throw new Error('Could not find version in Project.toml');
  }
  
  const version = versionMatch[1];
  
  // Read package.json
  const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  
  // Check if version needs updating
  if (packageJson.version === version) {
    console.log(`✓ Version already in sync: ${version}`);
    process.exit(0);
  }
  
  // Store old version for logging
  const oldVersion = packageJson.version;
  
  // Update version
  packageJson.version = version;
  
  // Write back to package.json with proper formatting (2 spaces indentation)
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  
  console.log(`✓ Updated package.json version from ${oldVersion} to ${version}`);
  
} catch (error) {
  console.error('Error syncing version:', error.message);
  process.exit(1);
}

