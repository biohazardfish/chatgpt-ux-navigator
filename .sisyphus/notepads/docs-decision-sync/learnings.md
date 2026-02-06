# Learnings (docs-decision-sync)

> Append-only. Capture conventions, gotchas, and patterns discovered while updating docs.

## 2026-02-06

### Learnings
- "Blessed" and forks frame themselves as a "curses-like" Node.js terminal library with a high-level API, which matches the tone we want for describing a "minimal TUI shell" in our Nexus docs.
- Kubernetes KEPs use distinct "Non-Goals" and "Future work" sections to call out what the change deliberately does not cover, a good template for keeping SSE parsing or streaming UI out of the MVP narrative.

### References
- chjj/blessed README — https://github.com/chjj/blessed/blob/eab243fc7ad27f1d2932db6134f7382825ee3488/README.md#L3-L5
- embarklabs/neo-blessed README — https://github.com/embarklabs/neo-blessed/blob/fa63a5db0e0dfbc94d50fefd7703f574466b17db/README.md#L3-L5
- kubernetes/enhancements KEP 5598 — https://github.com/kubernetes/enhancements/blob/e65e31d5d42c7f6fb97c2046f78dc39a3010ef0c/keps/sig-scheduling/5598-opportunistic-batching/README.md#L197-L205
