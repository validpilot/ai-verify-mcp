'use strict';

const pkg = require('../package.json');

const required = ['name', 'version', 'description', 'main', 'license', 'repository', 'bin', 'files'];
for (const r of required) {
  if (!pkg[r]) {
    console.log('Missing:', r);
    process.exit(1);
  }
}
console.log('package.json is valid');
