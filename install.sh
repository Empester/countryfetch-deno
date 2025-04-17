#!/bin/sh

deno install --global -f --allow-all -n countryfetch "$@" ./index.ts 
