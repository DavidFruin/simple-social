#!/bin/bash
# lint.sh - Code Quality Checks
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Code Quality Checks ===
"

# PHP Syntax Check
echo "Checking PHP syntax..."
php -l "$DIR/api.php" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✓ PHP syntax OK"
else
  echo "✗ PHP syntax errors found"
fi

# JS Syntax Check  
echo "Checking JS syntax..."
node --check "$DIR/app.js" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✓ JS syntax OK"
else
  echo "✗ JS syntax errors found"
fi

# Count lines of code
echo "
Code Statistics:"
echo "  PHP: $(wc -l < "$DIR/api.php") lines"
echo "  JS: $(wc -l < "$DIR/app.js") lines"

# Check max indentation
echo "
Indentation:"
echo "  PHP max: $(perl -lane 'print length($1) if /^(\s+)/' "$DIR/api.php" | sort -rn | head -1) spaces"
echo "  JS max: $(perl -lane 'print length($1) if /^(\s+)/' "$DIR/app.js" | sort -rn | head -1) spaces"

# Count functions
echo "
Functions:"
echo "  PHP: $(grep -c '^function ' "$DIR/api.php") functions"
echo "  JS: $(grep -c '^function \|^async function ' "$DIR/app.js") functions"

echo "
=== Checks Complete ==="