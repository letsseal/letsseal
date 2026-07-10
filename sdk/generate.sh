#!/usr/bin/env bash
# Regenerate the language clients from openapi.json.
#
# Philosophy: the API is the product. These clients are GENERATED, not
# hand-maintained — regenerate them whenever the contract changes. The two
# hand-crafted hero SDKs (ts/, python/) are the exception and live outside this.
#
# Requires: Java 8+ and npx (uses @openapitools/openapi-generator-cli).
# The generator version is pinned in openapitools.json to 5.4.0 (the last release
# that runs on Java 8). If you have a modern JDK (11+), bump it there to 7.x for
# newer client styling (e.g. Java `native` HttpClient, .NET 8) — the flags below
# note the swaps.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/generated"

# Generator 5.4.0 (last Java-8 build) reads only OpenAPI 3.0; FastAPI emits 3.1.
# Down-convert to a throwaway 3.0 spec. On a modern JDK + generator 7.x, set
# spec="$here/openapi.json" and delete this line.
spec="$here/.openapi-3.0.json"
python3 "$here/to30.py" "$here/openapi.json" "$spec"

gen() { (cd "$here" && npx --yes @openapitools/openapi-generator-cli generate -i "$spec" "$@"); }

echo ">> Go"
gen -g go -o "$out/go" \
  --additional-properties=packageName=letsseal,isGoSubmodule=false,structPrefix=true,enumClassPrefix=true

echo ">> Java"   # okhttp-gson runs on Java 8; swap library=native under a JDK 11+ / gen 7.x
gen -g java -o "$out/java" \
  --additional-properties=library=okhttp-gson,groupId=org.letsseal,artifactId=letsseal-sdk,invokerPackage=org.letsseal.client,apiPackage=org.letsseal.client.api,modelPackage=org.letsseal.client.model,hideGenerationTimestamp=true

echo ">> PHP"
gen -g php -o "$out/php" \
  --additional-properties=invokerPackage=LetsSeal\\Client,packageName=letsseal-sdk

echo ">> Ruby"
gen -g ruby -o "$out/ruby" \
  --additional-properties=gemName=letsseal,moduleName=LetsSeal,gemHomepage=https://letsseal.org

echo ">> C#"    # csharp-netcore is the modern generator on 5.x; -> -g csharp + net8.0 on 7.x
gen -g csharp-netcore -o "$out/csharp" \
  --additional-properties=library=httpclient,packageName=LetsSeal.Client,targetFramework=net5.0

echo "done. Generated clients in $out/{go,java,php,ruby,csharp}"
echo "Note: Kotlin (kotlin), Rust (rust), Swift (swift5) generators are also available"
echo "      from the same spec if needed — add a gen line above."
