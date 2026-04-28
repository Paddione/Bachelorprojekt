#!/usr/bin/env bats
# tests/integration/einvoice-sidecar.bats — FA-30

@test "FA-30.1: einvoice-sidecar Service is reachable" {
  run kubectl -n workspace get svc einvoice-sidecar -o jsonpath='{.spec.clusterIP}'
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "FA-30.2: /embed returns PDF/A-3 with factur-x attachment" {
  PDF_B64=$(base64 -w0 website/test/fixtures/einvoice/sample.pdf)
  XML_B64=$(base64 -w0 website/test/fixtures/einvoice/regelbesteuerung-19.cii.xml)
  RESPONSE=$(kubectl -n workspace run curl-embed --image=curlimages/curl --rm -i --restart=Never --quiet -- \
    -s -X POST http://einvoice-sidecar/embed \
    -H 'Content-Type: application/json' \
    -d "{\"pdf\":\"$PDF_B64\",\"xml\":\"$XML_B64\"}")
  echo "$RESPONSE" | jq -r '.pdf' | base64 -d > /tmp/out.pdf
  run head -c 4 /tmp/out.pdf
  [ "$output" = "%PDF" ]
  run grep -c "factur-x.xml" /tmp/out.pdf
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "FA-30.3: /validate returns ok=true for golden output" {
  PDF_B64=$(base64 -w0 /tmp/out.pdf)
  RESPONSE=$(kubectl -n workspace run curl-validate --image=curlimages/curl --rm -i --restart=Never --quiet -- \
    -s -X POST http://einvoice-sidecar/validate \
    -H 'Content-Type: application/json' \
    -d "{\"pdf\":\"$PDF_B64\"}")
  run jq -r '.ok' <<< "$RESPONSE"
  [ "$output" = "true" ]
}
