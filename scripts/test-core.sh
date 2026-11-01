#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tools/tests
limit=$(python3 -c 'import json; print(json.load(open("config.json"))["maxPaddedSamples"])')
"${CXX:-c++}" -std=c++20 -DHAAR_MAX_PADDED="$limit" -O2 -Wall -Wextra -Werror cpp/haar.cpp cpp/test.cpp -o .tools/tests/haar-test
.tools/tests/haar-test
python3 tests/reference.py .tools/tests/haar-test
