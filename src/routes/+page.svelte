<script lang="ts">
    import { onMount } from "svelte";
    import { initDuckDB } from '$lib/duckdb';
    import * as duckdb from '@duckdb/duckdb-wasm';

    let db: duckdb.AsyncDuckDB | null = null;

    import { scale } from "vega";
    import vegaEmbed, { type Result } from "vega-embed";

    // Type definitions
    interface GammaProfileData {
        index: number[];
        "Gamma Profile All": number[];
        "Gamma Profile (Ex Next)": number[];
        "Gamma Profile (Ex Next Monthly)": number[];
    }

    interface ZeroGammaData {
        [key: string]: {
            index: number[];
            "Zero Gamma": number[];
        };
    }

    interface GexLevelsDuckData {
        dte: number[];
        strike: number[];
        total_call_gex: number[];
        total_put_gex: number[];
        total_gamma: number[];
    }

    interface GexLevelsData {
        [key: string]: {
            strike: number[];
            "Total Gamma": number[];
            "Total Gamma Call": number[];
            "Total Gamma Put": number[];
        };
    }

    interface OHLCData {
        Date: string[];
        Close: number[];
    }

    interface ProcessedData {
        strikes: number[];
        totalGamma: number[];
        calls: number[];
        puts: number[];
        index: number[];
        gammaAll: number[];
        gammaExNext: number[];
        gammaExMonthly: number[];
        spotPrice: number;
        zeroGamma: number;
        chartRange: {
            from: number;
            to: number;
        };
        duckData?: GexLevelsDuckData;
    }

    let chartData: ProcessedData | null = null;
    let error: string | null = null;

    const API_ENDPOINTS = {
        gexProfile: "http://localhost:9999/gex_profile",
        zeroGamma: "http://localhost:9999/zero_gamma",
        gexLevels: "http://localhost:9999/gex_levels",
        ohlc: "http://localhost:9999/ohlc_data",
        gexLevelsduck: "http://localhost:9999/gex_levels_duck?dte_min=0&dte_max=200&ticker=_SPX",
    };

    async function refetchData(): Promise<void> {
        try {
            const responses = await Promise.all([
                fetch(API_ENDPOINTS.gexProfile).then(
                    (r) =>
                        r.json() as Promise<Record<string, GammaProfileData>>,
                ),
                fetch(API_ENDPOINTS.zeroGamma).then(
                    (r) => r.json() as Promise<ZeroGammaData>,
                ),
                fetch(API_ENDPOINTS.gexLevels).then(
                    (r) => r.json() as Promise<GexLevelsData>,
                ),
                fetch(API_ENDPOINTS.gexLevelsduck).then(
                    (r) => r.json() as Promise<GexLevelsDuckData>,
                ),
                fetch(API_ENDPOINTS.ohlc).then(
                    (r) => r.json() as Promise<OHLCData>,
                ),
            ]);
            chartData = processData(...responses);
            renderCharts();
        } catch (err) {
            error = (err as Error).message;
        }
    }

    function processData(
        gex: Record<string, GammaProfileData>,
        zeroGamma: ZeroGammaData,
        gexLevels: GexLevelsData,
        gexLevelsDuck: GexLevelsDuckData,
        ohlc: OHLCData,
    ): ProcessedData {
        const gammaProfileKey = Object.keys(gex)[0];
        const zgKey = Object.keys(zeroGamma)[0];
        const glKey = Object.keys(gexLevels)[0];

        const gammaProfile = gex[gammaProfileKey];
        const zgData = zeroGamma[zgKey];
        const glData = gexLevels[glKey];
        const spotPrice = ohlc.Close[ohlc.Close.length - 1];

        return {
            strikes: glData.strike,
            totalGamma: glData["Total Gamma"],
            calls: glData["Total Gamma Call"],
            puts: glData["Total Gamma Put"],
            index: gammaProfile.index,
            gammaAll: gammaProfile["Gamma Profile All"],
            gammaExNext: gammaProfile["Gamma Profile (Ex Next)"],
            gammaExMonthly: gammaProfile["Gamma Profile (Ex Next Monthly)"],
            spotPrice: spotPrice,
            zeroGamma: zgData["Zero Gamma"][0],
            chartRange: {
                from: 0.8 * spotPrice, // Set lower bound to 80% of spot price
                to: 1.2 * spotPrice, // Set upper bound to 120% of spot price
            },
            duckData: gexLevelsDuck,
        };
    }

    // function to process the data from

    onMount(async () => {
        if (typeof window === 'undefined') {
            console.warn("⚠️ Running in SSR context, skipping DuckDB init.");
            return;
        }

        try {
            const responses = await Promise.all([
                fetch(API_ENDPOINTS.gexProfile).then(
                    (r) => r.json() as Promise<Record<string, GammaProfileData>>,
                ),
                fetch(API_ENDPOINTS.zeroGamma).then(
                    (r) => r.json() as Promise<ZeroGammaData>,
                ),
                fetch(API_ENDPOINTS.gexLevels).then(
                    (r) => r.json() as Promise<GexLevelsData>,
                ),
                fetch(API_ENDPOINTS.gexLevelsduck).then(
                    (r) => r.json() as Promise<GexLevelsDuckData>,
                ),
                fetch(API_ENDPOINTS.ohlc).then(
                    (r) => r.json() as Promise<OHLCData>,
                ),
            ]);
            console.log(responses);
            chartData = processData(...responses);
            renderCharts();
        } catch (err) {
            error = (err as Error).message;
        }

        // Moved inside the async function and after try-catch
        try {
            db = await initDuckDB();
            console.log("✅ DuckDB initialized"); // Debug line
            const conn = await db.connect();
            await conn.query("CREATE TABLE items(item TEXT)");
            await conn.query("INSERT INTO items VALUES ('apple'), ('banana')");
            const result = await conn.query("SELECT * FROM items");
            
            console.log("🦆 Query result:", result.toArray()); // Log result
        } catch (err) {
            console.error("❌ DuckDB error:", err); // Log full error
            error = `DuckDB init error: ${(err as Error).message}`;
        }
    });

    function renderCharts(): void {
        if (!chartData) return;

        // Chart 1
        vegaEmbed("#chart1", getChart1Spec(chartData));

        // Chart 2
        vegaEmbed("#chart2", getChart2Spec(chartData));

        // Chart 3
        vegaEmbed("#chart3", getChart3Spec(chartData));

        // NEW: Render Duck Chart
        vegaEmbed(
            "#duckChart",
            getDuckChartSpec(chartData, chartData!.duckData!),
        );
    }

    // Vega-Lite specifications with type annotations
    const getChart1Spec = (data: ProcessedData): any => ({
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: 800,
        height: 400,
        title: "Total Gamma: $ Bn per 1% SPX Move",
        data: {
            values: data.strikes.map((s, i) => ({
                strike: s,
                gamma: data.totalGamma[i],
            })),
        },
        transform: [
            {
                filter: {
                    and: [
                        { field: "strike", gte: 0.8 * data.spotPrice },
                        { field: "strike", lte: 1.2 * data.spotPrice },
                    ],
                },
            },
        ],
        layer: [
            {
                mark: {
                    type: "bar",
                    width: 6,
                    stroke: "black",
                    strokeWidth: 0.1,
                },
                encoding: {
                    x: {
                        field: "strike",
                        type: "quantitative",
                        title: "Strike",
                    },
                    y: {
                        field: "gamma",
                        type: "quantitative",
                        title: "Spot Gamma Exposure ($ billions/1% move)",
                    },
                    color: {
                        field: "gamma",
                        type: "quantitative",
                        title: "Gamma Value",
                        scale: { scheme: "blues" }, // Use a color scheme for the legend
                        legend: {
                            title: "Gamma Legend", // Customize the legend title
                            orient: "right", // Position the legend to the right
                        },
                    },
                },
            },
            {
                mark: { type: "rule", color: "red" },
                encoding: {
                    x: { datum: data.spotPrice },
                    color: {
                        field: "legendLabel",
                        type: "nominal",
                        scale: { range: ["red"] },
                        legend: { title: "Legend" },
                    },
                },
                data: { values: [{ legendLabel: "Spot Price" }] },
            },
            {
                mark: { type: "rule", color: "blue" },
                encoding: {
                    x: { datum: data.zeroGamma, title: "" },
                    color: {
                        field: "legendLabel",
                        type: "nominal",
                        scale: { range: ["green"] },
                        legend: { title: "Legend" },
                    },
                },
                data: { values: [{ legendLabel: "Zero Gamma" }] },
            },
        ],
    });

    const getChart2Spec = (data: ProcessedData): any => ({
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: 800,
        height: 400,
        title: "Total Gamma: $ Bn per 1% SPX Move",
        data: {
            values: data.strikes.flatMap((s, i) => [
                { strike: s, gamma: data.calls[i], type: "Call" },
                { strike: s, gamma: data.puts[i], type: "Put" },
            ]),
        },
        transform: [
            {
                filter: {
                    and: [
                        { field: "strike", gte: 0.8 * data.spotPrice },
                        { field: "strike", lte: 1.2 * data.spotPrice },
                    ],
                },
            },
        ],
        encoding: {
            x: { field: "strike", type: "quantitative", title: "Strike" },
        },
        layer: [
            {
                mark: {
                    type: "bar",
                    width: 6,
                    stroke: "black",
                    strokeWidth: 0.1,
                },
                encoding: {
                    y: {
                        field: "gamma",
                        type: "quantitative",
                        title: "Spot Gamma Exposure ($ billions/1% move)",
                    },
                    color: {
                        field: "type",
                        scale: { range: ["#1f77b4", "#ff7f0e"] },
                    },
                },
            },
            {
                mark: { type: "rule", color: "red" },
                encoding: { x: { datum: data.spotPrice } },
            },
            {
                mark: { type: "rule", color: "green" },
                encoding: { x: { datum: data.zeroGamma } },
            },
        ],
    });

    const getChart3Spec = (data: ProcessedData): any => ({
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: 800,
        height: 400,
        title: `Gamma Exposure Profile, SPX, ${new Date().toLocaleDateString(
            "en-GB",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            },
        )}`,
        data: {
            values: data.index.flatMap((price, i) => [
                { price, gamma: data.gammaAll[i], profileType: "All Expiries" },
                {
                    price,
                    gamma: data.gammaExNext[i],
                    profileType: "Ex-Next Expiry",
                },
                {
                    price,
                    gamma: data.gammaExMonthly[i],
                    profileType: "Ex-Next Monthly",
                },
            ]),
        },
        encoding: {
            x: {
                field: "price",
                type: "quantitative",
                title: "Index Price",
                scale: { domain: [data.chartRange.from, data.chartRange.to] },
            },
            y: {
                field: "gamma",
                type: "quantitative",
                title: "Gamma Exposure ($ billions/1% move)",
            },
            color: {
                field: "profileType",
                scale: {
                    range: ["#1f77b4", "#ff7f0e", "#2ca02c"],
                },
            },
        },
        layer: [
            { mark: "line" },
            {
                mark: { type: "rule", color: "red" },
                encoding: { x: { datum: data.spotPrice } },
            },
            {
                mark: { type: "rule", color: "green" },
                encoding: { x: { datum: data.zeroGamma } },
            },
            {
                mark: { type: "rule", color: "grey" },
                encoding: { y: { datum: 0 } },
            },
        ],
    });

    const getDuckChartSpec = (
        data: ProcessedData,
        duckData: GexLevelsDuckData,
    ): any => ({
        $schema: "https://vega.github.io/schema/vega-lite/v6.json",
        width: 800,
        height: 400,
        title: "GEX Duck Data Overview (Aggregated by Strike)",
        data: {
            values: duckData.strike.map((strike, i) => ({
                strike,
                callGex: duckData.total_call_gex[i],
                putGex: duckData.total_put_gex[i],
                dte: duckData.dte ? duckData.dte[i] : undefined,
            })),
        },
        transform: [
            {
                filter: {
                    and: [
                        { field: "strike", gte: 0.8 * data.spotPrice },
                        { field: "strike", lte: 1.2 * data.spotPrice },
                    ],
                },
            },
            // Aggregate callGex and putGex by strike
            {
                joinaggregate: [
                    { op: "sum", field: "callGex", as: "callGexSum" },
                    { op: "sum", field: "putGex", as: "putGexSum" },
                ],
                groupby: ["strike"],
            },
            // Optional: rename fields for clarity
            {
                calculate: "datum.callGexSum",
                as: "callGex",
            },
            {
                calculate: "datum.putGexSum",
                as: "putGex",
            },
            // Filter out rows where both callGex and putGex are zero
            {
                filter: "datum.callGex !== 0 || datum.putGex !== 0",
            },
            {
                calculate: "'aggregated'",
                as: "tooltipNote",
            },
        ],
        encoding: {
            x: {
                field: "strike",
                type: "quantitative",
                title: "Strike Price",
            },
            y: {
                field: "callGex",
                type: "quantitative",
                title: "Total Call GEX (Sum)",
                scale: { scheme: "blues" },
                legend: { title: "Sum of Gamma Call" },
            },
            color: {
                field: "putGex",
                type: "quantitative",
                title: "Total Put GEX (Sum)",
                scale: { scheme: "reds" },
                legend: { title: "Sum of Gamma Put" },
            },
            tooltip: [
                { field: "strike", type: "quantitative", title: "Strike" },
                {
                    field: "callGex",
                    type: "quantitative",
                    title: "Call GEX Sum",
                },
                { field: "putGex", type: "quantitative", title: "Put GEX Sum" },
                { datum: "Aggregated across DTEs", title: "Note" },
            ],
        },
        layer: [
            {
                mark: {
                    type: "bar",
                    width: 8,
                    stroke: "black",
                    strokeWidth: 0.2,
                },
            },
        ],
        config: {
            axis: {
                labelAngle: 0,
            },
        },
    });
</script>

// src/routes/+page.svelte
<div class="container">
    {#if error}
        <div class="error">{error}</div>
    {:else if !chartData}
        <div class="loading">Loading market data...</div>
    {:else}
        <div id="chart1"></div>
        <div id="chart2"></div>
        <div id="chart3"></div>
        <div id="duckChart"></div>
    {/if}
    <button on:click={refetchData}>Refetch Data</button>
</div>

<style>
    /* Same styles as previous example */
</style>
