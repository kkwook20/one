#!/bin/bash

# Create .gitkeep files to maintain directory structure in git

echo "Creating .gitkeep files..."

# Data directories
touch data/projects/.gitkeep
touch data/references/.gitkeep
touch data/samples/.gitkeep
touch data/cache/.gitkeep
touch data/lora_datasets/.gitkeep
touch data/models/.gitkeep

# Config directories
touch config/nodes/.gitkeep
touch config/workflows/.gitkeep

# Logs directory
mkdir -p logs
touch logs/.gitkeep

echo "✅ .gitkeep files created successfully!"