# vue-stream-dashboard

A realtime dashboard built on one rule: **high-frequency data should not
directly drive the Vue render loop.**

[![ci](https://github.com/mykolapodpriatov/vue-stream-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/mykolapodpriatov/vue-stream-dashboard/actions/workflows/ci.yml)
![Vue 3.5](https://img.shields.io/badge/Vue-3.5-42b883)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

```
incoming events → normalizer → ring buffer → requestAnimationFrame
    → batched snapshot → shallowRef → visible window → DOM
```

Work in progress. The scaffold is here; the pipeline, sources and screens land
in the pull requests that follow.

## Quick start

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm run verify` runs the same lint, typecheck, test and build steps as CI.
