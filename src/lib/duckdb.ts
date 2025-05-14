import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

// Select a bundle based on browser checks
export async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
    try {
        console.log("🔍 Selecting DuckDB bundle...");
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

        console.log("👷 Starting worker with:", bundle.mainWorker);
        const worker = new Worker(bundle.mainWorker!);

        const logger = new duckdb.ConsoleLogger();
        const db = new duckdb.AsyncDuckDB(logger, worker);

        console.log("📥 Instantiating DuckDB with module:", bundle.mainModule);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        console.log("🎉 DuckDB ready!");
        return db;
    } catch (err) {
        console.error("❌ Failed to initialize DuckDB:", err);
        throw err;
    }
}