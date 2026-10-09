#!/usr/bin/env bash
set -euo pipefail
package_name="$(node -p "require('./package.json').name")"
mkdir -p artifacts
# No credential is supplied: loading succeeds, execution stops before a paid API call.
docker run --rm --user root \
  -v "$PWD:/package:ro" \
  -e N8N_DIAGNOSTICS_ENABLED=false \
  -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -e N8N_TEMPLATES_ENABLED=false \
  -e PACKAGE_NAME="$package_name" \
  --entrypoint /bin/sh n8nio/n8n:2.42.3 -ec '
    mkdir -p "/home/node/.n8n/nodes/node_modules/$PACKAGE_NAME"
    cp -R /package/dist "/home/node/.n8n/nodes/node_modules/$PACKAGE_NAME/"
    cp /package/package.json "/home/node/.n8n/nodes/node_modules/$PACKAGE_NAME/"
    printf "{\"dependencies\":{\"%s\":\"0.1.0\"}}" "$PACKAGE_NAME" > /home/node/.n8n/nodes/package.json
    export NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules
    export N8N_USER_FOLDER=/home/node
    n8n import:workflow --input=/package/tests/load-workflow.json
    n8n execute --id=aceQwenImageSmokeTest
  ' > artifacts/n8n-load.log 2>&1 && status=0 || status=$?
if test "$status" -eq 0; then
  echo 'Expected execution to stop at missing credentials' >&2
  exit 1
fi
if grep -Eiq 'unrecognized node|unknown node|cannot find module|error loading|failed to load' artifacts/n8n-load.log; then
  echo 'The package could not load in n8n' >&2
  tail -n 30 artifacts/n8n-load.log >&2
  exit 1
fi
if ! grep -Eiq 'credential.*(not set|not found|missing|not configured|not available|required)|no credential|does not have any credentials' artifacts/n8n-load.log; then
  echo 'Execution did not stop at the expected credential boundary' >&2
  tail -n 30 artifacts/n8n-load.log >&2
  exit 1
fi
echo 'PASS: n8n loaded the package and stopped before any API call'
