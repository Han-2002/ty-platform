---
description: "Wargaming console client plugin: a sidebar-footer menu entry that opens a frame-wide seat-cluster overlay, as the minimal pattern for adding menu modules."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-wargame

## Summary

`dsh-client-ui-wargame` is the minimal browser-side plugin for the wargaming console. It registers two additive entries — a `sidebar.footer.action` menu button and a `shell.overlay` frame-wide view — and shares one open/close store handle between them. The overlay renders a mock seat cluster (idle / executing / awaiting) to prove the end-to-end "add a menu module" pattern.

## Use this package

The plugin has no host-side behavior (`apply` is empty) and no model-facing surface. It composes UI only through `ctx.slots`:

- `ctx.slots.inject('sidebar.footer.action', ...)` contributes the menu trigger.
- `ctx.slots.inject('shell.overlay', ...)` contributes the overlay view.
- A single `createWargameStore()` handle is passed to both registrations so the trigger and overlay read/write the same `open` state.

## Model Experience

None — the plugin is pure presentation with mock data; it registers no model-facing tools, services, or KV-cache-affecting calls.

## Dev Note

None.
