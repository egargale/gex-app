<!-- src/routes/+page.svelte -->
<script>
    import { onMount } from 'svelte';
    import vegaEmbed from 'vega-embed';
  
    let chartData = null;
    let error = null;
    
    // Configuration
    const API_ENDPOINTS = {
      gexProfile: 'http://localhost:9999/gex_profile',
      zeroGamma: 'http://localhost:9999/zero_gamma',
      gexLevels: 'http://localhost:9999/gex_levels',
      ohlc: 'http://localhost:9999/ohlc_data'
    };
  
    const processData = (responses) => {
      const [gex, zeroGamma, gexLevels, ohlc] = responses;
      
      // Extract data with optional chaining
      const gammaProfile = gex[Object.keys(gex)[0]];
      const zgData = zeroGamma[Object.keys(zeroGamma)[0]];
      const glData = gexLevels[Object.keys(gexLevels)[0]];
      
      return {
        strikes: glData?.strike || [],
        totalGamma: glData?.["Total Gamma"] || [],
        calls: glData?.["Total Gamma Call"] || [],
        puts: glData?.["Total Gamma Put"] || [],
        index: gammaProfile?.index || [],
        gammaAll: gammaProfile?.["Gamma Profile All"] || [],
        gammaExNext: gammaProfile?.["Gamma Profile (Ex Next)"] || [],
        gammaExMonthly: gammaProfile?.["Gamma Profile (Ex Next Monthly)"] || [],
        spotPrice: ohlc?.Close?.[ohlc.Close.length - 1] || 0,
        zeroGamma: zgData?.["Zero Gamma"]?.[0] || 0,
        chartRange: {
          from: Math.min(...(gammaProfile?.index || [0])),
          to: Math.max(...(gammaProfile?.index || [0]))
        }
      };
    };
  
    onMount(async () => {
      try {
        const responses = await Promise.all([
          fetch(API_ENDPOINTS.gexProfile).then(r => r.json()),
          fetch(API_ENDPOINTS.zeroGamma).then(r => r.json()),
          fetch(API_ENDPOINTS.gexLevels).then(r => r.json()),
          fetch(API_ENDPOINTS.ohlc).then(r => r.json())
        ]);
        
        chartData = processData(responses);
        renderCharts();
      } catch (err) {
        error = err.message;
      }
    });
  
    function renderCharts() {
      // Chart 1: Absolute Gamma Exposure
      vegaEmbed('#chart1', getChart1Spec());
      // Chart 2: Calls/Puts
      vegaEmbed('#chart2', getChart2Spec());
      // Chart 3: Profile
      vegaEmbed('#chart3', getChart3Spec());
    }
  
    // Vega-Lite specifications
    const getChart1Spec = () => ({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 800,
      height: 400,
      title: 'Total Gamma: $ Bn per 1% SPX Move',
      data: { values: chartData.strikes.map((s, i) => ({ strike: s, gamma: chartData.totalGamma[i] })) },
      layer: [
        {
          mark: { type: 'bar', width: 6, stroke: 'black', strokeWidth: 0.1 },
          encoding: {
            x: { field: 'strike', type: 'quantitative', title: 'Strike' },
            y: { field: 'gamma', type: 'quantitative', title: 'Spot Gamma Exposure ($ billions/1% move)' }
          }
        },
        // Vertical lines
        { mark: { type: 'rule', color: 'red' }, encoding: { x: { datum: chartData.spotPrice } } },
        { mark: { type: 'rule', color: 'green' }, encoding: { x: { datum: chartData.zeroGamma } } }
      ]
    });
  
    // Similar functions for getChart2Spec and getChart3Spec
    // (Implement following the pattern from previous examples)
  </script>
  
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
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .loading, .error {
      padding: 2rem;
      text-align: center;
      font-size: 1.2rem;
    }
    
    .error {
      color: #dc3545;
    }
  </style>