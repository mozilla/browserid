#!/bin/bash

# syntax:
# extract-po.sh

# TODO client.po and messages.po?
xgettext -L Perl --output-dir=locale/templates/LC_MESSAGES --output=messages.pot `find resources/static/shared/ -name '*.js'`
xgettext -L PHP --keyword=_ --output-dir=locale/templates/LC_MESSAGES --output=messages.pot `find resources -name '*.ejs'`