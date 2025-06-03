#!/bin/bash

# Create project directory
mkdir -p neural-network-viz
cd neural-network-viz

# Create directory structure
mkdir -p src/js/core
mkdir -p src/js/shaders/vertex
mkdir -p src/js/shaders/fragment
mkdir -p src/js/utils
mkdir -p src/styles
mkdir -p public/textures

# Create empty files
touch src/js/core/NeuralNetwork.js
touch src/js/core/ParticleSystem.js
touch src/js/core/PostProcessing.js
touch src/js/shaders/vertex/particle.glsl
touch src/js/shaders/fragment/particle.glsl
touch src/js/shaders/fragment/glow.glsl
touch src/js/utils/Performance.js
touch src/js/utils/ResourceManager.js
touch src/js/main.js
touch src/styles/main.css
touch src/index.html
touch public/textures/particle.png
touch package.json
touch vite.config.js
touch vercel.json
touch .gitignore
touch README.md

echo "✅ Project structure created successfully!"
echo "📁 Navigate to: cd neural-network-viz"
echo "📝 Now copy the file contents from the previous responses"