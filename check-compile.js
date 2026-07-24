const { execSync } = require('child_process');
try {
  console.log('Running TypeScript compiler...');
  const output = execSync('npx tsc --noEmit', { encoding: 'utf8' });
  console.log('TypeScript compilation successful!');
  console.log(output);
} catch (error) {
  console.error('TypeScript compilation failed:');
  console.error(error.stdout);
  console.error(error.stderr);
}