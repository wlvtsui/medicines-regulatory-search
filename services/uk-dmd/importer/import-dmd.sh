#!/bin/sh
set -eu

api_key_file=/run/secrets/trud_api_key
data_dir=/data
cache_dir=/cache

if [ ! -s "$api_key_file" ]; then
  echo "TRUD_API_KEY secret is missing or empty." >&2
  exit 1
fi

mkdir -p "$data_dir" "$cache_dir"
database_path="$data_dir/dmd-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"

java -jar /opt/dmd/dmd-server.jar latest \
  --api-key "$api_key_file" \
  --cache-dir "$cache_dir" \
  --db "$database_path"

if [ ! -s "$database_path" ]; then
  echo "The dm+d importer did not create the expected database: $database_path" >&2
  exit 1
fi

printf '%s\n' "$database_path" > "$data_dir/current-db-path.tmp"
mv "$data_dir/current-db-path.tmp" "$data_dir/current-db-path"
echo "Imported dm+d database to $database_path"