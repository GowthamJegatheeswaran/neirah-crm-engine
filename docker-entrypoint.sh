#!/bin/sh
# Apply pending migrations, then start the API.
set -e
echo "Running database migrations..."
node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
echo "Starting API..."
exec node dist/main
