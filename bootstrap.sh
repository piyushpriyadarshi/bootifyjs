#!/bin/bash

echo "🚀 Bootstrapping Backend Monorepo..."

# Create root structure
mkdir -p my-backend-monorepo/{packages,packages/workers}
cd my-backend-monorepo

# Create root package.json
cat > package.json <<EOL
{
  "name": "my-backend-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "packages/workers/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev": "npm run dev --workspaces",
    "clean": "find . -name \"dist\" -type d -exec rm -rf {} +"
  }
}
EOL

# Create shared tsconfig
cp ../tsconfig.base.json .  # assuming you saved it next to bootstrap.sh
# OR paste inline:
cat > tsconfig.base.json <<EOL
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "lib": ["ES2021"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  },
  "exclude": ["node_modules", "dist"]
}
EOL

# Function to create package
create_package() {
  local dir=$1
  local name=$2
  local deps=$3

  mkdir -p "$dir/src"
  
  cat > "$dir/package.json" <<EOF
{
  "name": "$name",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    $deps
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF

  # Extend base tsconfig
  cat > "$dir/tsconfig.json" <<EOF
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"],
  "references": []
}
EOF

  # Create dummy index.ts
  echo "console.log('Hello from $name');" > "$dir/src/index.ts"

  if [ "$name" = "@myorg/commons" ]; then
    echo "export const add = (a: number, b: number): number => a + b;" > "$dir/src/utils.ts"
    echo "export * from './utils';" > "$dir/src/index.ts"
  fi
}

# Create packages
create_package "packages/commons" "@myorg/commons" ""
create_package "packages/cms" "@myorg/cms" "\"@myorg/commons\": \"*\""
create_package "packages/consumer" "@myorg/consumer" "\"@myorg/commons\": \"*\""
create_package "packages/adminportal" "@myorg/adminportal" ""

# Create workers
create_package "packages/workers/notification" "@myorg/notification-worker" ""
create_package "packages/workers/code-processor" "@myorg/code-processor-worker" ""

# Add references for projects depending on commons
echo '  "references": [{ "path": "../commons" }]' >> packages/cms/tsconfig.json
echo '  "references": [{ "path": "../commons" }]' >> packages/consumer/tsconfig.json

# Install dependencies
echo "📦 Installing root dependencies..."
npm init -y >/dev/null 2>&1
npm install typescript --save-dev

echo "🏗️  Linking workspaces..."
npm install

echo "✅ Done! Run:"
echo "   cd my-backend-monorepo"
echo "   npm run build     # Build all"
echo "   npm run dev       # Watch all"
echo "   npm run clean     # Clean dist folders"

echo "📁 Your monorepo is ready at ./my-backend-monorepo"
