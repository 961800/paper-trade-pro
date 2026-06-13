---
name: Hook queryKey rules
description: Generated Orval hooks that accept path/query params use a 2-arg signature — common mistake is passing options as first arg
---

## Rule
When a generated hook accepts route params or query params (e.g. `useGetPositions`, `useGetOrders`, `useGetTrades`, `useGetLeaderboard`, `useGetHeatmap`), the signature is:

```ts
useGetXxx(params: XxxParams, options?: { query?: UseQueryOptions })
```

Even if you don't need to set any params, you must pass an empty object as first arg:

```ts
// CORRECT
useGetOrders({}, { query: { queryKey: getGetOrdersQueryKey(), refetchInterval: 5000 } })

// WRONG — causes TS2353: 'query' does not exist in type 'GetOrdersParams'
useGetOrders({ query: { queryKey: ..., refetchInterval: 5000 } })
```

Hooks that take NO params (e.g. `useGetDashboard`, `useGetAnalyticsSummary`, `useGetIndices`) accept a single options object directly.

**Why:** Orval generates 1-arg vs 2-arg signatures based on whether the OpenAPI operation has parameters. This is not visible in the hook name — always check if there's a corresponding `XxxParams` type.

**How to apply:** Before using any hook with query options, grep for `export type GetXxxParams` in the generated schemas. If it exists, use the 2-arg form.
