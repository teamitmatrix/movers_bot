const fs = require("fs");
const path = require("path");

const targetFile = path.join(
  process.cwd(),
  "node_modules",
  "openai",
  "src",
  "tsconfig.json"
);

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const content = fs.readFileSync(targetFile, "utf8");

if (content.includes('"ignoreDeprecations": "6.0"')) {
  process.exit(0);
}

const updatedContent = content.replace(
  '    "moduleResolution": "node"\n',
  '    "moduleResolution": "node",\n    "ignoreDeprecations": "6.0"\n'
);

if (updatedContent === content) {
  process.exit(0);
}

fs.writeFileSync(targetFile, updatedContent, "utf8");