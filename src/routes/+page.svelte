<script lang="ts">
    import { onMount } from "svelte";
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
    }

    let chartData: ProcessedData | null = null;
    let error: string | null = null;

    const API_ENDPOINTS = {
        gexProfile: "http://localhost:9999/gex_profile",
        zeroGamma: "http://localhost:9999/zero_gamma",
        gexLevels: "http://localhost:9999/gex_levels",
        ohlc: "http://localhost:9999/ohlc_data",
    };

    function processData(
        gex: Record<string, GammaProfileData>,
        zeroGamma: ZeroGammaData,
        gexLevels: GexLevelsData,
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
                // from: Math.min(...gammaProfile.index),
                // to: Math.max(...gammaProfile.index),
                from: 0.8 * spotPrice, // Set lower bound to 80% of spot price
                to: 1.2 * spotPrice, // Set upper bound to 120% of spot price
            },
        };
    }

    onMount(async () => {
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
                fetch(API_ENDPOINTS.ohlc).then(
                    (r) => r.json() as Promise<OHLCData>,
                ),
            ]);
            // print each response to the console
            console.log(responses);
            chartData = processData(...responses);
            renderCharts();
        } catch (err) {
            error = (err as Error).message;
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
    {/if}
</div>

<style>
    /* Same styles as previous example */
</style>
