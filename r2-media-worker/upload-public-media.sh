#!/usr/bin/env bash

set -euo pipefail

site_root="$(cd "$(dirname "$0")/.." && pwd)"
public_root="$site_root/public"
bucket="dosenepk"
origin="https://dosen-media.matiadosen.workers.dev"
cache_control="public, max-age=31536000, immutable"

content_type_for() {
  case "${1##*.}" in
    jpg|jpeg) printf '%s' 'image/jpeg' ;;
    png) printf '%s' 'image/png' ;;
    svg) printf '%s' 'image/svg+xml' ;;
    mp4) printf '%s' 'video/mp4' ;;
    mp3) printf '%s' 'audio/mpeg' ;;
    otf) printf '%s' 'font/otf' ;;
    *) printf '%s' 'application/octet-stream' ;;
  esac
}

upload_one() {
  local relative_path="$1"
  local source_path="$public_root/$relative_path"
  local local_size
  local headers_file
  local status
  local remote_size
  local content_type

  local_size="$(stat -f '%z' "$source_path")"
  headers_file="$(mktemp /tmp/dosen-r2-head.XXXXXX)"

  if ! status="$(curl --silent --show-error --head --output "$headers_file" --write-out '%{http_code}' "$origin/$relative_path")"; then
    rm -f "$headers_file"
    printf 'HEAD failed: %s\n' "$relative_path" >&2
    return 1
  fi

  if [[ "$status" == "200" ]]; then
    remote_size="$(awk 'BEGIN { IGNORECASE=1 } /^content-length:/ { gsub("\r", "", $2); print $2 }' "$headers_file" | tail -n 1)"
    rm -f "$headers_file"
    if [[ "$remote_size" == "$local_size" ]]; then
      printf 'SKIP exact-size match: %s\n' "$relative_path"
      return 0
    fi

    printf 'REFUSING overwrite: %s (local %s bytes, remote %s bytes)\n' "$relative_path" "$local_size" "${remote_size:-unknown}" >&2
    return 1
  fi

  rm -f "$headers_file"
  if [[ "$status" != "404" ]]; then
    printf 'Unexpected HEAD status %s: %s\n' "$status" "$relative_path" >&2
    return 1
  fi

  content_type="$(content_type_for "$relative_path")"
  WRANGLER_LOG_PATH="$site_root/.wrangler/wrangler.log" npx wrangler r2 object put \
    "$bucket/$relative_path" \
    --file "$source_path" \
    --content-type "$content_type" \
    --cache-control "$cache_control" \
    --storage-class Standard \
    --remote \
    --force
  printf 'UPLOADED: %s\n' "$relative_path"
}

if [[ "${1:-}" == "--one" ]]; then
  upload_one "$2"
  exit
fi

if [[ "${1:-}" == "--one-absolute" ]]; then
  upload_one "${2#"$public_root/"}"
  exit
fi

export PATH
find "$public_root" -type f -print0 \
  | xargs -0 -P 4 -n 1 "$0" --one-absolute
