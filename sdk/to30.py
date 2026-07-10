#!/usr/bin/env python3
"""Down-convert the canonical OpenAPI 3.1 spec (from FastAPI) to 3.0.3.

openapi-generator 5.4.0 — the last release that runs on Java 8 — only reads 3.0.
This touches only the two 3.1 constructs FastAPI emits for this service:

  * nullable via `anyOf: [X, {type: "null"}]`  ->  X + `nullable: true`
  * `examples: [v, ...]` on a schema            ->  `example: v`

Canonical source stays 3.1 (openapi.json). Under a modern JDK + generator 7.x you
can skip this and feed openapi.json directly. Usage: to30.py in.json out.json
"""
import json
import sys


def convert(node):
    if isinstance(node, list):
        return [convert(x) for x in node]
    if not isinstance(node, dict):
        return node

    if "anyOf" in node and isinstance(node["anyOf"], list):
        members = node["anyOf"]
        has_null = any(isinstance(m, dict) and m.get("type") == "null" for m in members)
        non_null = [m for m in members if not (isinstance(m, dict) and m.get("type") == "null")]
        if has_null and len(non_null) == 1:
            merged = {k: v for k, v in node.items() if k != "anyOf"}
            merged.update(non_null[0])
            merged["nullable"] = True
            return convert(merged)
        if has_null and len(non_null) > 1:
            node = {**node, "anyOf": non_null, "nullable": True}

    out = {}
    for k, v in node.items():
        out[k] = convert(v)
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    spec = json.load(open(src))
    spec = convert(spec)
    spec["openapi"] = "3.0.3"
    _fix_examples(spec)
    json.dump(spec, open(dst, "w"), indent=2, ensure_ascii=False)
    print(f"wrote {dst} (openapi 3.0.3)")


def _fix_examples(node):
    """Second pass: turn any surviving `examples` list into a single `example`."""
    if isinstance(node, list):
        for x in node:
            _fix_examples(x)
    elif isinstance(node, dict):
        if isinstance(node.get("examples"), list) and node["examples"]:
            node["example"] = node["examples"][0]
            del node["examples"]
        for v in node.values():
            _fix_examples(v)


if __name__ == "__main__":
    main()
