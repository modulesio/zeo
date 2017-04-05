#!/bin/bash

# This script builds the file structure for the Windows installer
# After it's done, generate the installer with Inno Setup (http://www.innosetup.com) using the script in setup.iss

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

pushd "$DIR"/../ >/dev/null;
rm -Rf pkg && mkdir -p pkg;
pushd pkg;
apt-get update;
apt-get install -y build-essential python aptitude;
aptitude clean;
aptitude --download-only -y install build-essential python;
cp /var/cache/apt/archives/*.deb .;
dpkg -i *.deb;
wget https://nodejs.org/dist/v7.8.0/node-v7.8.0-linux-x64.tar.gz;
tar -zxf node-v7.8.0-linux-x64.tar.gz && mv node-v7.8.0-linux-x64 node;
PATH="$(pwd)/node/bin:$PATH";
popd;
rm -Rf node_modules installed;
npm i --unsafe-perms && npm start -- install;
# rm -Rf data crypto .git;
./scripts/lib/install/symlink/pack-symlinks.sh >symlinks.txt;
cp scripts/lib/install/bin/* .;
popd >/dev/null;
