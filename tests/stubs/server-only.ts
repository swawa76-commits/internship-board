// In tests we run server modules in plain Node, so the RSC-only guard from
// the real `server-only` package is not desirable. Vitest aliases that
// package to this empty stub so imports succeed without a runtime error.
export {};
