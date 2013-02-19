#!/bin/sh

if [ ! -f $HOME/var/root.cert ] ; then
    echo ">> generating keypair"
    node scripts/postinstall.js
    mv var/root.cert var/root.secretkey $HOME/var
else
    echo ">> no keypair needed.  you gots one"
fi

node scripts/l10n-update.js

echo ">> generating production resources"
env CONFIG_FILES=config/aws.json scripts/compress

