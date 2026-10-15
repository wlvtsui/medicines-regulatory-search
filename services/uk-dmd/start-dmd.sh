#!/bin/sh
set -eu

echo "Starting UK dm+d service..."
echo "DMD_DATA_DIR=${DMD_DATA_DIR:-/data}"
echo "Working directory: $(pwd)"

data_dir=${DMD_DATA_DIR:-/data}
pointer_file="$data_dir/current-db-path"

if [ ! -s "$pointer_file" ]; then
  echo "No imported dm+d database found. Run the dmd-import service first." >&2
  exit 1
fi

database_path=$(cat "$pointer_file")
case "$database_path" in
  "$data_dir"/dmd-*.db) ;;
  *)
    echo "Invalid database path in $pointer_file" >&2
    exit 1
    ;;
esac

if [ ! -s "$database_path" ]; then
  echo "The current dm+d database does not exist: $database_path" >&2
  exit 1
fi

export DMD_DB_PATH="$database_path"
exec clojure -M:run
