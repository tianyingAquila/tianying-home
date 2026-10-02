#!/bin/sh
set -eu
archive=$1
expected=$2
root=${TIANYING_DEPLOY_ROOT:-/www/wwwroot/tianying}
stage=$(mktemp -d /tmp/tianying-release.XXXXXX)
backup=$(mktemp -d /tmp/tianying-rollback.XXXXXX)
changed=0
cleanup() {
    status=$?
    if [ "$status" -ne 0 ] && [ "$changed" -eq 1 ]; then
        cp -a "$backup/previous/." "$root/"
        while IFS= read -r file; do rm -f "$root/$file"; done < "$backup/added"
        while IFS= read -r dir; do rmdir "$root/$dir" 2>/dev/null || :; done < "$backup/added-dirs"
        echo 'Publish failed; previous files restored.' >&2
    fi
    rm -rf "$stage" "$backup"
    rm -f "$archive"
    exit "$status"
}
trap cleanup EXIT
actual=$(sha256sum "$archive" | cut -d ' ' -f 1)
[ "$actual" = "$expected" ]
tar -xzf "$archive" -C "$stage"
cd "$stage"
for file in ./*.php cron/*.php; do
    /www/server/php/82/bin/php -l "$file" >/dev/null
done
/usr/bin/node tools/check_release.js
for version in assets/js/game/tower/versions/*; do
    if [ -d "$root/$version" ]; then diff -qr "$version" "$root/$version"; fi
done
find . -type f ! -name release.json ! -name release.sha256 -exec sha256sum '{}' \; > release.sha256
mkdir "$backup/previous"
: > "$backup/added"
: > "$backup/added-dirs"
find . -depth -type d | while IFS= read -r dir; do
    if [ ! -d "$root/$dir" ]; then printf '%s\n' "$dir"; fi
done > "$backup/added-dirs"
find . -type f > "$backup/files"
while IFS= read -r file; do
    if [ -f "$root/$file" ]; then
        mkdir -p "$backup/previous/$(dirname "$file")"
        cp -a "$root/$file" "$backup/previous/$file"
    else
        printf '%s\n' "$file" >> "$backup/added"
    fi
done < "$backup/files"
chown -R www:www "$stage"
changed=1
# Install immutable engines before pages referencing them.
for tree in assets tools cron; do
    find "$tree" -type f | while IFS= read -r file; do
        mkdir -p "$root/$(dirname "$file")"
        cp -a "$file" "$root/$file.new"
        mv -f "$root/$file.new" "$root/$file"
    done
done
for file in storage.php config.php steam.php; do
    cp -a "$file" "$root/$file.new"
    mv -f "$root/$file.new" "$root/$file"
done
for file in api.php admin.php ./*.html favicon.ico robots.txt sitemap.xml; do
    file=$(basename "$file")
    cp -a "$file" "$root/$file.new"
    mv -f "$root/$file.new" "$root/$file"
done
cp release.sha256 "$root/release.sha256"
cp release.json "$root/release.json"
cd "$root"
sha256sum -c release.sha256 >/dev/null
echo DEPLOY-OK
